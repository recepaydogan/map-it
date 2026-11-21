import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { createPortalEndpointNormalizer, normalizeNavigationPortals, portalDistance } from "./lib/navigation-portal.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const mapsDirectory = path.join(projectRoot, "public", "maps");
const registrySource = fs.readFileSync(
  path.join(projectRoot, "src", "features", "map", "map-registry.ts"),
  "utf8",
);
const registeredMapIds = readRegisteredMapIds(registrySource);
const index = JSON.parse(fs.readFileSync(path.join(mapsDirectory, "index.json"), "utf8"));

assert.equal(index.schemaVersion, 3);
assert.deepEqual(index.maps.map((map) => map.id), registeredMapIds);

const indexedKeys = new Set();
const entitiesByLocation = new Map();
let expectedLocationCount = 0;
for (const mapId of registeredMapIds) {
  const mapDirectory = path.join(mapsDirectory, mapId);
  const metadata = JSON.parse(fs.readFileSync(path.join(mapDirectory, "metadata.json"), "utf8"));
  const localLocations = (metadata.locationSources ?? []).flatMap((source) => {
    const payload = JSON.parse(fs.readFileSync(path.join(mapDirectory, source), "utf8"));
    return Array.isArray(payload) ? payload : payload.locations;
  });
  const localById = new Map(localLocations.map((location) => [location.id, location]));
  const content = metadata.contentSource
    ? JSON.parse(fs.readFileSync(path.join(mapDirectory, metadata.contentSource), "utf8"))
    : { entities: {} };
  const contentIds = new Set(Array.isArray(content.entities)
    ? content.entities.map((entity) => entity.id)
    : Object.keys(content.entities ?? {}));
  const contentById = new Map((Array.isArray(content.entities)
    ? content.entities
    : Object.values(content.entities ?? {})).map((entity) => [entity.id, entity]));
  const indexedLocations = index.locations.filter((location) => location.mapId === mapId);

  assert.equal(indexedLocations.length, localLocations.length, `${mapId} index count`);
  assert.equal(
    index.maps.find((map) => map.id === mapId)?.locationCount,
    localLocations.length,
    `${mapId} map summary count`,
  );
  for (const location of indexedLocations) {
    const key = `${mapId}:${location.id}`;
    assert.equal(indexedKeys.has(key), false, `duplicate index key ${key}`);
    indexedKeys.add(key);
    const local = localById.get(location.id);
    entitiesByLocation.set(key, contentById.get(location.contentId));
    assert.ok(local, `${key} exists locally`);
    assert.equal(location.name, local.name, `${key} title`);
    assert.equal(location.x, local.x, `${key} x`);
    assert.equal(location.y, local.y, `${key} y`);
    if (location.contentId) {
      assert.equal(contentIds.has(location.contentId), true, `${key} content reference`);
      const sourceGameplay = contentById.get(location.contentId)?.gameplay;
      if (location.gameplay) {
        for (const [facet, value] of Object.entries(location.gameplay)) {
          assert.equal(value, sourceGameplay?.[facet], `${key} gameplay ${facet}`);
        }
      }
    }
  }
  expectedLocationCount += localLocations.length;
}

assert.equal(index.locations.length, expectedLocationCount);
const indexedLocationByKey = new Map(index.locations.map((location) => [`${location.mapId}:${location.id}`, location]));
const relationshipIds = new Set();
for (const relationship of index.relationships) {
  assert.equal(relationshipIds.has(relationship.id), false, `duplicate relationship ${relationship.id}`);
  relationshipIds.add(relationship.id);
  assert.equal(relationship.kind, "exact-name-match");
  assert.equal(relationship.confidence, "uncertain");
  assert.equal(["transition", "vertical-access"].includes(relationship.category), false);
  assert.ok(relationship.appearances.length >= 2 && relationship.appearances.length <= 12);
  assert.ok(new Set(relationship.appearances.map(({ mapId }) => mapId)).size >= 2);
  for (const appearance of relationship.appearances) {
    const location = indexedLocationByKey.get(`${appearance.mapId}:${appearance.locationId}`);
    assert.ok(location, `${relationship.id} appearance exists`);
    assert.equal(location.name, relationship.name, `${relationship.id} exact title`);
    assert.equal(location.category, relationship.category, `${relationship.id} exact category`);
  }
}

const portalCatalog = JSON.parse(fs.readFileSync(
  path.join(projectRoot, "map-sources", "catalog", "navigation-portals.json"),
  "utf8",
));
const normalizedPortals = normalizeNavigationPortals(portalCatalog.portals, createPortalEndpointNormalizer(
  JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources/catalog/world-map.json"), "utf8")),
  JSON.parse(fs.readFileSync(path.join(projectRoot, "map-sources/catalog/level-transforms.json"), "utf8")),
));
const portalsByInstance = new Map(normalizedPortals.map((portal) => [portal.instanceId, portal]));
const connectionIds = new Set();
const connectionEndpointPairs = new Set();
assert.ok(index.connections.length >= 100, `Expected at least 100 verified portal connections; received ${index.connections.length}.`);
for (const connection of index.connections) {
  assert.equal(connectionIds.has(connection.id), false, `duplicate verified connection ${connection.id}`);
  connectionIds.add(connection.id);
  assert.ok(
    connection.evidence === "reciprocal-navigation-portal"
      || connection.evidence === "navigation-portal-target",
    `${connection.id} has recognized navigation evidence`,
  );
  assert.equal(connection.confidence, "verified");
  assert.equal(connection.endpoints.length, 2);
  assert.equal(
    new Set(connection.endpoints.map(({ mapId, locationId }) => `${mapId}:${locationId}`)).size,
    2,
    `${connection.id} has two distinct endpoints`,
  );
  const endpointKey = connection.endpoints
    .map(({ mapId, locationId }) => `${mapId}:${locationId}`)
    .sort()
    .join("|");
  assert.equal(connectionEndpointPairs.has(endpointKey), false, `duplicate connection endpoints ${endpointKey}`);
  connectionEndpointPairs.add(endpointKey);
  const endpointLocations = connection.endpoints.map((endpoint) => {
    const location = indexedLocationByKey.get(`${endpoint.mapId}:${endpoint.locationId}`);
    assert.ok(location, `${connection.id} endpoint exists`);
    assert.ok(
      location.category === "transition" || location.category === "vertical-access",
      `${connection.id} endpoint is a passage`,
    );
    return location;
  });

  if (connection.evidence === "reciprocal-navigation-portal") {
    const pair = connection.sourcePortalInstanceIds.map((instanceId) => portalsByInstance.get(instanceId));
    assert.ok(pair.every(Boolean), `${connection.id} exact source instances exist`);
    endpointLocations.forEach((location, index_) => {
      assert.equal(location.contentId, connection.sourcePortalIds[index_], `${connection.id} endpoint matches its portal UUID`);
      const entity = entitiesByLocation.get(`${location.mapId}:${location.id}`);
      assert.equal(entity.navigationPortal?.instanceId, connection.sourcePortalInstanceIds[index_],
        `${connection.id} endpoint belongs to this scene instance, not just this reusable UUID`);
    });
    const [left, right] = pair;
    assert.equal(left.module, right.module, `${connection.id} same module`);
    assert.equal(left.level, right.level, `${connection.id} same scene`);
    assert.equal(portalDistance(left.sourcePosition, right.targetPosition), connection.sourceToTargetDistance,
      `${connection.id} preserves exact 3D source-to-target geometry`);
    assert.equal(portalDistance(left.targetPosition, right.sourcePosition), connection.targetToSourceDistance,
      `${connection.id} preserves exact 3D target-to-source geometry`);
    assert.ok(
      connection.sourceToTargetDistance < 10 && connection.targetToSourceDistance < 10,
      `${connection.id} is reciprocal`,
    );
    continue;
  }

  const [sourcePortalId, targetPortalId] = connection.sourcePortalIds;
  assert.equal(targetPortalId, sourcePortalId, `${connection.id} virtual target belongs to its source portal`);
  const [sourceInstanceId, targetInstanceId] = connection.sourcePortalInstanceIds;
  assert.equal(sourceInstanceId, targetInstanceId, `${connection.id} virtual target is in the same source scene`);
  assert.ok(portalsByInstance.has(sourceInstanceId), `${connection.id} exact source instance exists`);
  assert.equal(entitiesByLocation.get(`${endpointLocations[0].mapId}:${endpointLocations[0].id}`).navigationPortal?.instanceId,
    sourceInstanceId, `${connection.id} source profile instance`);
  assert.equal(entitiesByLocation.get(`${endpointLocations[1].mapId}:${endpointLocations[1].id}`).navigationDestination?.instanceId,
    targetInstanceId, `${connection.id} destination profile instance`);
  assert.equal(endpointLocations[0].contentId, sourcePortalId, `${connection.id} source endpoint matches its portal UUID`);
  assert.equal(
    endpointLocations[1].contentId,
    `${sourcePortalId}:destination`,
    `${connection.id} target endpoint is the portal's exact virtual destination`,
  );
}
console.log(`Map search index tests passed for ${registeredMapIds.length} maps, ${expectedLocationCount} locations, ${index.relationships.length} relationships and ${index.connections.length} verified portal connections.`);
