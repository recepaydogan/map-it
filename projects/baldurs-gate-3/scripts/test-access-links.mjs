import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const mapsRoot = path.resolve("public/maps");
const catalogs = fs.readdirSync(mapsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(mapsRoot, entry.name, "content.json"))
  .filter((filePath) => fs.existsSync(filePath))
  .map((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")));

const entities = new Map(catalogs.flatMap((catalog) => Object.values(catalog.entities)
  .map((entity) => [entity.id, entity])));
const accessEntities = [...entities.values()].filter((entity) => entity.access);
const allRelationships = catalogs.flatMap((catalog) => catalog.relationships ?? []);
const relationships = allRelationships.filter(({ kind }) => kind === "unlocks");
const sentinelKeyIds = new Set(["nokey", "none", "storylock"]);
const knownKeyIds = [
  "536107bd-277b-42bb-8eaf-2b787123615c",
  "67410085-0865-4b5d-9d65-2e7b7ed80697",
];
const knownLockIds = [
  "41ee393f-0463-47e6-8751-e5073fbb9b75",
  "a0774eb3-06c6-40ca-90c8-3dc14fae25f2",
  "d2b08796-481b-4fc4-8554-ccd60fc7e8df",
];

assert.ok(accessEntities.length > 0, "Expected extracted key and lock profiles.");
assert.ok(relationships.length > 0, "Expected extracted key-to-lock relationships.");

for (const entity of accessEntities) {
  const { access } = entity;
  const normalizedKeyId = access.keyId.toLocaleLowerCase("en-US").replace(/[^a-z0-9]/g, "");
  if (sentinelKeyIds.has(normalizedKeyId)) {
    assert.equal(access.role, "lock", `Sentinel key identifier created a key profile on ${entity.id}.`);
    assert.deepEqual(access.related, [], `Sentinel key identifier created relationships on ${entity.id}.`);
  }
  assert.ok(access.role === "key" || access.role === "lock", `Unexpected access role on ${entity.id}.`);
  assert.equal(access.locked, access.role === "lock", `Locked state disagrees with access role on ${entity.id}.`);
  if (access.difficultyClass !== undefined) {
    assert.ok(Number.isFinite(access.difficultyClass), `Invalid lock DC on ${entity.id}.`);
  }
  for (const related of access.related) {
    const target = entities.get(related.contentId);
    assert.ok(target, `Missing related access entity ${related.contentId}.`);
    assert.ok(target.access, `Related entity ${related.contentId} has no access profile.`);
    assert.equal(target.access.role, related.role, `Related access role disagrees on ${related.contentId}.`);
    assert.equal(target.access.keyId, access.keyId, `Key identifier disagrees between ${entity.id} and ${related.contentId}.`);
  }
}

for (const relationship of relationships) {
  assert.equal(relationship.kind, "unlocks", `Unexpected access relationship kind ${relationship.kind}.`);
  assert.equal(entities.get(relationship.fromId)?.access?.role, "key", `Unlock source ${relationship.fromId} is not a key.`);
  assert.equal(entities.get(relationship.toId)?.access?.role, "lock", `Unlock target ${relationship.toId} is not a lock.`);
}

for (const contentId of knownKeyIds) {
  assert.equal(entities.get(contentId)?.access?.role, "key", `${contentId} physical key is not classified as a key.`);
}
for (const contentId of knownLockIds) {
  assert.equal(entities.get(contentId)?.access?.role, "lock", `${contentId} physical lock is misclassified as a key.`);
}

console.log(`Access links: ${accessEntities.length} key/lock profiles and ${relationships.length} exact unlock relationships verified.`);
