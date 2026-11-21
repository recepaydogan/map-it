import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { unzipSync } from "fflate";
import { readRecipeFileSource } from "./recipe-source-files.mjs";
import { readInstalledBedrockSource } from "./installed-bedrock-source.mjs";

/** Download immutable source snapshots into a development cache; extract no archive paths to disk. */
export const readRecipeArchive = async source => {
  if (source.fetchMode === "installed") return readInstalledBedrockSource(source,
    source.includePrefixes ?? [source.recipePrefix, source.tagPrefix].filter(Boolean));
  if (source.fetchMode === "files") return readRecipeFileSource(source);
  const root = resolve("node_modules/.cache/recipe-sources"); await mkdir(root, { recursive: true });
  if (!/^[a-f0-9]{40}$/.test(source.revision) || !/^[\w.-]+\/[\w.-]+$/.test(source.repository)) throw new Error("Invalid pinned recipe source");
  const file = resolve(root, `${source.edition}-${source.revision}.zip`);
  let archive;
  try { archive = new Uint8Array(await readFile(file)); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    const response = await fetch(`https://codeload.github.com/${source.repository}/zip/${source.revision}`, { signal: AbortSignal.timeout(120000) });
    if (!response.ok || !response.body) throw new Error(`Recipe source download failed: ${response.status}`);
    const reader = response.body.getReader(), parts = []; let size = 0;
    try {
      for (;;) {
        const next = await reader.read(); if (next.done) break;
        size += next.value.byteLength;
        if (size > 128 * 1024 * 1024) throw new Error("Recipe source archive exceeds download budget");
        parts.push(next.value);
      }
    } catch (error) { await reader.cancel(error); throw error; }
    finally { reader.releaseLock(); }
    archive = new Uint8Array(size); let offset = 0;
    for (const part of parts) { archive.set(part, offset); offset += part.length; }
    await writeFile(file, archive);
  }
  if (archive.byteLength > 128 * 1024 * 1024) throw new Error("Cached recipe archive exceeds byte budget");
  let selectedBytes = 0;
  const prefixes = source.includePrefixes ?? [source.recipePrefix, source.tagPrefix].filter(Boolean);
  const selected = unzipSync(archive, { filter(entry) {
    const path = entry.name.split("/").slice(1).join("/");
    if (!path.endsWith(".json") || !prefixes.some(prefix => path.startsWith(prefix))) return false;
    if (path.split("/").some(part => part === ".." || part === ".") || path.includes("\\")) throw new Error("Unsafe archive path");
    selectedBytes += entry.originalSize;
    if (entry.originalSize > 512 * 1024 || selectedBytes > 32 * 1024 * 1024) throw new Error("Recipe JSON expansion budget exceeded");
    return true;
  } });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  return { archiveSha256: createHash("sha256").update(archive).digest("hex"), files: Object.entries(selected).map(([name, bytes]) => ({
    path: name.split("/").slice(1).join("/"), text: decoder.decode(bytes), sha256: createHash("sha256").update(bytes).digest("hex"),
  })).sort((left, right) => left.path.localeCompare(right.path, "en")) };
};
