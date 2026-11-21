import { createHash } from "node:crypto";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { GAME_GUIDE_LANGUAGE_SOURCE } from "../src/game-config.ts";
import english from "../src/features/knowledge/guide-names.json" with { type: "json" };

const source = GAME_GUIDE_LANGUAGE_SOURCE;
const assetRoot = process.env.APPDATA && join(process.env.APPDATA, ".minecraft", "assets");
const sourceKeys = Object.keys(english);

const sha1 = bytes => createHash("sha1").update(bytes).digest("hex");
const readVerified = async (path, expectedHash) => {
  if (!path) return null;
  try {
    const bytes = await readFile(path);
    if (sha1(bytes) !== expectedHash) throw new Error(`Hash mismatch: ${path}`);
    return bytes;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
};
const downloadVerified = async (url, expectedHash) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Language source download failed: ${url} (${response.status})`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (sha1(bytes) !== expectedHash) throw new Error(`Language source hash mismatch: ${url}`);
  return bytes;
};

const indexPath = assetRoot && join(assetRoot, "indexes", "34.json");
const indexBytes = await readVerified(indexPath, source.assetIndexSha1)
  ?? await downloadVerified(source.assetIndexUrl, source.assetIndexSha1);
const index = JSON.parse(indexBytes.toString("utf8"));
const destination = resolve("public", "knowledge-data", "java", source.version, "languages");
await mkdir(destination, { recursive: true });

const provenance = { version: source.version, assetIndex: { url: source.assetIndexUrl,
  sha1: source.assetIndexSha1 }, languages: {} };
for (const [locale, gameCode] of Object.entries(source.localeCodes)) {
  if (locale === "en") continue;
  const assetPath = `minecraft/lang/${gameCode}.json`;
  const asset = index.objects?.[assetPath];
  if (!asset?.hash) throw new Error(`Minecraft does not provide ${assetPath} in ${source.version}`);
  const path = assetRoot && join(assetRoot, "objects", asset.hash.slice(0, 2), asset.hash);
  const bytes = await readVerified(path, asset.hash)
    ?? await downloadVerified(`https://resources.download.minecraft.net/${asset.hash.slice(0, 2)}/${asset.hash}`, asset.hash);
  const translations = JSON.parse(bytes.toString("utf8"));
  const selected = Object.fromEntries(sourceKeys.flatMap(key =>
    typeof translations[key] === "string" && translations[key].trim() ? [[key, translations[key]]] : []));
  await writeFile(join(destination, `${locale}.json`), `${JSON.stringify(selected)}\n`);
  provenance.languages[locale] = { assetPath, sha1: asset.hash, keys: Object.keys(selected).length };
  console.log(`${locale}: ${Object.keys(selected).length}/${sourceKeys.length} game terms`);
}
await writeFile(join(destination, "source.json"), `${JSON.stringify(provenance, null, 2)}\n`);
