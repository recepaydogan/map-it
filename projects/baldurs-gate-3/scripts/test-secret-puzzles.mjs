import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "secret-puzzles.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const entities = new Map();
const relationships = new Map();
const secretObjectIds = new Set(Object.keys(catalog.byObjectId));

assert.equal(catalog.stats.puzzles, 1);
assert.equal(catalog.stats.objectLinks, 5);
assert.equal(catalog.stats.requiredButtons, 2);

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  if (!fs.existsSync(contentPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  for (const entity of Object.values(content.entities ?? {})) {
    if (entity.secretPuzzle) entities.set(entity.id, { mapId: directory.name, entity });
  }
  for (const relationship of content.relationships ?? []) {
    if (secretObjectIds.has(relationship.fromId) || secretObjectIds.has(relationship.toId)) {
      relationships.set(relationship.id, relationship);
    }
  }
}

assert.deepEqual([...entities.keys()].sort(), [...secretObjectIds].sort(), "All source puzzle endpoints are mapped.");
assert.ok([...entities.values()].every(({ mapId }) => mapId === "smugglers-passageway"));
assert.equal([...entities.values()].filter(({ entity }) => entity.secretPuzzle.role === "target").length, 1);
const targetProfile = entities.get(catalog.puzzles[0].target.objectId).entity.secretPuzzle;
assert.equal(targetProfile.stones.length, 2);
assert.equal(targetProfile.buttons.length, 2);
assert.equal(targetProfile.requiredButtonCount, 2);
const expectedLinks = catalog.puzzles.flatMap((puzzle) => puzzle.pairs.flatMap(({ stone, button }) => [
  `reveals:${stone.objectId}:${button.objectId}`,
  `contributes-to-opening:${button.objectId}:${puzzle.target.objectId}`,
]));
assert.deepEqual([...relationships.keys()].sort(), expectedLinks.sort(), "All source stone/button/wall links are published.");

console.log(`Secret puzzles: ${entities.size} exact objects and ${relationships.size} source-backed relationships verified.`);
