import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "rescue-plans.json"));
const placements = readJson(path.join(projectRoot, "map-sources", "catalog", "iron-throne-placements.json"));
const sourceRoot = path.join(projectRoot, "map-sources", "extracted", "story-goals");

assert.equal(catalog.schemaVersion, 1, "Expected the first rescue-plan schema.");
assert.deepEqual(catalog.stats, {
  plans: 1,
  hostages: 15,
  fixedHostages: 13,
  conditionalHostages: 2,
  evidenceStatements: 39,
}, "Expected the complete Iron Throne rescue evidence chain.");

const plan = catalog.plans.find(({ id }) => id === "iron-throne-rescue");
assert(plan, "Expected the Iron Throne rescue plan.");
assert.deepEqual(plan.turnLimits, { easy: 8, medium: 6, hard: 5 }, "Exact difficulty turn limits drifted.");
assert.equal(plan.floodTurn, 6, "Exact flood start turn drifted.");
assert.equal(plan.floodPositionCount, 8, "Expected all authored flood positions.");
assert.equal(plan.escapeTargetId, "409e1c06-a6b2-41ec-b707-0d1b491b8a6d", "Escape target drifted.");

const placementsById = new Map(placements.records.map((record) => [record.id.toLocaleLowerCase("en-US"), record]));
for (const hostage of plan.hostages) {
  assert(hostage.title && hostage.characterId && hostage.targetObjectId, "A rescue target lost its exact identity.");
  assert.equal(hostage.worldPosition.y >= 37 && hostage.worldPosition.y <= 42, true, `${hostage.title} has an unexpected rescue-floor elevation.`);
  const placement = placementsById.get(hostage.targetObjectId.toLocaleLowerCase("en-US"));
  assert(placement, `${hostage.title} has no exact placement record.`);
  assert.deepEqual(hostage.worldPosition, placement.position, `${hostage.title} placement drifted.`);
  assert.equal(catalog.byTarget[hostage.targetObjectId.toLocaleLowerCase("en-US")]?.hostageId, hostage.id, `${hostage.title} is missing from the exact target index.`);
}
for (const expectedTitle of ["Zumbo Pumbo", "Obelia Toobin", "Omeluum", "Grand Duke Ravengard"]) {
  assert(plan.hostages.some(({ title }) => title === expectedTitle), `Missing exact rescue identity ${expectedTitle}.`);
}
assert.deepEqual(plan.hostages.filter(({ conditional }) => conditional).map(({ title }) => title).sort(), ["Grand Duke Ravengard", "Omeluum"], "Conditional captive set drifted.");

for (const evidence of plan.evidence) {
  const source = fs.readFileSync(path.join(sourceRoot, evidence.provenance), "utf8");
  const lines = source.split(/\r?\n/);
  assert(lines[evidence.sourceLine - 1]?.includes(evidence.statement), `Rescue evidence drifted at ${evidence.provenance}:${evidence.sourceLine}.`);
  if (evidence.occurrence) {
    const matchingLines = lines.flatMap((line, index) => line.includes(evidence.statement) ? [index + 1] : []);
    assert.equal(evidence.sourceLine, matchingLines[evidence.occurrence - 1], `Rescue evidence occurrence ${evidence.occurrence} drifted.`);
  }
}

const mapId = "iron-throne";
const content = readJson(path.join(projectRoot, "public", "maps", mapId, "content.json"));
const locations = readJson(path.join(projectRoot, "public", "maps", mapId, "locations.json")).locations ?? [];
const rescueEntities = content.entities.filter((entity) => entity.rescuePlan?.planId === plan.id);
assert.equal(rescueEntities.length, 16, "Expected 15 captive markers plus the escape marker.");
for (const entity of rescueEntities) {
  const location = locations.find(({ contentId }) => contentId === entity.id);
  assert(location, `${entity.title} has no public location.`);
  assert(location.categoryFacets?.includes("missable"), `${entity.title} is missing the timed-rescue filter facet.`);
  assert.equal(entity.rescuePlan.totalPossibleHostages, 15, `${entity.title} has an incomplete rescue summary.`);
  assert.equal(entity.rescuePlan.evidence.length, 39, `${entity.title} lost exact rescue provenance.`);
  assert(entity.provenance.some(({ sourcePath }) => sourcePath.includes("Act3i_IRN_IronThrone.txt:")), `${entity.title} lost line-addressable rescue provenance.`);
}
const escapeEntity = rescueEntities.find(({ id }) => id === plan.escapeTargetId);
assert.equal(escapeEntity?.kind, "transition", "Escape ladder should remain a transition.");
assert.equal(escapeEntity?.rescuePlan.role, "escape", "Escape ladder should expose the plan anchor.");
assert(rescueEntities.filter(({ rescuePlan }) => rescuePlan.role === "hostage").every(({ kind, rescuePlan }) => kind === "npc" && rescuePlan.currentHostage), "Every captive marker needs an exact hostage profile.");

console.log(`Rescue-plan intelligence: ${catalog.stats.hostages} possible hostages / ${plan.turnLimits.easy}-${plan.turnLimits.medium}-${plan.turnLimits.hard} turns / ${catalog.stats.evidenceStatements} exact statements.`);
