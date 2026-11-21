import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "creche-puzzles.json"), "utf8"));
const readContent = (mapId) => JSON.parse(fs.readFileSync(path.join(projectRoot, "public", "maps", mapId, "content.json"), "utf8"));
const mountainPass = readContent("mountain-pass");
const creche = readContent("githyanki-creche");
const mountainProfiles = Object.values(mountainPass.entities).filter(({ crechePuzzle }) => crechePuzzle);
const crecheProfiles = Object.values(creche.entities).filter(({ crechePuzzle }) => crechePuzzle);

assert.deepEqual(catalog.stats, {
  puzzles: 2,
  statues: 2,
  weaponPedestals: 4,
  ceremonialWeapons: 4,
  exactRewardContainers: 1,
});

assert.equal(crecheProfiles.filter(({ crechePuzzle }) => crechePuzzle.role === "statue").length, 2);
assert.equal(crecheProfiles.filter(({ crechePuzzle }) => crechePuzzle.role === "result").length, 1);
const statueProfile = crecheProfiles.find(({ crechePuzzle }) => crechePuzzle.role === "statue").crechePuzzle;
assert.deepEqual(statueProfile.statues.map(({ role, minRotationY, maxRotationY }) => [role, minRotationY, maxRotationY]), [
  ["sunrise", -95, -85],
  ["sunset", 85, 95],
]);
assert.deepEqual(statueProfile.stuckSunsetSolutions, {
  surfaces: ["SurfaceGrease", "SurfaceAlienOil", "SurfaceOil"],
  minimumDamage: 10,
  athleticsDc: 25,
});

assert.equal(mountainProfiles.filter(({ crechePuzzle }) => crechePuzzle.role === "pedestal").length, 4);
assert.equal(mountainProfiles.filter(({ crechePuzzle }) => crechePuzzle.role === "ceremonial-weapon").length, 4);
const reward = mountainProfiles.find(({ crechePuzzle }) => crechePuzzle.role === "reward");
assert.ok(reward, "The exact hidden reward container must be mapped.");
assert.deepEqual(reward.containerLoot.items.map(({ itemName }) => itemName).sort(),
  ["S_CRE_DawnmasterCrest", "S_CRE_WeaponsPuzzle_Note"], "Both authored reward entries remain present.");
assert.deepEqual(reward.containerLoot.items.map(({ title }) => title).sort(), ["Dawnmaster's Crest", "Note to the Next Dawnmaster"]);
const weaponProfile = reward.crechePuzzle;
assert.deepEqual(weaponProfile.pedestals.map(({ weaponType }) => weaponType), ["Mace", "Longsword", "Warhammer", "Battleaxe"]);
assert.equal(weaponProfile.pedestals.find(({ preSolved }) => preSolved)?.weaponType, "Longsword");
assert.equal(weaponProfile.acceptsGenericWeapons, true);
assert.deepEqual(weaponProfile.incorrectWeaponPenalty, { damage: 5, damageType: "Piercing", knockdownDuration: 2 });

const weaponLinks = mountainPass.relationships.filter(({ id }) => id.startsWith("inserts-into:") && id.includes("-"));
assert.ok(weaponLinks.length >= 4);
const statueLinks = creche.relationships.filter(({ id }) => id.startsWith("contributes-to-opening:"));
assert.ok(statueLinks.length >= 2);

console.log("Creche puzzles: 2 exact statue rotations, 4 weapon pedestals, and the Dawnmaster Crest reward verified.");
