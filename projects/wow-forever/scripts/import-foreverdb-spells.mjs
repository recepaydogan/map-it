import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://foreverdb.net/data";
const OUTPUT = path.resolve("public/data/spells/foreverdb");
const SHARD_COUNT = 64;

async function readJson(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { "User-Agent": "WoWForeverMap content import" } });
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
}

const index = await readJson(`${BASE}/spells.json`);
const [classes, effectNames] = await Promise.all([
  readJson(`${BASE}/classes.json`),
  readJson(`${BASE}/spelleffects.json`),
]);
if (!Array.isArray(index) || index.length < 30000 || index.some((row) => !Array.isArray(row) || !Number.isInteger(row[0]) || !row[1])) {
  throw new Error("ForeverDB spell index has an unexpected format or size.");
}
const expectedIds = new Set(index.map((row) => row[0]));
if (expectedIds.size !== index.length) throw new Error("Duplicate spell IDs in the index.");

const shards = Array.from({ length: SHARD_COUNT }, () => null);
let next = 0;
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < SHARD_COUNT) {
    const shardId = next++;
    const records = await readJson(`${BASE}/spells/${shardId}.json`);
    if (!records || typeof records !== "object" || Array.isArray(records)) throw new Error(`Invalid shard ${shardId}`);
    for (const [key, spell] of Object.entries(records)) {
      const id = Number(key);
      if (!expectedIds.has(id) || id % SHARD_COUNT !== shardId || spell?.id !== id) {
        throw new Error(`Unexpected spell ${key} in shard ${shardId}`);
      }
    }
    shards[shardId] = records;
    console.log(`Spell shard ${shardId + 1}/${SHARD_COUNT}: ${Object.keys(records).length} records`);
  }
}));

const detailIds = new Set(shards.flatMap((records) => Object.keys(records).map(Number)));
const missing = [...expectedIds].filter((id) => !detailIds.has(id));
if (missing.length || detailIds.size !== expectedIds.size) {
  throw new Error(`Spell detail coverage mismatch: ${missing.length} missing, ${detailIds.size} details for ${expectedIds.size} index entries.`);
}

await mkdir(OUTPUT, { recursive: true });
await writeFile(path.join(OUTPUT, "index.json"), JSON.stringify(index));
await writeFile(path.join(OUTPUT, "classes.json"), JSON.stringify(classes));
await writeFile(path.join(OUTPUT, "effects.json"), JSON.stringify(effectNames));
await Promise.all(shards.map((records, shardId) => writeFile(path.join(OUTPUT, `${shardId}.json`), JSON.stringify(records))));
await writeFile(path.join(OUTPUT, "manifest.json"), `${JSON.stringify({
  version: 1,
  count: index.length,
  shards: SHARD_COUNT,
  importedAt: new Date().toISOString(),
}, null, 2)}\n`);

const icons = [...new Set(index.map((row) => row[3]).filter((id) => Number.isInteger(id) && id > 0))];
const iconDirectory = path.resolve("public/data/spells/icons");
await mkdir(iconDirectory, { recursive: true });
let iconCursor = 0;
let iconCount = 0;
const failedIcons = [];
await Promise.all(Array.from({ length: 12 }, async () => {
  while (iconCursor < icons.length) {
    const iconId = icons[iconCursor++];
    const file = path.join(iconDirectory, `${iconId}.webp`);
    try { await access(file); iconCount += 1; continue; } catch { /* Download missing icon. */ }
    try {
      const response = await fetch(`https://foreverdb.net/icons/${iconId}.webp`);
      if (!response.ok || !response.headers.get("content-type")?.includes("image/")) throw new Error(`HTTP ${response.status}`);
      await writeFile(file, Buffer.from(await response.arrayBuffer()));
      iconCount += 1;
    } catch {
      failedIcons.push(iconId);
    }
    if (iconCursor % 250 === 0) console.log(`Spell icons ${iconCursor}/${icons.length}`);
  }
}));
if (failedIcons.length) console.warn(`Missing ${failedIcons.length} spell icons: ${failedIcons.slice(0, 10).join(", ")}`);
console.log(`Imported ${index.length} spells with ${detailIds.size} detailed records.`);
console.log(`Imported ${iconCount}/${icons.length} spell icons.`);
