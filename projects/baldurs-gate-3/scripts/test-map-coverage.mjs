import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const readJson = (...segments) => JSON.parse(fs.readFileSync(path.join(projectRoot, ...segments), "utf8"));

const coverage = readJson("public", "maps", "coverage-report.json");
const sourcePortals = readJson("map-sources", "catalog", "navigation-portals.json").portals;
const sourceIdentity = ({ module, level, id }) => `${module}/${level}/${id}`;
assert.deepEqual(
  [...coverage.portals, ...coverage.excludedPortals, ...(coverage.invalidPortals ?? [])].map(sourceIdentity).sort(),
  sourcePortals.map(sourceIdentity).sort(),
  "Every source portal instance is accounted for, even when neither endpoint matches a map",
);
const portalsById = new Map(coverage.portals.map((portal) => [portal.id, portal]));
for (const portalId of [
  "58941a2b-a0c0-4302-a8d0-10a2bf09648d",
  "d68eb173-9fd7-46a5-81a7-c272a091f8cb",
]) {
  const portal = portalsById.get(portalId);
  assert.ok(portal, `${portalId} is present in the coverage audit`);
  assert.equal(portal.status, "covered", `${portalId} has maps at both ends`);
}
assert.equal(coverage.stats.missingMapPortals, 0, "every playable portal endpoint has a registered map");
assert.deepEqual(coverage.suggestedPatches, [], "the completed map set has no actionable patch gaps");
assert.equal(coverage.stats.excludedTechnicalPortals, coverage.excludedPortals.length, "technical exclusions are fully itemized");
assert.ok(coverage.excludedPortals.every(({ reason }) => reason), "every technical exclusion records a review reason");
assert.deepEqual(
  coverage.portals.filter(({ level, status }) => level === "SCL_Main_A" && status === "missing-map"),
  [],
  "every audited Shadow-Cursed Lands portal endpoint has a registered map",
);

const wyrmsRockFloorPortal = portalsById.get("7ba37a98-fcd1-4362-9ab0-a5e04b585ae0");
assert.deepEqual(
  wyrmsRockFloorPortal?.source.mapIds,
  ["wyrms-rock-ground-floor"],
  "the fortress ground-floor endpoint does not leak onto another X/Z-sharing floor",
);
assert.deepEqual(
  wyrmsRockFloorPortal?.target.mapIds,
  ["wyrms-rock-audience-hall"],
  "the audience-hall endpoint resolves through its height-bounded official patch",
);

const sanctuaryLocations = readJson("public", "maps", "sharran-sanctuary", "locations.json").locations;
const dagger = sanctuaryLocations.find(({ contentId }) => contentId === "2b07d6f1-d698-47e2-9531-500cbffd9853");
assert.equal(dagger?.name, "Ritual Dagger of Shar", "the sanctuary publishes its ritual dagger");
assert.ok(dagger.categoryFacets?.includes("unique-weapon"), "the ritual dagger is classified as a unique weapon");

const passageArtifactPattern = /fade.?trigger|ambush.?pos|ai.?hint|portal sherry|plaque|safe door|(?:effect|sound|vfx).?helper|beam.?source|tressym.?point|(?:^|_)(?:helper|vfx|vb|amb)(?:_|$)/i;
const passageArtifacts = [];
const mapsRoot = path.join(projectRoot, "public", "maps");
for (const entry of fs.readdirSync(mapsRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const locationsPath = path.join(mapsRoot, entry.name, "locations.json");
  const contentPath = path.join(mapsRoot, entry.name, "content.json");
  if (!fs.existsSync(locationsPath) || !fs.existsSync(contentPath)) continue;
  const locations = JSON.parse(fs.readFileSync(locationsPath, "utf8")).locations ?? [];
  const content = JSON.parse(fs.readFileSync(contentPath, "utf8"));
  const entities = Array.isArray(content.entities) ? content.entities : Object.values(content.entities ?? {});
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const location of locations.filter(({ category }) => category === "transition" || category === "vertical-access")) {
    const entity = entitiesById.get(location.contentId);
    const internalName = entity?.internalName;
    if (!entity?.navigationPortal
      && !entity?.navigationDestination
      && passageArtifactPattern.test([location.name, internalName].filter(Boolean).join(" "))) {
      passageArtifacts.push({ mapId: entry.name, locationId: location.id, name: location.name, internalName });
    }
  }
}
assert.deepEqual(passageArtifacts, [], "developer helpers and ordinary props are not published as passages");

const index = readJson("public", "maps", "index.json");
const sanctuaryConnection = index.connections.find(({ endpoints }) => {
  const keys = new Set(endpoints.map(({ mapId, locationId }) => `${mapId}:${locationId}`));
  return keys.has("shadow-cursed-lands:58941a2b-a0c0-4302-a8d0-10a2bf09648d")
    && keys.has("sharran-sanctuary:d68eb173-9fd7-46a5-81a7-c272a091f8cb");
});
assert.equal(sanctuaryConnection?.confidence, "verified", "the sanctuary entrance is a verified two-way connection");

const itemDatabase = readJson("public", "data", "item-database.json");
const item = itemDatabase.items.find(({ statsId }) => statsId === "TWN_SharDagger");
assert.ok(item?.acquisitions.some(({ mapId, locationId }) => (
  mapId === "sharran-sanctuary"
  && locationId === "2b07d6f1-d698-47e2-9531-500cbffd9853"
)), "Shar's Sting links back to the sanctuary marker");

console.log(`Map coverage tests passed with ${coverage.stats.coveredPortals} covered portals and ${coverage.stats.missingMapPortals} explicitly reported gaps.`);
