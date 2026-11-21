/** Add the verified NPC spell without assigning it to a player class. */
import { readFile, writeFile } from "node:fs/promises";
const root = "public/data/spells/foreverdb";
const id = 1326990;
const source = JSON.parse(await readFile("data/site-research/wowhead-verified-update-2026-10-21/spell-1326990.json", "utf8"));
if (source.name !== "Mind Blast" || source.icon !== "spell_shadow_unholyfrenzy"
  || !source.tooltip.includes("50 yd range") || !source.tooltip.includes("Instant")) throw new Error("Reviewed spell changed");
const index = JSON.parse(await readFile(`${root}/index.json`, "utf8"));
const shardPath = `${root}/${id % 64}.json`;
const shard = JSON.parse(await readFile(shardPath, "utf8"));
const added = !index.some((row) => row[0] === id);
if (added) index.push([id, "Mind Blast", "", 136224, 0, 1, 0]);
index.sort((a, b) => a[0] - b[0]);
shard[id] ??= { id, n: "Mind Blast", r: "", ic: 136224, sc: "Shadow", ct: 0, rg: [0, 50], new: true,
  d: "Inflicts Shadow damage to an enemy, but causes a high amount of threat." };
const manifest = JSON.parse(await readFile(`${root}/manifest.json`, "utf8"));
manifest.count = index.length;
if (process.argv.includes("--apply")) {
  await writeFile(`${root}/index.json`, `${JSON.stringify(index)}\n`);
  await writeFile(shardPath, `${JSON.stringify(shard)}\n`);
  await writeFile(`${root}/manifest.json`, `${JSON.stringify(manifest)}\n`);
}
console.log(JSON.stringify({ applied: process.argv.includes("--apply"), added, count: index.length, spell: shard[id] }));
