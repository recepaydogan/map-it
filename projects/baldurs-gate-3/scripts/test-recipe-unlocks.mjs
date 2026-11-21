import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const mapsRoot = path.join(projectRoot, "public", "maps");
const recipeBookId = "6557e2a7-ee82-4c5a-a26b-9056e4eb03df";
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "recipe-unlocks.json"), "utf8"));
const appearances = [];

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  for (const entity of Object.values(content.entities ?? {})) {
    if (entity.recipeUnlock) appearances.push(entity);
  }
}

const antidoteBook = catalog.entries[recipeBookId];
assert.ok(antidoteBook, "The authored antidote recipe book is missing from the extracted catalog.");
assert.deepEqual(antidoteBook.position, { x: -448.56378, y: 2.1965055, z: -6.7891445 });
assert.ok(antidoteBook.recipeIds.includes("ALCH_Potion_Antidote_Mugwort"));
for (const appearance of appearances) {
  assert.ok(catalog.entries[appearance.id], `Mapped recipe unlock ${appearance.id} is absent from the source catalog.`);
}

console.log(`Recipe unlocks: ${catalog.stats.items} exact placed recipe books cataloged; ${appearances.length} currently fall inside map rasters.`);
