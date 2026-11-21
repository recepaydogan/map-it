import { readFile, writeFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readJson = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const catalogPath = new URL("public/data/races/catalog.json", root);
const catalog = await readJson("public/data/races/catalog.json");
const gameBuild = await readJson("public/data/classes/guides/game-build.json");
const spellManifest = await readJson("public/data/spells/foreverdb/manifest.json");
const spells = new Map();

for (let shard = 0; shard < spellManifest.shards; shard += 1) {
  const entries = await readJson(`public/data/spells/foreverdb/${shard}.json`);
  for (const spell of Array.isArray(entries) ? entries : Object.values(entries).flat()) {
    spells.set(spell.id, spell);
  }
}

for (const race of catalog.races) {
  for (const racial of race.racials) {
    const spell = spells.get(racial.spellId);
    if (!spell?.n || !spell?.d) throw new Error(`Missing racial spell ${racial.spellId}`);
    racial.name = spell.n;
    racial.effect = spell.d.replace(/\s+/g, " ").trim();
    delete racial.fullEffect;
    racial.confirmed = true;
  }
  race.sourceUrl = "https://foreverdb.net/races";
}

for (const [id, formerName] of [
  ["human", "Sword Specialization"],
  ["dwarf", "Mace Specialization"],
  ["orc", "Axe Specialization"],
]) {
  const race = catalog.races.find((entry) => entry.id === id);
  if (!race.removedRacials.includes(formerName)) race.removedRacials.push(formerName);
}

catalog.source = "https://foreverdb.net/races";
catalog.sourceBuild = gameBuild.version;
await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Synced ${catalog.races.reduce((count, race) => count + race.racials.length, 0)} racials from client build ${gameBuild.version}.`);
