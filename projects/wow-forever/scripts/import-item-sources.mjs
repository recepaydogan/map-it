import { mkdir, readFile, writeFile } from "node:fs/promises";

const root = "public/data/items/research";
const families = ["sources", "sold", "crafting"];
const base = "https://foreverdb.net/data";
const tasks = families.flatMap((family) => Array.from({ length: 64 }, (_, shard) => ({ family, shard })));
let cursor = 0;
const counts = { sources: 0, sold: 0, crafting: 0 };
const recoveredShards = [];
for (const family of families) await mkdir(`${root}/${family}`, { recursive: true });

async function reconstructCraftingShard(shard) {
  const result = {};
  const ids = ["alchemy", "blacksmithing", "enchanting", "engineering", "leatherworking", "tailoring", "herbalism", "mining", "skinning", "cooking", "firstaid", "fishing"];
  for (const id of ids) {
    const source = JSON.parse(await readFile(`public/data/professions/details/${id}.json`, "utf8"));
    const slug = id === "firstaid" ? "first-aid" : id;
    for (const recipe of source.recipes) {
      const output = recipe.make?.[0];
      if (output && output % 64 === shard) {
        const item = result[output] ?? { made: [], used: [] };
        item.made.push([slug, recipe.s, recipe.req ?? 1, recipe.n, recipe.make[1]]);
        result[output] = item;
      }
      for (const [reagentId, count] of recipe.r ?? []) {
        if (reagentId % 64 !== shard) continue;
        const item = result[reagentId] ?? { made: [], used: [] };
        item.used.push([slug, recipe.s, count, recipe.n, recipe.ic, recipe.q ?? 1, output ?? 0]);
        result[reagentId] = item;
      }
    }
  }
  return result;
}

async function worker() {
  while (cursor < tasks.length) {
    const { family, shard } = tasks[cursor++];
    const response = await fetch(`${base}/${family}/${shard}.json`);
    if (!response.ok) throw new Error(`${family}/${shard}: HTTP ${response.status}`);
    const body = await response.text();
    let value;
    try { value = JSON.parse(body); }
    catch (cause) {
      if (family !== "crafting") throw new Error(`Invalid JSON at ${family}/${shard}: ${body.slice(0, 80)}`, { cause });
      value = await reconstructCraftingShard(shard);
      recoveredShards.push(`${family}/${shard}`);
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${family}/${shard} source data`);
    counts[family] += Object.keys(value).length;
    await writeFile(`${root}/${family}/${shard}.json`, JSON.stringify(value));
  }
}
await Promise.all(Array.from({ length: 8 }, worker));

const [dungeonsResponse, worldResponse, bossMapping] = await Promise.all([
  fetch(`${base}/dungeons.json`), fetch(`${base}/world.json`),
  readFile("public/data/dungeons/foreverdb-bosses.json", "utf8").then(JSON.parse),
]);
if (!dungeonsResponse.ok || !worldResponse.ok) throw new Error("Missing source map names");
const dungeons = await dungeonsResponse.json();
const world = await worldResponse.json();
const localDungeons = Object.fromEntries(Object.entries(bossMapping.entries)
  .map(([localId, entry]) => [entry.sourceDungeonId, localId]).filter(([id]) => Number.isInteger(id)));
await writeFile(`${root}/index.json`, JSON.stringify({ version: 1, dungeons: Object.fromEntries(dungeons.map((dungeon) => [dungeon.id, dungeon.n])), zones: Object.fromEntries(world.map((zone) => [zone.id, zone.n])), localDungeons }));
await writeFile("docs/foreverdb-item-source-review.json", `${JSON.stringify({ version: 1, recordCounts: counts, recoveredShards }, null, 2)}\n`);
console.log(`Imported item research: ${JSON.stringify(counts)} records across 192 shards; reconstructed ${recoveredShards.join(", ") || "none"}.`);
