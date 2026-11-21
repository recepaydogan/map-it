import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";
import { areReciprocalPortals, isStationaryNavigationPortal, portalDistance, portalInstanceId } from "./lib/navigation-portal.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const options = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index], value = process.argv[index + 1];
  if (!["--maps-root", "--metadata-root", "--output", "--maps", "--stage-manifest"].includes(key) || !value || options.has(key)) {
    throw new Error(`Expected unique --maps-root, --metadata-root, --output, --maps or --stage-manifest argument: ${key}`);
  }
  options.set(key, value);
}
if ((options.has("--maps-root") || options.has("--metadata-root") || options.has("--maps")) && !options.has("--output")) {
  throw new Error("An isolated or partial map index requires an explicit --output");
}
const mapsDirectory = path.resolve(projectRoot, options.get("--maps-root") ?? "public/maps");
const metadataDirectory = path.resolve(projectRoot, options.get("--metadata-root") ?? mapsDirectory);
const outputPath = path.resolve(projectRoot, options.get("--output") ?? "public/maps/index.json");
const mapRegistryPath = path.join(projectRoot, "src", "features", "map", "map-registry.ts");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));

const isLocation = (value) => value
  && typeof value === "object"
  && typeof value.id === "string"
  && typeof value.name === "string"
  && typeof value.category === "string"
  && Number.isFinite(value.x)
  && Number.isFinite(value.y);

const compactSearchTerms = (terms) => [...new Set((Array.isArray(terms) ? terms : [])
  .filter((term) => typeof term === "string")
  .map((term) => term.trim())
  .filter(Boolean)
  .map((term) => term.slice(0, 240)))];

const compactGameplay = (entity) => {
  const gameplay = entity?.gameplay;
  if (!gameplay || typeof gameplay !== "object") return undefined;
  const compact = Object.fromEntries([
    "rarity",
    "slot",
    "armorType",
    "weaponType",
    "proficiency",
  ].flatMap((key) => typeof gameplay[key] === "string" && gameplay[key]
    ? [[key, gameplay[key]]]
    : []));
  if (gameplay.unique === true) compact.unique = true;
  return Object.keys(compact).length > 0 ? compact : undefined;
};

const registrySource = fs.readFileSync(mapRegistryPath, "utf8");
let registeredMaps = readRegisteredMapIds(registrySource);
if (options.has("--stage-manifest")) {
  if (!options.has("--output")) throw new Error("A staged index requires a separate output");
  const manifestPath = fs.realpathSync(path.resolve(projectRoot, options.get("--stage-manifest")));
  const auditsRoot = fs.realpathSync(path.join(projectRoot, "map-sources/audits"));
  const relativeOutput = path.relative(auditsRoot, path.join(fs.realpathSync(path.dirname(outputPath)), path.basename(outputPath)));
  if (!manifestPath.startsWith(`${auditsRoot}${path.sep}`) || !relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput)
    || fs.realpathSync(mapsDirectory) !== fs.realpathSync(path.join(path.dirname(manifestPath), "public/maps"))) {
    throw new Error("A staged manifest requires its own map directory and an isolated audit output");
  }
  const manifest = readJson(manifestPath);
  if (!Array.isArray(manifest.maps) || !manifest.maps.length || new Set(manifest.maps).size !== manifest.maps.length
    || manifest.maps.some((id) => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))) {
    throw new Error("The staged map manifest has invalid or duplicate map IDs");
  }
  // Keep existing traversal order when adding unregistered staged maps.
  registeredMaps = [...registeredMaps.filter((id) => manifest.maps.includes(id)),
    ...manifest.maps.filter((id) => !registeredMaps.includes(id))];
}
const selectedMaps = options.has("--maps") ? new Set(options.get("--maps").split(",")) : null;
if (selectedMaps) for (const id of selectedMaps) {
  if (!registeredMaps.includes(id)) throw new Error(`Unknown selected map: ${id}`);
}
const mapDirectories = selectedMaps ? registeredMaps.filter((id) => selectedMaps.has(id)) : registeredMaps;
for (const mapId of mapDirectories) {
  if (!fs.existsSync(path.join(metadataDirectory, mapId, "metadata.json"))) {
    throw new Error(`Registered map "${mapId}" has no metadata.json in the selected metadata root.`);
  }
}

const maps = [];
const locations = [];
const sourceBuilds = new Set();
const mapWorldAreas = new Map();
const portalProfilesByInstance = new Map();
const portalAppearancesByInstance = new Map();
const destinationAppearancesByInstance = new Map();

for (const mapId of mapDirectories) {
  const mapDirectory = path.join(mapsDirectory, mapId);
  const metadata = readJson(path.join(metadataDirectory, mapId, "metadata.json"));
  const mapName = typeof metadata.displayName === "string" && metadata.displayName
    ? metadata.displayName
    : mapId;
  const worldBounds = metadata.coordinateReference?.worldBounds;
  mapWorldAreas.set(mapId, Number.isFinite(worldBounds?.width) && Number.isFinite(worldBounds?.height)
    ? worldBounds.width * worldBounds.height
    : Number.POSITIVE_INFINITY);
  const locationSources = Array.isArray(metadata.locationSources)
    ? metadata.locationSources.filter((source) => typeof source === "string")
    : [];
  const contentPayload = typeof metadata.contentSource === "string" && metadata.contentSource
    ? readJson(path.join(mapDirectory, metadata.contentSource))
    : { entities: [] };
  const contentEntities = Array.isArray(contentPayload.entities)
    ? contentPayload.entities
    : Object.values(contentPayload.entities ?? {});
  const contentById = new Map(contentEntities
    .filter((entity) => entity && typeof entity === "object" && typeof entity.id === "string")
    .map((entity) => [entity.id, entity]));

  if (typeof metadata.sourceBuild === "string" && metadata.sourceBuild) {
    sourceBuilds.add(metadata.sourceBuild);
  }

  let mapLocationCount = 0;
  for (const source of locationSources) {
    const payload = readJson(path.join(mapDirectory, source));
    const sourceLocations = Array.isArray(payload) ? payload : payload.locations;
    if (!Array.isArray(sourceLocations)) {
      throw new Error(`${mapId}/${source} does not contain a locations array.`);
    }
    for (const location of sourceLocations) {
      if (!isLocation(location)) {
        throw new Error(`${mapId}/${source} contains an invalid location.`);
      }
      const gameplay = typeof location.contentId === "string"
        ? compactGameplay(contentById.get(location.contentId))
        : undefined;
      const contentEntity = typeof location.contentId === "string" ? contentById.get(location.contentId) : undefined;
      const appearance = { mapId, locationId: location.id };
      if (["transition", "vertical-access"].includes(location.category) && contentEntity?.navigationPortal) {
        const portal = contentEntity.navigationPortal;
        const instanceId = portalInstanceId(portal);
        if (portal.instanceId !== instanceId) throw new Error(`${mapId}/${location.id} needs a rebuilt portal profile.`);
        portalProfilesByInstance.set(instanceId, portal);
        portalAppearancesByInstance.set(instanceId, [...(portalAppearancesByInstance.get(instanceId) ?? []), appearance]);
      }
      if (contentEntity?.navigationDestination) {
        const instanceId = contentEntity.navigationDestination.instanceId;
        if (!instanceId) throw new Error(`${mapId}/${location.id} needs a rebuilt destination profile.`);
        destinationAppearancesByInstance.set(instanceId, [...(destinationAppearancesByInstance.get(instanceId) ?? []), appearance]);
      }
      locations.push({
        id: location.id,
        mapId,
        mapName,
        name: location.name,
        category: location.category,
        ...(Array.isArray(location.categoryFacets) && location.categoryFacets.length > 0
          ? { categoryFacets: location.categoryFacets }
          : {}),
        label: typeof location.label === "string" ? location.label : "",
        subtype: typeof location.subtype === "string" ? location.subtype : location.category,
        regionId: typeof location.regionId === "string" ? location.regionId : "",
        region: typeof location.region === "string" ? location.region : mapName,
        x: location.x,
        y: location.y,
        ...(typeof location.description === "string" && location.description
          ? { description: location.description }
          : {}),
        ...(typeof location.contentId === "string" ? { contentId: location.contentId } : {}),
        ...(gameplay ? { gameplay } : {}),
        ...(contentEntity?.navigationDestination?.portalId
          ? { navigationDestinationFor: contentEntity.navigationDestination.portalId }
          : {}),
        searchTerms: compactSearchTerms([
          ...(Array.isArray(location.searchTerms) ? location.searchTerms : []),
          gameplay?.rarity,
          gameplay?.slot,
          gameplay?.armorType,
          gameplay?.weaponType,
          gameplay?.proficiency,
          gameplay?.unique ? "unique" : "",
        ]),
      });
      mapLocationCount += 1;
    }
  }
  maps.push({
    id: mapId,
    name: mapName,
    locationCount: mapLocationCount,
    bounds: {
      minX: metadata.bounds.minX,
      minY: metadata.bounds.minY,
      maxX: metadata.bounds.maxX,
      maxY: metadata.bounds.maxY,
    },
  });
}

locations.sort((left, right) => left.mapId.localeCompare(right.mapId, "en")
  || left.name.localeCompare(right.name, "en")
  || left.id.localeCompare(right.id, "en"));

const relationshipCandidates = new Map();
const nonIdentityCategories = new Set(["transition", "vertical-access"]);
for (const location of locations) {
  // Repeated generic passages are neither actor identities nor destination
  // evidence. Verified portal pairs are handled separately in map config.
  if (nonIdentityCategories.has(location.category)) continue;
  const key = `${location.category}:${location.name}`;
  const group = relationshipCandidates.get(key) ?? [];
  group.push(location);
  relationshipCandidates.set(key, group);
}
const relationships = [...relationshipCandidates.entries()].flatMap(([key, appearances]) => {
  const mapCount = new Set(appearances.map(({ mapId }) => mapId)).size;
  if (appearances.length < 2 || appearances.length > 12 || mapCount < 2) return [];
  const first = appearances[0];
  return [{
    id: `name-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`,
    kind: "exact-name-match",
    confidence: "uncertain",
    name: first.name,
    category: first.category,
    appearances: appearances.map(({ mapId, id: locationId }) => ({ mapId, locationId })),
  }];
}).sort((left, right) => left.name.localeCompare(right.name, "en") || left.id.localeCompare(right.id, "en"));

// Only the scene instance actually bound to a published marker may establish
// its connection. Reusable UUIDs elsewhere in the source catalog are unrelated.
const navigationPortals = [...portalProfilesByInstance.values()];
const connections = [];
const chooseAppearance = (appearances) => [...appearances]
  .sort((left, right) => (mapWorldAreas.get(left.mapId) ?? Number.POSITIVE_INFINITY)
    - (mapWorldAreas.get(right.mapId) ?? Number.POSITIVE_INFINITY)
    || left.mapId.localeCompare(right.mapId, "en"))[0];
for (let leftIndex = 0; leftIndex < navigationPortals.length; leftIndex += 1) {
  const left = navigationPortals[leftIndex];
  if (!left.sourcePosition || !left.targetPosition) continue;
  const leftAppearances = portalAppearancesByInstance.get(left.instanceId) ?? [];
  if (leftAppearances.length === 0) continue;
  for (let rightIndex = leftIndex + 1; rightIndex < navigationPortals.length; rightIndex += 1) {
    const right = navigationPortals[rightIndex];
    if (!areReciprocalPortals(left, right)) continue;
    const rightAppearances = portalAppearancesByInstance.get(right.instanceId) ?? [];
    if (rightAppearances.length === 0) continue;
    const sourceToTargetDistance = portalDistance(left.sourcePosition, right.targetPosition);
    const targetToSourceDistance = portalDistance(left.targetPosition, right.sourcePosition);
    if (sourceToTargetDistance >= 10 || targetToSourceDistance >= 10) continue;
    const portalIds = [left.instanceId, right.instanceId].sort((a, b) => a.localeCompare(b, "en"));
    connections.push({
      id: `portal-${createHash("sha1").update(portalIds.join(":"), "utf8").digest("hex").slice(0, 12)}`,
      evidence: "reciprocal-navigation-portal",
      confidence: "verified",
      endpoints: [chooseAppearance(leftAppearances), chooseAppearance(rightAppearances)],
      sourcePortalIds: [left.id, right.id],
      sourcePortalInstanceIds: [left.instanceId, right.instanceId],
      sourceToTargetDistance,
      targetToSourceDistance,
    });
  }
}
for (const portal of navigationPortals) {
  if (isStationaryNavigationPortal(portal)) continue;
  const sourceAppearances = portalAppearancesByInstance.get(portal.instanceId) ?? [];
  const destinationAppearances = destinationAppearancesByInstance.get(portal.instanceId) ?? [];
  if (sourceAppearances.length === 0 || destinationAppearances.length === 0) continue;
  const source = chooseAppearance(sourceAppearances);
  const destination = chooseAppearance(destinationAppearances);
  if (source.mapId === destination.mapId && source.locationId === destination.locationId) continue;
  connections.push({
    id: `portal-target-${createHash("sha1").update(portal.instanceId, "utf8").digest("hex").slice(0, 12)}`,
    evidence: "navigation-portal-target",
    confidence: "verified",
    endpoints: [source, destination],
    sourcePortalIds: [portal.id, portal.id],
    sourcePortalInstanceIds: [portal.instanceId, portal.instanceId],
    sourceToTargetDistance: 0,
    targetToSourceDistance: 0,
  });
}
connections.sort((left, right) => left.id.localeCompare(right.id, "en"));
const seenConnectionEndpoints = new Set();
const uniqueConnections = connections.filter(({ endpoints }) => {
  const key = endpoints.map(({ mapId, locationId }) => `${mapId}:${locationId}`).sort().join("|");
  if (seenConnectionEndpoints.has(key)) return false;
  seenConnectionEndpoints.add(key);
  return true;
});

writeGeneratedFile(outputPath, `${JSON.stringify({
  schemaVersion: 3,
  sourceBuilds: [...sourceBuilds].sort(),
  maps,
  locations,
  relationships,
  connections: uniqueConnections,
}, null, 2)}\n`);

console.log(`Map search index: ${locations.length} locations, ${relationships.length} conservative relationships and ${uniqueConnections.length} verified portal connections across ${maps.length} maps.`);
