import { readFile, writeFile } from "node:fs/promises";

const sourceUrl = "https://foreverdb.net/data/races.json";
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`${sourceUrl}: HTTP ${response.status}`);
const source = await response.json();
const path = "public/data/races/catalog.json";
const catalog = JSON.parse(await readFile(path, "utf8"));
const review = [];
let added = 0;

for (const race of catalog.races) {
  const sourceRace = source.races.find((candidate) => candidate.n === race.name || race.id === "skyborne" && candidate.n === "High Order Skyborne");
  if (!sourceRace) throw new Error(`Missing source race: ${race.name}`);
  for (const racial of race.racials) {
    const sourceRacial = sourceRace.racials.find((candidate) => candidate.n === racial.name);
    if (!sourceRacial) throw new Error(`Missing source racial: ${race.name} / ${racial.name}`);
    if (!racial.spellId) { racial.spellId = sourceRacial.id; added++; }
    else if (racial.spellId !== sourceRacial.id) review.push({ race: race.name, racial: racial.name, localId: racial.spellId, sourceId: sourceRacial.id, localEffect: racial.effect, sourceEffect: sourceRacial.d });
  }
}
await writeFile(path, JSON.stringify(catalog));
await writeFile("docs/foreverdb-racial-review.json", `${JSON.stringify({ version: 1, addedLinks: added, divergentVariants: review }, null, 2)}\n`);
console.log(`Added ${added} racial spell links; ${review.length} variant IDs retained for review.`);
