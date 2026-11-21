import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Reads a bounded JSON-only subset from an immutable GitHub tree and verifies every Git blob. */
export const readPinnedJsonSource = async (source, prefixes, label = "source") => {
  if (!/^[a-f0-9]{40}$/.test(source.revision) || !/^[\w.-]+\/[\w.-]+$/.test(source.repository)
    || !Array.isArray(prefixes) || !prefixes.length || prefixes.some(prefix => !prefix || prefix.includes("..") || prefix.includes("\\")))
    throw new Error(`Invalid pinned ${label} source`);
  const root = resolve("node_modules/.cache/pinned-json", source.revision); await mkdir(root, { recursive: true });
  const response = await fetch(`https://api.github.com/repos/${source.repository}/git/trees/${source.revision}?recursive=1`,
    { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${label} tree request failed: ${response.status}`);
  const tree = await response.json();
  if (tree.truncated || !Array.isArray(tree.tree) || tree.sha !== source.revision) throw new Error(`Incomplete or mismatched ${label} tree`);
  const entries = tree.tree.filter(entry => entry.type === "blob" && entry.path.endsWith(".json")
    && prefixes.some(prefix => entry.path.startsWith(prefix)));
  if (!entries.length || entries.length > 5000 || entries.reduce((sum, entry) => sum + entry.size, 0) > 32 * 1024 * 1024)
    throw new Error(`${label} source tree exceeds limits`);
  let next = 0, completed = 0;
  const files = new Array(entries.length);
  await Promise.all(Array.from({ length: 8 }, async () => {
    for (;;) {
      const index = next++; if (index >= entries.length) return;
      const entry = entries[index];
      if (!/^[a-f0-9]{40}$/.test(entry.sha) || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 512 * 1024
        || entry.path.split("/").some(part => part === ".." || part === ".")) throw new Error(`Invalid ${label} blob entry`);
      const cache = resolve(root, `${entry.sha}.json`); let bytes;
      try { bytes = await readFile(cache); }
      catch (error) {
        if (error.code !== "ENOENT") throw error;
        const download = await fetch(`https://raw.githubusercontent.com/${source.repository}/${source.revision}/${entry.path}`,
          { signal: AbortSignal.timeout(30000) });
        if (!download.ok || !download.body) throw new Error(`${label} blob request failed: ${download.status} ${entry.path}`);
        const reader = download.body.getReader(), parts = []; let size = 0;
        try {
          for (;;) {
            const part = await reader.read(); if (part.done) break; size += part.value.length;
            if (size > entry.size) throw new Error(`${label} blob exceeds recorded size`); parts.push(part.value);
          }
        } catch (error) { await reader.cancel(error); throw error; }
        finally { reader.releaseLock(); }
        bytes = Buffer.concat(parts);
        if (bytes.length !== entry.size) throw new Error(`${label} blob size mismatch`);
        const gitHash = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
        if (gitHash !== entry.sha) throw new Error(`${label} blob content does not match pinned tree`);
        await writeFile(cache, bytes);
      }
      if (createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex") !== entry.sha)
        throw new Error(`Cached ${label} blob hash mismatch`);
      files[index] = { path: entry.path, text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        sha256: createHash("sha256").update(bytes).digest("hex") };
      if (++completed % 200 === 0) console.log(`${label} files: ${completed}/${entries.length}`);
    }
  }));
  files.sort((left, right) => left.path.localeCompare(right.path, "en"));
  return files;
};
