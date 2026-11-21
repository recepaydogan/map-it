/** Audit published map-marker references and overlapping place identities. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await readJson("src/i18n/locales/en.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const alterac = await readJson("public/maps/wdt-790112/metadata.json");
const arathi = await readJson("public/maps/wdt-790377/metadata.json");
const darkspear = await readJson("public/maps/wdt-7251908/metadata.json");
const hyjal = await readJson("public/maps/wdt-7245741/metadata.json");
const demonFall = await readJson("public/maps/wdt-5900942/metadata.json");
const instanceMaps = await readJson("data/client-research/published-instance-map-links.json");
const instanceEvidence = await readJson("data/client-research/published-instance-poi-evidence.json");
const instanceEncounters = await readJson("data/client-research/instance-encounter-trace.json");
const overlayPlaceEvidence = await readJson("data/client-research/published-marker-evidence.json");
const settlementPlaceEvidence = await readJson("data/client-research/published-settlement-poi-evidence.json");
const worldFlightEvidence = await readJson("data/client-research/published-flight-point-evidence.json");
const alteracFlightEvidence = await readJson("data/client-research/published-alterac-flight-evidence.json");
const referenceIndex = await readJson("public/data/reference/index.json");
const instanceReferences = await readJson("public/data/reference/dungeons/client-instances.json");
const flightReferences = await readJson("public/data/reference/flight-points/client-taxi-nodes.json");
const placeReferences = await readJson("public/data/reference/places/client-settlements.json");
const settlementFlightLinks = await readJson("data/client-research/settlement-flight-links.json");
const placePoiAreaRelations = await readJson("data/client-research/place-poi-area-relations.json");
const worldObjectives = await readJson("data/client-research/published-world-objective-evidence.json");
const battlegroundEvidence = await readJson("data/client-research/published-battleground-reference-evidence.json");
const battlegroundReferences = await readJson("public/data/reference/battlegrounds/client-maps.json");
const hyjalSigns = await readJson("data/client-research/published-hyjal-sign-evidence.json");
const demonFallSign = await readJson("data/client-research/published-demon-fall-sign-evidence.json");
const thunderBluffSigns = await readJson("data/client-research/published-thunder-bluff-sign-evidence.json");
const worldSignposts = await readJson("data/client-research/world-signpost-relations.json");
const transportSigns = await readJson("data/client-research/published-transport-sign-evidence.json");
const transportRoutes = await readJson("data/client-research/transport-route-relation-trace.json");
const transportStops = await readJson("data/client-research/published-transport-stop-evidence.json");
const transportStopTrace = await readJson("data/client-research/transport-stop-relations.json");
const tramStops = await readJson("data/client-research/published-tram-stop-evidence.json");
const tramTrace = await readJson("data/client-research/tram-route-audit.json");
const dalaranVenues = await readJson("data/client-research/dalaran-venue-trace.json");
const worldAreaPoiCoverage = await readJson("data/client-research/world-area-poi-coverage-audit.json");
const searchCatalog = await readJson("public/data/map-search/index.json");
if (atlas.source?.build !== alterac.source?.build
  || atlas.source.build !== arathi.source?.build
  || atlas.source.build !== darkspear.source?.build
  || atlas.source.build !== instanceMaps.source.build
  || atlas.source.build !== instanceEvidence.source.build
  || atlas.source.build !== instanceEncounters.source.build
  || atlas.source.build !== overlayPlaceEvidence.source.build
  || atlas.source.build !== settlementPlaceEvidence.source.build
  || atlas.source.build !== worldFlightEvidence.source.build
  || atlas.source.build !== alteracFlightEvidence.source.build
  || atlas.source.build !== settlementFlightLinks.source.build
  || atlas.source.build !== placePoiAreaRelations.source.build
  || atlas.source.build !== worldSignposts.source.build
  || atlas.source.build !== worldObjectives.source.build
  || atlas.source.build !== battlegroundEvidence.source.build) {
  throw new Error("Published map graph sources belong to different client builds.");
}
if (atlas.source.build !== thunderBluffSigns.source.build
  || atlas.source.build !== transportSigns.source.build
  || atlas.source.build !== transportRoutes.source.build
  || atlas.source.build !== transportStops.source.build
  || atlas.source.build !== transportStopTrace.source.build
  || atlas.source.build !== tramStops.source.build
  || atlas.source.build !== tramTrace.source.build
  || atlas.source.build !== dalaranVenues.source.build
  || atlas.source.build !== worldAreaPoiCoverage.source.build
  || worldAreaPoiCoverage.totalNamedWorldAreaPois !== 267
  || worldAreaPoiCoverage.representedAreaPois !== 256
  || worldAreaPoiCoverage.unclassified.length) {
  throw new Error("World sign records belong to another client build.");
}
if (atlas.source.build !== hyjal.source?.build
  || atlas.source.build !== hyjalSigns.source.build
  || hyjalSigns.source.wdtSha256 !== hyjal.source.wdtSha256) {
  throw new Error("Published map graph sources belong to different client builds.");
}
if (atlas.source.build !== demonFall.source?.build
  || atlas.source.build !== demonFallSign.source.build
  || demonFallSign.source.wdtSha256 !== demonFall.source.wdtSha256) {
  throw new Error("Demon Fall Canyon sign and native terrain belong to different client builds.");
}
const worldFiles = ["locations-client.json", "locations-settlements.json",
  "locations-flight.json", "locations-instances.json",
  "locations-points-of-interest.json", "locations-world-objectives.json", "locations-boats.json",
  "locations-transport-signs.json", "locations-transport-stops.json",
  "locations-tram-stops.json",
  "locations-service-signs.json", "locations-thunder-bluff-signs.json",
  "locations-zephras-signs.json",
  "locations-wayfinding.json", "locations-world-signposts.json"];
const layers = await Promise.all(worldFiles.map(async (file) => ({
  mapId: "azeroth", file, bounds: atlas.bounds,
  data: await readJson(`public/maps/world-atlas/${file}`),
})));
layers.push({ mapId: "alterac-valley", file: "locations-flight.json",
  bounds: alterac.bounds, data: await readJson("public/maps/wdt-790112/locations-flight.json") });
layers.push({ mapId: "alterac-valley", file: "locations-graveyards.json",
  bounds: alterac.bounds, data: await readJson("public/maps/wdt-790112/locations-graveyards.json") });
layers.push({ mapId: "alterac-valley", file: "locations-objectives.json",
  bounds: alterac.bounds, data: await readJson("public/maps/wdt-790112/locations-objectives.json") });
layers.push({ mapId: "arathi-basin", file: "locations-objectives.json",
  bounds: arathi.bounds, data: await readJson("public/maps/wdt-790377/locations-objectives.json") });
layers.push({ mapId: "darkspear-islands", file: "locations-objectives.json",
  bounds: darkspear.bounds, data: await readJson("public/maps/wdt-7251908/locations-objectives.json") });
layers.push({ mapId: "hyjal-crater", file: "locations-signs.json",
  bounds: hyjal.bounds, data: await readJson("public/maps/wdt-7245741/locations-signs.json") });
layers.push({ mapId: "demon-fall-canyon", file: "locations-signs.json",
  bounds: demonFall.bounds,
  data: await readJson("public/maps/wdt-5900942/locations-signs.json") });
const localize = (key) => {
  const value = key.split(".").reduce((record, part) => record?.[part], english);
  if (typeof value !== "string" || !value) throw new Error(`Missing English map string ${key}.`);
  return value;
};
const markers = new Map();
const addresses = [];
for (const { mapId, file, bounds, data } of layers) {
  for (const marker of data.locations) {
    const address = `${mapId}:${marker.id}`;
    if (markers.has(address)) throw new Error(`Duplicate published map marker ${address}.`);
    if (!Number.isFinite(marker.x) || !Number.isFinite(marker.y)
      || marker.x < bounds.minX || marker.x > bounds.maxX
      || marker.y < bounds.minY || marker.y > bounds.maxY) {
      throw new Error(`Published marker ${address} is outside its map.`);
    }
    if (marker.nameKey) localize(marker.nameKey);
    if (marker.regionKey) localize(marker.regionKey);
    markers.set(address, { ...marker, mapId, file });
    addresses.push(address);
  }
}
if (searchCatalog.version !== 1 || searchCatalog.source?.build !== atlas.source.build
  || searchCatalog.source.markerCount !== markers.size
  || searchCatalog.locations.length !== markers.size) {
  throw new Error("Cross-map search does not cover every published marker.");
}
const searchMarkers = new Map();
for (const location of searchCatalog.locations) {
  const address = `${location.mapId}:${location.point?.id}`;
  if (searchMarkers.has(address) || !location.mapName || !Number.isInteger(location.count)
    || location.count < 1) throw new Error(`Invalid cross-map search entry ${address}.`);
  searchMarkers.set(address, location);
}
for (const [address, marker] of markers) {
  const search = searchMarkers.get(address);
  if (!search || search.point.name !== (marker.nameKey ? localize(marker.nameKey) : marker.name)
    || search.point.category !== marker.category
    || search.point.x !== marker.x || search.point.y !== marker.y) {
    throw new Error(`Cross-map search differs from published marker ${address}.`);
  }
}
const edges = [];
for (const [from, marker] of markers) {
  const links = [...(marker.linkedMarkers ?? []),
    ...(marker.linkedMarkerGroups ?? []).flatMap(({ links }) => links)];
  const seen = new Set();
  for (const link of links) {
    const to = `${link.mapId}:${link.markerId}`;
    if (!markers.has(to)) throw new Error(`Broken map link ${from} → ${to}.`);
    if (seen.has(to)) throw new Error(`Duplicate map link ${from} → ${to}.`);
    seen.add(to);
    localize(link.nameKey);
    edges.push({ from, to });
  }
}
const edgeKeys = new Set(edges.map(({ from, to }) => `${from}>${to}`));
const oneWay = edges.filter(({ from, to }) => !edgeKeys.has(`${to}>${from}`));
if (transportStops.routeCount !== transportStopTrace.lineCount
  || transportStops.stopCount !== transportStopTrace.routeSpecificStopCount
  || transportStops.markers.length !== transportStopTrace.routeSpecificStopCount) {
  throw new Error("Published transport-stop count differs from client paths.");
}
for (const route of transportStopTrace.lines) {
  for (const stop of route.stops) {
    const address = `azeroth:${stop.stopId}`;
    const marker = markers.get(address);
    const evidence = transportStops.markers.find(({ locationId }) =>
      locationId === stop.stopId);
    const targets = (marker?.linkedMarkerGroups ?? []).find(({ titleKey }) =>
      titleKey === "map.transportStops.routeStops")?.links ?? [];
    const expected = route.stops.filter(({ stopId }) =>
      stopId !== stop.stopId).map(({ stopId }) => stopId).sort();
    if (!marker || marker.file !== "locations-transport-stops.json"
      || marker.category !== "transport"
      || marker.x !== stop.atlasPosition.x
      || marker.y !== stop.atlasPosition.y
      || evidence?.pathId !== route.pathId
      || evidence.sequence !== stop.sequence
      || JSON.stringify(targets.map(({ markerId }) => markerId).sort())
        !== JSON.stringify(expected)
      || targets.some(({ markerId }) =>
        !edgeKeys.has(`${address}>azeroth:${markerId}`)
        || !edgeKeys.has(`azeroth:${markerId}>${address}`))) {
      throw new Error(`Transport stop ${stop.stopId} differs from its client route.`);
    }
  }
}
if (tramTrace.mapRows.length !== 1
  || tramTrace.mapRows[0].mapId !== 369
  || tramStops.markers.length !== 2) {
  throw new Error("Deeprun Tram world-side trigger evidence changed.");
}
for (const source of tramStops.markers) {
  const address = `azeroth:${source.locationId}`;
  const marker = markers.get(address);
  const counterpart = `azeroth:client-tram-stop-${source.otherTriggerId}`;
  if (!marker || marker.file !== "locations-tram-stops.json"
    || marker.category !== "transport"
    || marker.x !== source.atlasPosition.x
    || marker.y !== source.atlasPosition.y
    || source.terrain.alpha === 0
    || !edgeKeys.has(`${address}>${counterpart}`)
    || !edgeKeys.has(`${counterpart}>${address}`)) {
    throw new Error(`Tram entrance ${source.triggerId} differs from source evidence.`);
  }
}
if (worldSignposts.signposts.length !== worldSignposts.signpostCount
  || worldSignposts.physicalSignCount
    !== worldSignposts.atlasSignCount + worldSignposts.outsideAtlas.length
  || worldSignposts.atlasSignCount
    !== worldSignposts.nativeTerrainSignCount + worldSignposts.outsideNativeTerrain.length
  || worldSignposts.nativeTerrainSignCount !== worldSignposts.signposts.reduce((sum, post) =>
    sum + post.members.length, 0)) {
  throw new Error("World signpost source positions are incomplete.");
}
let reciprocalWorldSignpostPairs = 0;
for (const source of worldSignposts.signposts) {
  const address = `azeroth:${source.signpostId}`;
  const marker = markers.get(address);
  const postedIds = source.destinations.map(({ placeLocationId }) => placeLocationId).sort();
  const linkedIds = (marker?.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey === "map.directionalSigns.signedPlaces").flatMap(({ links }) =>
    links.map(({ markerId }) => markerId)).sort();
  const aliases = searchMarkers.get(address)?.names ?? [];
  if (!marker || marker.file !== "locations-world-signposts.json"
    || marker.category !== "directional-signpost"
    || marker.nameKey !== `map.worldSignposts.${source.signpostId.replace("client-world-signpost-", "")}`
    || marker.x !== source.atlasPosition.x || marker.y !== source.atlasPosition.y
    || source.members[0]?.nativeTerrain?.alpha === 0
    || !source.destinations.every(({ name }) => aliases.includes(name)
      && aliases.includes(`Sign to ${name}`))
    || JSON.stringify(postedIds) !== JSON.stringify(linkedIds)) {
    throw new Error(`World direction sign ${source.signpostId} differs from client evidence.`);
  }
  for (const destination of source.destinations) {
    const placeAddress = `azeroth:${destination.placeLocationId}`;
    const place = markers.get(placeAddress);
    const placeEntry = placeReferences.entries[destination.placeLocationId];
    if (!place || localize(place.nameKey) !== destination.name
      || !edgeKeys.has(`${address}>${placeAddress}`)
      || !edgeKeys.has(`${placeAddress}>${address}`)
      || placeEntry && !placeEntry.mapLinks?.some(({ titleKey, links }) =>
        titleKey === "map.places.signposts" && links.some(({ markerId }) =>
          markerId === source.signpostId))) {
      throw new Error(`World sign ${source.signpostId} is not linked back from ${destination.name}.`);
    }
    reciprocalWorldSignpostPairs += 1;
  }
}
for (const relation of placePoiAreaRelations.records) {
  const pointAddress = `azeroth:${relation.pointLocationId}`;
  const placeAddress = `azeroth:${relation.placeLocationId}`;
  const point = markers.get(pointAddress);
  const place = markers.get(placeAddress);
  const entry = placeReferences.entries[relation.placeLocationId];
  if (!point || !place || point.file !== "locations-points-of-interest.json"
    || place.file !== "locations-settlements.json"
    || !edgeKeys.has(`${pointAddress}>${placeAddress}`)
    || !edgeKeys.has(`${placeAddress}>${pointAddress}`)
    || !point.linkedMarkerGroups?.some(({ titleKey, links }) =>
      titleKey === "map.publishedPointRelations.localArea"
      && links.some(({ markerId }) => markerId === relation.placeLocationId))
    || !entry?.mapLinks?.some(({ titleKey, links }) =>
      titleKey === "map.places.pointsOfInterest"
      && links.some(({ markerId }) => markerId === relation.pointLocationId))) {
    throw new Error(`Missing reciprocal native AreaTable relationship ${relation.pointPoiId}.`);
  }
}
if (transportSigns.signs.length !== 3) {
  throw new Error("Transport sign publication is incomplete.");
}
if (transportRoutes.signs.length !== transportSigns.signs.length
  || transportRoutes.signs.some(({ objectId, verifiedServiceJoin }) =>
    verifiedServiceJoin || !transportSigns.signs.some((sign) => sign.objectId === objectId))) {
  throw new Error("Transport route research no longer supports sign-only publication.");
}
for (const source of transportSigns.signs) {
  const signAddress = `azeroth:${source.locationId}`;
  const marker = markers.get(signAddress);
  const nearbyId = `client-settlement-poi-${source.nearbyPlacePoiId}`;
  const nearbyAddress = `azeroth:${nearbyId}`;
  const nearbyEntry = placeReferences.entries[nearbyId];
  if (!marker || marker.category !== "signpost"
    || marker.file !== "locations-transport-signs.json"
    || marker.nameKey !== `map.transportSigns.${source.objectId}.name`
    || marker.x !== source.atlasPosition.x || marker.y !== source.atlasPosition.y
    || source.nativePixelAlpha === 0
    || source.modelSignature !== "MD21"
    || !source.modelNameHints.some((hint) => /sign.*pointer/i.test(hint))
    || !edgeKeys.has(`${signAddress}>${nearbyAddress}`)
    || !edgeKeys.has(`${nearbyAddress}>${signAddress}`)
    || !nearbyEntry?.mapLinks?.some(({ titleKey, links }) =>
      titleKey === "map.places.transportSigns" && links.some(({ markerId }) =>
        markerId === source.locationId))) {
    throw new Error(`Broken source-backed transport sign ${source.objectId}.`);
  }
  if (source.destinationPlacePoiId) {
    const destinationId = `client-settlement-poi-${source.destinationPlacePoiId}`;
    const destinationAddress = `azeroth:${destinationId}`;
    const destinationEntry = placeReferences.entries[destinationId];
    if (source.objectId !== 165549 || source.destinationPlacePoiId !== 40
      || !/round trips to Booty Bay/i.test(source.name)
      || !edgeKeys.has(`${signAddress}>${destinationAddress}`)
      || !edgeKeys.has(`${destinationAddress}>${signAddress}`)
      || !destinationEntry?.mapLinks?.some(({ titleKey, links }) =>
        titleKey === "map.places.namedOnTransportSigns" && links.some(({ markerId }) =>
          markerId === source.locationId))) {
      throw new Error("The posted Booty Bay destination is not reciprocally linked.");
    }
  }
}
if (dalaranVenues.venues.length !== 8
  || dalaranVenues.source.mapName !== localize("map.dalaranVenues.region")) {
  throw new Error("The source-backed Dalaran venue family is incomplete.");
}
for (const source of dalaranVenues.venues) {
  const marker = markers.get(`azeroth:client-place-poi-${source.poiId}`);
  if (!marker || marker.file !== "locations-points-of-interest.json"
    || marker.category !== "point-of-interest"
    || marker.nameKey !== `map.publishedPointsOfInterest.${source.poiId}`
    || localize(marker.nameKey) !== source.name
    || marker.regionKey !== "map.dalaranVenues.region"
    || marker.x !== source.atlasPosition.x || marker.y !== source.atlasPosition.y
    || !source.cityPixel.alpha || !source.worldPixel.alpha) {
    throw new Error(`Broken Dalaran venue POI ${source.poiId}.`);
  }
}
if (thunderBluffSigns.signs.length !== 25) {
  throw new Error("Thunder Bluff sign publication is incomplete.");
}
for (const source of thunderBluffSigns.signs) {
  const address = `azeroth:${source.locationId}`;
  const marker = markers.get(address);
  const cityAddress = `azeroth:${thunderBluffSigns.source.cityLocationId}`;
  if (!marker || marker.category !== "signpost"
    || marker.file !== "locations-thunder-bluff-signs.json"
    || localize(marker.nameKey) !== source.name
    || marker.x !== source.atlasPosition.x || marker.y !== source.atlasPosition.y
    || source.nativePixelAlpha === 0
    || !source.modelNameHints.some((hint) => hint.startsWith("TaurenSign_"))
    || !edgeKeys.has(`${address}>${cityAddress}`)
    || !edgeKeys.has(`${cityAddress}>${address}`)) {
    throw new Error(`Broken source-backed Thunder Bluff sign ${source.objectId}.`);
  }
}
if (hyjalSigns.markers.length !== 2 || hyjalSigns.markers.some((source) => {
  const marker = markers.get(`hyjal-crater:${source.locationId}`);
  return !marker || marker.category !== "signpost"
    || marker.nameKey !== "map.directionalSigns.name"
    || marker.descriptionKey !== `map.hyjalSigns.${source.objectIds[0]}.description`
    || marker.x !== source.mapPosition.x || marker.y !== source.mapPosition.y
    || source.nativePixelAlpha === 0;
})) {
  throw new Error("Hyjal signposts differ from source object positions.");
}
{
  const source = demonFallSign.marker;
  const marker = markers.get(`demon-fall-canyon:${source.locationId}`);
  if (!marker || marker.category !== "signpost"
    || marker.nameKey !== "map.directionalSigns.name"
    || marker.descriptionKey !== "map.directionalSigns.demonFallCanyon"
    || source.objectIds.length !== 4 || source.displayId !== 386
    || marker.x !== source.mapPosition.x || marker.y !== source.mapPosition.y
    || source.nativePixelAlpha === 0) {
    throw new Error("Demon Fall Canyon signpost differs from its source objects.");
  }
  localize(marker.descriptionKey);
  const placeId = source.postedPlaceLink.townLocationId;
  const signAddress = `demon-fall-canyon:${source.locationId}`;
  const placeAddress = `azeroth:${placeId}`;
  const place = markers.get(placeAddress);
  const entry = placeReferences.entries[placeId];
  const instanceSource = instanceMaps.links.find(({ relatedMapId }) =>
    relatedMapId === "demon-fall-canyon");
  const instanceAddress = `azeroth:${instanceSource?.locationId}`;
  const instanceMarker = markers.get(instanceAddress);
  const instanceEntry = instanceReferences.entries[instanceSource?.locationId];
  if (source.postedPlaceLink.townPoiId !== 42
    || !source.postedNames.includes("Astranaar")
    || !place || localize(place.nameKey) !== "Astranaar"
    || !edgeKeys.has(`${signAddress}>${placeAddress}`)
    || !edgeKeys.has(`${placeAddress}>${signAddress}`)
    || !entry?.mapLinks?.some(({ titleKey, links }) =>
      titleKey === "map.places.signposts" && links.some(({ mapId, markerId }) =>
        mapId === "demon-fall-canyon" && markerId === source.locationId))) {
    throw new Error("Astranaar and its posted Demon Fall Canyon sign are not reciprocally linked.");
  }
  if (instanceSource?.instanceMapId !== demonFallSign.source.mapId
    || instanceSource.wdtFileDataId !== demonFallSign.source.wdtFileDataId
    || instanceSource.wdtSha256 !== demonFallSign.source.wdtSha256
    || marker.reference?.category !== "dungeons"
    || marker.reference.id !== instanceSource.locationId
    || !marker.linkedMarkerGroups?.some(({ titleKey, links }) =>
      titleKey === "map.instanceMaps.worldMap" && links.some(({ mapId, markerId }) =>
        mapId === "azeroth" && markerId === instanceSource.locationId))
    || instanceMarker?.reference?.id !== instanceSource.locationId
    || !instanceMarker.linkedMarkerGroups?.some(({ titleKey, links }) =>
      titleKey === "map.places.signposts" && links.some(({ mapId, markerId }) =>
        mapId === "demon-fall-canyon" && markerId === source.locationId))
    || !edgeKeys.has(`${signAddress}>${instanceAddress}`)
    || !edgeKeys.has(`${instanceAddress}>${signAddress}`)
    || !instanceEntry?.mapLinks?.some(({ titleKey, links }) =>
      titleKey === "map.places.signposts" && links.some(({ mapId, markerId }) =>
        mapId === "demon-fall-canyon" && markerId === source.locationId))) {
    throw new Error("Demon Fall Canyon sign, entrance, and dungeon database are not linked.");
  }
}
if (worldObjectives.markers.length !== 17 || worldObjectives.markers.some((source) => {
  const marker = markers.get(`azeroth:${source.locationId}`);
  return !marker || marker.category !== "world-objective"
    || marker.nameKey !== `map.publishedWorldObjectives.${source.representativePoiId}`
    || localize(marker.nameKey) !== source.name
    || marker.x !== source.atlasPosition.x || marker.y !== source.atlasPosition.y
    || source.nativePixelAlpha === 0;
})) {
  throw new Error("Published world objective positions differ from native POI evidence.");
}
let verifiedSettlementFlightPairCount = 0;
for (const { settlementLocationId, flightPoints } of settlementFlightLinks.records) {
  for (const { locationId } of flightPoints) {
    const settlement = `azeroth:${settlementLocationId}`;
    const flight = `azeroth:${locationId}`;
    if (!edgeKeys.has(`${settlement}>${flight}`)
      || !edgeKeys.has(`${flight}>${settlement}`)) {
      throw new Error(`Missing verified settlement/flight relationship: ${settlement} ↔ ${flight}.`);
    }
    verifiedSettlementFlightPairCount += 1;
  }
}
const mappedInstances = new Map(instanceMaps.links.map((link) =>
  [`azeroth:${link.locationId}`, link.relatedMapId]));
for (const [address, marker] of markers) {
  if (marker.relatedMapId !== mappedInstances.get(address)) {
    if (marker.relatedMapId || mappedInstances.has(address)) {
      throw new Error(`Instance map link differs from its client evidence: ${address}.`);
    }
  }
}
const dungeonSummaries = referenceIndex.entries.filter((entry) => entry.category === "dungeons");
const dungeonEntries = Object.values(instanceReferences.entries);
const encounterByMapId = new Map(instanceEncounters.records.map((record) =>
  [record.instanceMapId, record]));
if (dungeonSummaries.length !== instanceEvidence.markers.length
  || dungeonEntries.length !== instanceEvidence.markers.length) {
  throw new Error("Published dungeon database count differs from verified instance POIs.");
}
const summaryById = new Map(dungeonSummaries.map((entry) => [entry.id, entry]));
const entryById = new Map(dungeonEntries.map((entry) => [entry.id, entry]));
for (const source of instanceEvidence.markers) {
  const id = source.locationId;
  const marker = markers.get(`azeroth:${id}`);
  const summary = summaryById.get(id);
  const entry = entryById.get(id);
  const encounterSource = encounterByMapId.get(source.instanceMapId);
  const expectedEncounters = encounterSource?.encounters.map(({ encounterId, name }) => {
    const nameKey = `map.instanceEncounters.${encounterId}`;
    if (localize(nameKey) !== name) {
      throw new Error(`DungeonEncounter ${encounterId} differs from the English catalog.`);
    }
    return { id: encounterId, nameKey };
  });
  if (!marker || !summary || !entry || marker.reference?.category !== "dungeons"
    || marker.reference.id !== id || summary.name !== source.name
    || entry.name !== source.name || entry.chunk !== "client-instances"
    || entry.locations.length !== 1 || entry.locations[0].mapId !== "azeroth"
    || entry.locations[0].markerId !== id
    || entry.adventure?.partySize !== marker.instanceFacts?.groupSize
    || entry.adventure?.level !== (marker.instanceFacts?.minimumEntryLevel ?? 0)
    || encounterSource?.poiId !== source.poiId
    || encounterSource.locationId !== source.locationId
    || !expectedEncounters?.length
    || JSON.stringify(marker.instanceEncounters) !== JSON.stringify(expectedEncounters)
    || JSON.stringify(entry.instanceEncounters) !== JSON.stringify(expectedEncounters)) {
    throw new Error(`Broken reciprocal instance database relationship: ${id}.`);
  }
}
const flightSources = [...worldFlightEvidence.markers.map((marker) => ({
  id: marker.locationId, name: marker.name, mapId: "azeroth",
})), ...alteracFlightEvidence.markers.map((marker) => ({
  id: `client-taxi-node-${marker.taxiNodeId}`, name: marker.name, mapId: "alterac-valley",
}))];
const flightSummaries = referenceIndex.entries.filter((entry) => entry.category === "flight-points");
const flightEntries = Object.values(flightReferences.entries);
if (flightSummaries.length !== flightSources.length || flightEntries.length !== flightSources.length) {
  throw new Error("Published flight-point database count differs from verified TaxiNodes.");
}
const flightSummaryById = new Map(flightSummaries.map((entry) => [entry.id, entry]));
const flightEntryById = new Map(flightEntries.map((entry) => [entry.id, entry]));
for (const source of flightSources) {
  const address = `${source.mapId}:${source.id}`;
  const marker = markers.get(address);
  const summary = flightSummaryById.get(source.id);
  const entry = flightEntryById.get(source.id);
  const mapConnections = (marker?.linkedMarkers ?? []).map(({ markerId }) => markerId).sort();
  const databaseConnections = (entry?.sections.find(({ title }) => title === "map.flightPoints.connections")?.links ?? [])
    .map(({ id }) => id).sort();
  if (!marker || !summary || !entry || marker.reference?.category !== "flight-points"
    || marker.reference.id !== source.id || summary.name !== source.name
    || entry.name !== source.name || entry.chunk !== "client-taxi-nodes"
    || entry.locations.length !== 1 || entry.locations[0].mapId !== source.mapId
    || entry.locations[0].markerId !== source.id
    || JSON.stringify(mapConnections) !== JSON.stringify(databaseConnections)) {
    throw new Error(`Broken reciprocal flight-point database relationship: ${address}.`);
  }
}
const placeSources = [...overlayPlaceEvidence.markers, ...settlementPlaceEvidence.markers];
const placeSummaries = referenceIndex.entries.filter((entry) => entry.category === "places");
const placeEntries = Object.values(placeReferences.entries);
if (placeSummaries.length !== placeSources.length || placeEntries.length !== placeSources.length) {
  throw new Error("Published city/town database count differs from verified place POIs.");
}
const placeSummaryById = new Map(placeSummaries.map((entry) => [entry.id, entry]));
const placeEntryById = new Map(placeEntries.map((entry) => [entry.id, entry]));
for (const source of placeSources) {
  const marker = markers.get(`azeroth:${source.locationId}`);
  const summary = placeSummaryById.get(source.locationId);
  const entry = placeEntryById.get(source.locationId);
  const mapFlights = (marker?.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey === "map.places.flightPoints").flatMap(({ links }) => links.map(({ markerId }) => markerId)).sort();
  const databaseFlights = (entry?.sections.find(({ title }) => title === "map.places.flightPoints")?.links ?? [])
    .map(({ id }) => id).sort();
  const mapSigns = (marker?.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey !== "map.places.flightPoints");
  if (!marker || !summary || !entry || marker.reference?.category !== "places"
    || marker.reference.id !== source.locationId || summary.name !== source.name
    || entry.name !== source.name || entry.chunk !== "client-settlements"
    || entry.locations.length !== 1 || entry.locations[0].mapId !== "azeroth"
    || entry.locations[0].markerId !== source.locationId
    || JSON.stringify(mapFlights) !== JSON.stringify(databaseFlights)
    || JSON.stringify(mapSigns) !== JSON.stringify(entry.mapLinks ?? [])) {
    throw new Error(`Broken reciprocal city/town database relationship: ${source.locationId}.`);
  }
}
let reciprocalPlaceFlightDatabasePairs = 0;
for (const { settlementLocationId, flightPoints } of settlementFlightLinks.records) {
  for (const { locationId } of flightPoints) {
    const place = placeEntryById.get(settlementLocationId);
    const flight = flightEntryById.get(locationId);
    if (!place?.sections.some(({ title, links }) => title === "map.places.flightPoints"
      && links?.some(({ id }) => id === locationId))
      || !flight?.sections.some(({ title, links }) => title === "map.flightPoints.nearbySettlements"
        && links?.some(({ id }) => id === settlementLocationId))) {
      throw new Error(`Missing reciprocal city/flight database link: ${settlementLocationId} ↔ ${locationId}.`);
    }
    reciprocalPlaceFlightDatabasePairs += 1;
  }
}
const battlegroundSummaries = referenceIndex.entries.filter(({ category }) => category === "battlegrounds");
const battlegroundEntries = Object.values(battlegroundReferences.entries);
if (battlegroundEvidence.records.length !== 4 || battlegroundSummaries.length !== 4
  || battlegroundEntries.length !== 4) {
  throw new Error("Published battleground database count differs from client map joins.");
}
const battlegroundSummaryById = new Map(battlegroundSummaries.map((entry) => [entry.id, entry]));
const battlegroundEntryById = new Map(battlegroundEntries.map((entry) => [entry.id, entry]));
let battlegroundMarkerCount = 0;
let battlegroundFlightPairCount = 0;
for (const source of battlegroundEvidence.records) {
  const summary = battlegroundSummaryById.get(source.id);
  const entry = battlegroundEntryById.get(source.id);
  const mapLinks = (entry?.mapLinks ?? []).flatMap(({ links }) => links);
  if (!summary || !entry || entry.name !== summary.name
    || entry.mapOverviewId !== source.mapId || entry.chunk !== "client-maps"
    || JSON.stringify(mapLinks.map(({ markerId }) => markerId).sort())
      !== JSON.stringify([...source.markerIds].sort())) {
    throw new Error(`Broken battleground database map relationship: ${source.id}.`);
  }
  for (const link of mapLinks) {
    const marker = markers.get(`${source.mapId}:${link.markerId}`);
    if (!marker || link.mapId !== source.mapId || link.nameKey !== marker.nameKey
      || marker.reference?.category !== "battlegrounds" || marker.reference.id !== source.id) {
      throw new Error(`Broken battleground pin/database relationship: ${source.mapId}:${link.markerId}.`);
    }
    battlegroundMarkerCount += 1;
  }
  const linkedFlights = entry.sections.filter(({ title }) =>
    title === "reference.battlegrounds.flightPoints").flatMap(({ links }) => links ?? []);
  if (JSON.stringify(linkedFlights.map(({ id }) => id).sort())
    !== JSON.stringify([...source.flightIds].sort())) {
    throw new Error(`Battleground flight count differs from map evidence: ${source.id}.`);
  }
  for (const flightLink of linkedFlights) {
    const flight = flightEntryById.get(flightLink.id);
    if (!flight || flight.locations[0]?.mapId !== source.mapId
      || !flight.sections.some(({ title, links }) => title === "reference.battlegrounds.related"
        && links?.some(({ id }) => id === source.id))) {
      throw new Error(`Missing reciprocal battleground/flight link: ${source.id} ↔ ${flightLink.id}.`);
    }
    battlegroundFlightPairCount += 1;
  }
}
const places = [...markers.values()].filter(({ mapId }) => mapId === "azeroth");
const detailedPlaces = places.filter(({ category }) => category === "city" || category === "town");
const genericPlaces = places.filter(({ category }) => category === "point-of-interest");
const overlaps = genericPlaces.flatMap((place) => detailedPlaces.flatMap((detailed) => {
  const placeName = place.nameKey ? localize(place.nameKey) : place.name;
  const detailedName = detailed.nameKey ? localize(detailed.nameKey) : detailed.name;
  return placeName === detailedName
    && Math.hypot(place.x - detailed.x, place.y - detailed.y) <= 100
    ? [{ placeId: place.id, detailedId: detailed.id, name: placeName }] : [];
}));
if (overlaps.length) throw new Error(`Redundant generic place pins: ${JSON.stringify(overlaps)}.`);
await writeFile(join(root, "data/client-research/published-map-graph-audit.json"),
  `${JSON.stringify({ source: { product: atlas.source.product, build: atlas.source.build },
    layerCount: layers.length, markerCount: addresses.length,
    directedLinkCount: edges.length, reciprocalPairCount: (edges.length - oneWay.length) / 2,
    oneWayLinks: oneWay, duplicateSpecificPlaceOverlaps: overlaps,
    verifiedSettlementFlightPairCount,
    reciprocalPlacePoiAreaPairs: placePoiAreaRelations.records.length,
    linkedInstanceMapCount: mappedInstances.size,
    reciprocalInstanceDatabaseCount: dungeonEntries.length,
    sourceVerifiedInstanceEncounterCount: instanceEncounters.records.reduce((sum, record) =>
      sum + record.encounters.length, 0),
    reciprocalFlightPointDatabaseCount: flightEntries.length,
    reciprocalCityTownDatabaseCount: placeEntries.length,
    reciprocalPlaceFlightDatabasePairs,
    sourceVerifiedWorldObjectiveCount: worldObjectives.markers.length,
    sourceVerifiedHyjalSignCount: hyjalSigns.markers.length,
    sourceVerifiedDemonFallSignCount: 1,
    sourceVerifiedTransportSignCount: transportSigns.signs.length,
    sourceVerifiedTransportRouteCount: transportStops.routeCount,
    sourceVerifiedTransportStopCount: transportStops.stopCount,
    inferredTramEntranceCount: tramStops.markers.length,
    sourceVerifiedWorldSignCount: worldSignposts.physicalSignCount,
    worldSignpostMarkerCount: worldSignposts.signpostCount,
    reciprocalWorldSignpostPairs,
    sourceVerifiedDalaranVenueCount: dalaranVenues.venues.length,
    representedWorldAreaPoiCount: worldAreaPoiCoverage.representedAreaPois,
    reciprocalDemonFallPostedPlaceCount: 1,
    reciprocalBattlegroundDatabaseCount: battlegroundEntries.length,
    reciprocalBattlegroundMarkerCount: battlegroundMarkerCount,
    reciprocalBattlegroundFlightPairs: battlegroundFlightPairCount,
    rule: "Every published marker and link must resolve to a unique, in-bounds target. Directed taxi routes may be one-way; redundant same-name generic place pins near city/town pins are rejected." }, null, 2)}\n`);
console.log(`Audited ${addresses.length} markers, ${edges.length} links, ${oneWay.length} one-way links.`);
