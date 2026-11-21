import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));
const catalog = read("map-sources/catalog/story-ownership-zones.json");
assert.deepEqual(catalog.stats, {
  exactRegistrations: 260, fallbackRegistrations: 25, shopRegistrations: 34,
  ownershipZones: 246, zonesWithMultipleOwners: 27, shopZones: 29,
});
assert.deepEqual(catalog.entries.map(({ triggerId }) => triggerId).sort(), Object.keys(catalog.byTriggerId).sort());
const sourceLines = new Map();
for (const entry of catalog.entries) {
  assert.ok(entry.owners.length > 0, `${entry.triggerId} has authored owners`);
  for (const evidence of entry.evidence) {
    if (!sourceLines.has(evidence.sourcePath)) {
      sourceLines.set(evidence.sourcePath, fs.readFileSync(path.join(root, evidence.sourcePath), "utf8").split(/\r?\n/));
    }
    const lines = sourceLines.get(evidence.sourcePath);
    assert.ok(Number.isInteger(evidence.sourceLine) && evidence.sourceLine > 0 && evidence.sourceLine <= lines.length);
    assert.ok(lines.slice(evidence.sourceLine - 1, evidence.sourceLine + 8).join("").replace(/\s/g, "")
      .includes(evidence.statement.replace(/\s/g, "")), `${entry.triggerId} ownership evidence matches its source line`);
  }
}
let published = 0;
const mapIds = readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8"));
for (const mapId of mapIds) {
  for (const entity of Object.values(read(`public/maps/${mapId}/content.json`).entities)) {
    const entry = catalog.byTriggerId[entity.id];
    assert.equal(Boolean(entity.storyOwnershipZone), Boolean(entry), `${mapId}/${entity.id} ownership profile coverage`);
    if (!entry) continue;
    const profile = entity.storyOwnershipZone;
    assert.deepEqual(profile.levels, entry.levels);
    assert.deepEqual(profile.evidence, entry.evidence);
    assert.deepEqual(profile.owners.map(({ contentId, conditional, fallback, shopOwner }) =>
      ({ contentId, conditional, fallback, shopOwner })), entry.owners.map(({ id, conditional, fallback }) =>
      ({ contentId: id, conditional, fallback, shopOwner: entry.shopOwners.some((owner) => owner.id === id) })));
    assert.ok(profile.owners.every(({ title }) => typeof title === "string" && title.length > 0));
    published += 1;
  }
}
assert.ok(published > 0, "Ownership-zone profiles are published, not silently omitted");
console.log(`Ownership zones: ${catalog.entries.length} source zones and ${published} mapped profiles verified.`);
