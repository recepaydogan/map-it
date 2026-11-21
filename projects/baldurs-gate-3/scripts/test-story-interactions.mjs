import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources", "catalog", "story-interactions.json"), "utf8"));
const mapsRoot = path.join(projectRoot, "public", "maps");
const publicEntities = fs.readdirSync(mapsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const contentPath = path.join(mapsRoot, entry.name, "content.json");
    if (!fs.existsSync(contentPath)) return [];
    return Object.values(JSON.parse(fs.readFileSync(contentPath, "utf8")).entities);
  });

assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.stats.interactionObjects, 578);
assert.equal(catalog.stats.outcomes, 589);
assert.equal(catalog.stats.narratorDialogRegistrations, 561);

const altar = catalog.byObjectId["804ab809-13dc-45ac-84a7-4faff8f6f6a9"];
assert.equal(altar.outcomes.length, 1);
assert.equal(altar.outcomes[0].kind, "opens");
assert.equal(altar.outcomes[0].target.id, "309650e9-6013-449e-a487-6d6d348d82bd");

const bench = catalog.byObjectId["a282c6af-9767-4022-8a20-7cd3f6ac4754"];
assert.deepEqual(bench.outcomes.map(({ kind }) => kind), ["starts-dialogue"]);
assert.equal(bench.outcomes[0].dialog.id, "595470d5-0690-5432-ba00-a593e7d55aad");
assert.ok(!bench.outcomes.some(({ kind }) => kind === "quest-update"));

for (const entry of catalog.entries) {
  assert.ok(entry.objectId);
  assert.ok(entry.outcomes.length > 0);
  assert.ok(entry.evidence.length > 0);
  assert.ok(entry.evidence.every(({ sourcePath, sourceLine }) => sourcePath && Number.isInteger(sourceLine)));
}

const publicInteractions = publicEntities.filter(({ storyInteraction }) => storyInteraction);
for (const entity of publicEntities) {
  const entry = catalog.byObjectId[entity.id];
  const expected = (entry?.outcomes ?? []).filter(({ kind }) => kind !== "starts-dialogue");
  assert.equal(Boolean(entity.storyInteraction), expected.length > 0,
    `${entity.id} publishes gameplay outcomes but not dialogue-only registrations`);
  if (expected.length === 0) continue;
  assert.deepEqual(entity.storyInteraction.outcomes.map(({ kind, targetContentId, questId, stateId }) =>
    ({ kind, targetContentId, questId, stateId })), expected.map(({ kind, target, questId, stateId }) =>
    ({ kind, targetContentId: target?.id, questId, stateId })), `${entity.id} preserves every non-dialogue outcome`);
  assert.deepEqual(entity.storyInteraction.triggerPredicates, entry.triggerPredicates);
  assert.deepEqual(entity.storyInteraction.evidence, entry.evidence);
}
assert.equal(new Set(publicInteractions.map(({ id }) => id)).size, publicInteractions.length);
const catalogObjectIds = new Set(catalog.entries.map(({ objectId }) => objectId));
assert.ok(publicInteractions.every(({ id }) => catalogObjectIds.has(id)));
assert.ok(publicInteractions.every(({ storyInteraction }) => storyInteraction.outcomes.length > 0));

console.log(`Story interaction validation passed for ${catalog.stats.interactionObjects} exact targets; ${publicInteractions.length} are on registered maps.`);
