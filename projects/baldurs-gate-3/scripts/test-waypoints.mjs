import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const catalog = readJson(path.join(projectRoot, "map-sources", "catalog", "waypoints.json"));

assert.equal(catalog.schemaVersion, 1);
assert.equal(catalog.waypoints.length, 40, "The official story database registers exactly 40 waypoints.");
assert.deepEqual(catalog.stats.groupCounts, { Act1: 16, Act1b: 3, Act2: 8, Act3: 3, Act3b: 10 });
assert.equal(new Set(catalog.waypoints.map((waypoint) => waypoint.id)).size, 40);
assert.equal(new Set(catalog.waypoints.map((waypoint) => waypoint.shrineId)).size, 40);
assert.equal(new Set(catalog.waypoints.map((waypoint) => waypoint.triggerId)).size, 40);

for (const waypoint of catalog.waypoints) {
  assert.ok(waypoint.localizedNames.en, `${waypoint.id} needs an English game-localized name.`);
  assert.ok(waypoint.localizedNames.tr, `${waypoint.id} needs a Turkish game-localized name.`);
  assert.ok(waypoint.position && waypoint.triggerPosition, `${waypoint.id} needs exact shrine and trigger positions.`);
  assert.ok(waypoint.activationDistance <= 10, `${waypoint.id} shrine and trigger must describe the same destination.`);
  assert.equal(catalog.byShrineId[waypoint.shrineId], waypoint.id);
  assert.ok(catalog.byLevel[waypoint.level]?.includes(waypoint.id));
  assert.ok(waypoint.provenance.story.sourceLine > 0);
  assert.ok(waypoint.provenance.shrine.sourcePath);
  assert.ok(waypoint.provenance.trigger.sourcePath);
  assert.ok(waypoint.provenance.localization.sourcePath);
}

const byShrineId = new Map(catalog.waypoints.map((waypoint) => [waypoint.shrineId, waypoint]));
const triggerIds = new Set(catalog.waypoints.map((waypoint) => waypoint.triggerId));
const publicWaypoints = [];
for (const mapDirectory of fs.readdirSync(path.join(projectRoot, "public", "maps"), { withFileTypes: true })) {
  if (!mapDirectory.isDirectory()) continue;
  const locationsPath = path.join(projectRoot, "public", "maps", mapDirectory.name, "locations.json");
  const contentPath = path.join(projectRoot, "public", "maps", mapDirectory.name, "content.json");
  if (!fs.existsSync(locationsPath) || !fs.existsSync(contentPath)) continue;
  const locations = readJson(locationsPath).locations ?? [];
  const entities = new Map((readJson(contentPath).entities ?? []).map((entity) => [entity.id, entity]));
  for (const location of locations.filter((candidate) => candidate.category === "waypoint")) {
    const waypoint = byShrineId.get(location.contentId);
    assert.ok(waypoint, `${mapDirectory.name}/${location.id} must be backed by an official shrine registration.`);
    assert.equal(location.name, waypoint.localizedNames.en);
    assert.equal(location.subtype, "waypoint");
    assert.ok(!triggerIds.has(location.id), `${mapDirectory.name} must not expose the activation trigger as a duplicate marker.`);
    const entity = entities.get(location.contentId);
    assert.equal(entity?.waypoint?.id, waypoint.id);
    assert.deepEqual(entity?.worldPosition, waypoint.position);
    publicWaypoints.push({
      mapId: mapDirectory.name,
      group: waypoint.group,
      shrineId: waypoint.shrineId,
      name: location.name,
      category: location.category,
    });
  }
}

assert.ok(publicWaypoints.length >= 38, "The current map set should expose every official waypoint covered by its raster bounds.");
assert.equal(new Set(publicWaypoints.map((waypoint) => waypoint.shrineId)).size, publicWaypoints.length,
  "An official waypoint should not be duplicated across the current detail maps.");
for (const group of ["Act1", "Act1b", "Act2", "Act3", "Act3b"]) {
  assert.ok(publicWaypoints.some((waypoint) => waypoint.group === group), `${group} needs at least one rendered waypoint.`);
}

for (const expected of [
  { mapId: "lower-city", name: "Lower City Central Wall" },
  { mapId: "shadow-cursed-lands", name: "Grand Mausoleum" },
]) {
  const waypoint = publicWaypoints.find((candidate) => (
    candidate.mapId === expected.mapId && candidate.name === expected.name
  ));
  assert.ok(waypoint, `${expected.mapId} must expose ${expected.name} as a waypoint marker.`);
  assert.equal(waypoint.category, "waypoint");
}

console.log(`Waypoint catalog verified: 40 official registrations, ${publicWaypoints.length} exact public marker placements.`);
