import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "minsc-sluice-puzzle.json"), "utf8"));
const content = JSON.parse(fs.readFileSync(path.join(projectRoot, "public", "maps", "lower-city-sewers", "content.json"), "utf8"));
const profiles = Object.values(content.entities).filter(({ minscSluicePuzzle }) => minscSluicePuzzle);
const profileIds = new Set(profiles.map(({ id }) => id));

assert.deepEqual(catalog.stats, {
  valves: 2,
  indicators: 2,
  authoredStages: 8,
  gates: 2,
  forceValves: 2,
  releaseValves: 1,
  disabledValves: 1,
});
const expectedIds = [
  ...catalog.valves.flatMap(({ valve, indicator }) => [valve.objectId, indicator.objectId]),
  ...catalog.gates.map(({ gate }) => gate.objectId),
  ...catalog.forceValves.map(({ valve }) => valve.objectId),
  catalog.releaseValve.objectId,
  ...catalog.disabledValves.map(({ objectId }) => objectId),
];
assert.deepEqual(profiles.map(({ id }) => id).sort(), expectedIds.sort(),
  "Every authored puzzle object is mapped, including the disabled valve.");
assert.equal(profiles.filter(({ minscSluicePuzzle }) => minscSluicePuzzle.role === "valve").length, 2);
assert.equal(profiles.filter(({ minscSluicePuzzle }) => minscSluicePuzzle.role === "indicator").length, 2);

const common = profiles[0].minscSluicePuzzle;
assert.equal(common.solutionStage, 2);
assert.deepEqual(common.valves.map(({ kind, incrementSeconds }) => [kind, incrementSeconds]), [["temperature", 6], ["water", 12]]);
for (const valve of common.valves) {
  assert.deepEqual(valve.stages.map(({ stage, durationSeconds }) => [stage, durationSeconds]), [[1, 18], [2, 18], [3, 18], [4, -1]]);
}
assert.equal(common.forceCheck.skill, "Athletics");
assert.equal(common.forceCheck.difficultyClass, 25);
assert.equal(common.elementalAdjustment.heatDamageType, "Fire");
assert.equal(common.elementalAdjustment.coolDamageType, "Cold");
assert.equal(common.elementalAdjustment.heatDurationSeconds, 6);
assert.equal(common.overload.stage, 4);
assert.equal(common.overload.releaseToStage, 3);

const localLinks = content.relationships.filter(({ confidence, fromId, toId }) => (
  confidence === "story-db-exact" && profileIds.has(fromId) && profileIds.has(toId)
));
const expectedLinks = [
  ...catalog.valves.flatMap(({ valve, indicator }) => [
    `controls:${valve.objectId}:${indicator.objectId}`,
    ...catalog.gates.map(({ gate }) => `contributes-to-opening:${valve.objectId}:${gate.objectId}`),
    `resets:${catalog.releaseValve.objectId}:${valve.objectId}`,
  ]),
  ...catalog.forceValves.flatMap(({ valve }) => catalog.gates.map(({ gate }) => `controls:${valve.objectId}:${gate.objectId}`)),
];
assert.deepEqual(localLinks.map(({ id }) => id).sort(), expectedLinks.sort(),
  "Both authored gates participate in the solution and the force-valve bypass.");

const sluiceGate = profiles.find(({ id }) => id === catalog.gates[0].gate.objectId);
assert.ok(sluiceGate, "The exact entrance sluice gate must be mapped.");
assert.equal(sluiceGate.access, undefined, "NO_KEY must never create a key/lock profile.");

console.log(`Sluice puzzle: ${profiles.length} exact markers, dual timed-stage solution, elemental correction, overload reset, and DC 25 bypass verified.`);
