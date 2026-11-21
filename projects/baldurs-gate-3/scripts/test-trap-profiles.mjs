import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const mapsRoot = path.join(projectRoot, "public", "maps");
const knownTrapId = "4b05f3f1-46ee-4a8e-99d9-95a5ce14baa4";
const knownDirectDifficultyTrapId = "3d2566e5-9cb8-451e-b851-69f967371725";
const validTypes = new Set(["tripwire", "pressure-plate", "proximity-mine", "vent", "trapped-container", "rune", "trap"]);
let appearances = 0;
let withDifficulty = 0;
let knownTrap = null;
let knownDirectDifficultyTrap = null;
let peculiarFlowers = 0;
const uniqueTrapIds = new Set();

for (const directory of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  const contentPath = path.join(mapsRoot, directory.name, "content.json");
  const locationsPath = path.join(mapsRoot, directory.name, "locations.json");
  if (!fs.existsSync(contentPath) || !fs.existsSync(locationsPath)) continue;
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations ?? [];
  const locationsByContentId = new Map(locations.map((location) => [location.contentId, location]));
  for (const entity of Object.values(content.entities ?? {})) {
    if (!entity.trap) continue;
    appearances += 1;
    uniqueTrapIds.add(entity.id);
    const location = locationsByContentId.get(entity.id);
    assert.ok(location, `${directory.name}:${entity.id} trap has no marker.`);
    assert.ok(
      location.category === "trap" || location.categoryFacets?.includes("trap"),
      `${directory.name}:${entity.id} is missing the trap filter facet.`,
    );
    assert.ok(validTypes.has(entity.trap.type), `${entity.id} has unknown trap type ${entity.trap.type}.`);
    if (entity.trap.difficultyClass !== undefined) {
      assert.ok(Number.isFinite(entity.trap.difficultyClass), `${entity.id} has an invalid disarm DC.`);
    }
    if (entity.trap.difficultyClassId) {
      assert.notEqual(entity.trap.difficultyClassId, "00000000-0000-0000-0000-000000000000");
      assert.ok(Number.isFinite(entity.trap.difficultyClass), `${entity.id} has an unresolved disarm DC.`);
      withDifficulty += 1;
    }
    if (entity.id === knownTrapId) knownTrap = entity.trap;
    if (entity.id === knownDirectDifficultyTrapId) knownDirectDifficultyTrap = entity.trap;
    if (directory.name === "overgrown-tunnel" && entity.title === "Peculiar Flower") {
      peculiarFlowers += 1;
      assert.equal(entity.trap.type, "proximity-mine");
      assert.equal(entity.trap.difficultyClass, 10);
    }
  }
}

// Six Shadow-Cursed Lands appearances are intentionally pruned because the
// dedicated Moonrise Towers floor maps own those same entities.
assert.ok(appearances >= 330, `Expected at least 330 exact trap appearances; received ${appearances}.`);
assert.equal(uniqueTrapIds.size, appearances, "Trap markers must not be duplicated across registered maps.");
assert.ok(withDifficulty >= 310, `Expected at least 310 traps with exact disarm DCs; received ${withDifficulty}.`);
assert.ok(knownTrap, "Known Zhentarim proximity explosive is missing from the map data.");
assert.equal(knownTrap.type, "proximity-mine");
assert.equal(knownTrap.difficultyClass, 10);
assert.ok(knownDirectDifficultyTrap, "Known Overgrown Tunnel vent is missing from the map data.");
assert.equal(knownDirectDifficultyTrap.type, "vent");
assert.equal(knownDirectDifficultyTrap.difficultyClass, 30);
assert.equal(knownDirectDifficultyTrap.difficultyClassId, undefined);
assert.equal(peculiarFlowers, 15, "Expected all 15 extracted Peculiar Flower traps in the Overgrown Tunnel.");

console.log(`Trap profiles: ${appearances} marker appearances, ${withDifficulty} with exact disarm DCs.`);
