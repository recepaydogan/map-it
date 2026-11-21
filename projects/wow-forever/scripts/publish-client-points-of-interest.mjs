/** Publish native named world POIs not already represented by specific pins. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const profile = await readJson("data/client-research/area-poi-category-profile.json");
const dalaranVenues = await readJson("data/client-research/dalaran-venue-trace.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const instances = await readJson("data/client-research/published-instance-poi-evidence.json");
const flights = await readJson("data/client-research/published-flight-point-evidence.json");
const areaRelations = await readJson("data/client-research/place-poi-area-relations.json");
const flightPath = "public/maps/world-atlas/locations-flight.json";
const flightLayer = await readJson(flightPath);
const settlementPath = "public/maps/world-atlas/locations-settlements.json";
const settlementLayer = await readJson(settlementPath);
const coveredLayers = await Promise.all([
  "locations-instances.json", "locations-settlements.json", "locations-wayfinding.json",
].map((name) => readJson(`public/maps/world-atlas/${name}`)));
const english = await readJson("src/i18n/locales/en.json");
const sourceTable = instances.source.tables.find(({ name }) => name === "AreaPOI");
const sourceAreas = instances.source.tables.find(({ name }) => name === "AreaTable");
if (profile.source.product !== atlas.source?.product
  || profile.source.build !== atlas.source?.build
  || profile.source.build !== instances.source.build
  || profile.source.build !== flights.source.build
  || profile.source.sha256 !== sourceTable?.sha256
  || dalaranVenues.source.build !== profile.source.build
  || dalaranVenues.source.areaPoi.sha256 !== profile.source.sha256
  || profile.source.areaTable?.sha256 !== sourceAreas?.sha256
  || areaRelations.source.sha256 !== profile.source.sha256
  || areaRelations.source.areaTable?.sha256 !== profile.source.areaTable.sha256) {
  throw new Error("The native POIs, instance exclusions, flights, and atlas differ in source build.");
}
const coveredIds = new Set(coveredLayers.flatMap(({ locations }) => locations.flatMap(({ id }) => {
  const match = /^client-(?:instance|settlement|place)-poi-(\d+)$/.exec(id);
  return match ? [Number(match[1])] : [];
})));
const localizedName = (location) => location.nameKey
  ? location.nameKey.split(".").reduce((value, part) => value?.[part], english)
  : location.name;
const specificPlaces = coveredLayers.flatMap(({ locations }) => locations)
  .filter(({ category }) => category === "city" || category === "town")
  .map((location) => ({ id: location.id, name: localizedName(location),
    x: location.x, y: location.y }));
const includedGroups = [[4, 0, 6], [4, 0, 2], [0, 0, 7], [0, 0, 6], [0, 0, 0], [1, 3, 4], [3, 0, 15]];
const candidates = includedGroups.flatMap(([iconId, uiCategory, uiPriority]) => {
  const group = profile.groups.find((entry) => entry.iconId === iconId
    && entry.uiCategory === uiCategory && entry.uiPriority === uiPriority);
  if (!group) throw new Error(`No native named world-place POI group ${iconId}:${uiCategory}:${uiPriority}.`);
  return group.records.map((record) => ({ ...record, iconId, uiCategory, uiPriority }));
});
const duplicates = candidates.flatMap((poi) => specificPlaces
  .filter((place) => place.name === poi.name
    && Math.hypot(place.x - poi.atlasPosition.x, place.y - poi.atlasPosition.y) <= 100)
  .map((place) => ({ poiId: poi.poiId, name: poi.name, specificLocationId: place.id })));
const duplicateIds = new Set(duplicates.map(({ poiId }) => poiId));
const selected = candidates.filter(({ poiId }) =>
  !coveredIds.has(poiId) && !duplicateIds.has(poiId));
const selectedById = new Map(selected.map((poi) => [poi.poiId, poi]));
const settlementById = new Map(settlementLayer.locations.map((place) => [place.id, place]));
const relationsByPointId = new Map();
const relationsByPlaceId = new Map();
for (const relation of areaRelations.records) {
  const point = selectedById.get(relation.pointPoiId);
  const place = settlementById.get(relation.placeLocationId);
  if (!point || !place || relation.pointLocationId !== `client-place-poi-${point.poiId}`
    || relation.placeLocationId !== `client-settlement-poi-${relation.placePoiId}`
    || point.mapId !== relation.mapId || point.areaId !== relation.areaId
    || point.areaName !== relation.areaName
    || place.nameKey !== `map.publishedSettlements.${relation.placePoiId}`
    || english.map.publishedSettlements[relation.placePoiId] !== relation.areaName) {
    throw new Error(`Unverified AreaTable place/POI relationship ${relation.pointPoiId}.`);
  }
  if (relationsByPointId.has(point.poiId)) {
    throw new Error(`Ambiguous AreaTable place for POI ${point.poiId}.`);
  }
  relationsByPointId.set(point.poiId, relation);
  const reverse = relationsByPlaceId.get(place.id) ?? [];
  reverse.push(relation);
  relationsByPlaceId.set(place.id, reverse);
}
const dalaranVenueIds = new Set(dalaranVenues.venues.map(({ poiId }) => poiId));
if (dalaranVenueIds.size !== 8
  || english.map.dalaranVenues.region !== dalaranVenues.source.mapName
  || dalaranVenues.venues.some(({ poiId, name, cityPixel, worldPixel }) =>
    !selected.some((poi) => poi.poiId === poiId && poi.name === name)
    || !cityPixel.alpha || !worldPixel.alpha)) {
  throw new Error("The Dalaran venue family is incomplete or differs from native terrain.");
}
for (const poi of selected) {
  if (english.map.publishedPointsOfInterest?.[poi.poiId] !== poi.name) {
    throw new Error(`Add exact AreaPOI ${poi.poiId} name to en.json.`);
  }
  const regionId = poi.parentAreaName ? poi.parentAreaId : poi.areaName ? poi.areaId : null;
  const regionName = poi.parentAreaName ?? poi.areaName;
  if (regionId && regionName && english.map.publishedAreaNames?.[regionId] !== regionName) {
    throw new Error(`Add exact AreaTable ${regionId} name to en.json.`);
  }
  if (!Number.isFinite(poi.atlasPosition?.x) || !Number.isFinite(poi.atlasPosition?.y)
    || poi.atlasPosition.x < atlas.bounds.minX || poi.atlasPosition.x > atlas.bounds.maxX
    || poi.atlasPosition.y < atlas.bounds.minY || poi.atlasPosition.y > atlas.bounds.maxY) {
    throw new Error(`AreaPOI ${poi.poiId} lies outside the projected world atlas.`);
  }
}
const nearby = selected.map((poi) => ({ poi, flights: flights.markers.filter((flight) =>
  flight.mapId === poi.mapId
  && (flight.name === poi.name || flight.name.startsWith(`${poi.name}, `))
  && Math.hypot(poi.worldPosition[0] - flight.worldPosition[0],
    poi.worldPosition[1] - flight.worldPosition[1]) <= 100) }));
const byFlightId = new Map();
const locations = nearby.map(({ poi, flights: matches }) => {
  const regionId = poi.parentAreaName ? poi.parentAreaId : poi.areaName ? poi.areaId : null;
  const groups = [];
  const links = matches.map(({ taxiNodeId }) => {
    const reverse = byFlightId.get(taxiNodeId) ?? [];
    reverse.push({ mapId: "azeroth", markerId: `client-place-poi-${poi.poiId}`,
      nameKey: `map.publishedPointsOfInterest.${poi.poiId}` });
    byFlightId.set(taxiNodeId, reverse);
    return { mapId: "azeroth", markerId: `client-taxi-node-${taxiNodeId}`,
      nameKey: `map.publishedFlightPoints.${taxiNodeId}` };
  });
  if (links.length) groups.push({ titleKey: "map.places.flightPoints", links });
  const relation = relationsByPointId.get(poi.poiId);
  if (relation) groups.push({ titleKey: "map.publishedPointRelations.localArea", links: [{
    mapId: "azeroth", markerId: relation.placeLocationId,
    nameKey: `map.publishedSettlements.${relation.placePoiId}`,
  }] });
  return { id: `client-place-poi-${poi.poiId}`, name: "",
    nameKey: `map.publishedPointsOfInterest.${poi.poiId}`,
    category: "point-of-interest", label: "", subtype: "client-area-poi",
    regionId: regionId ? String(regionId) : "", region: "",
    ...(dalaranVenueIds.has(poi.poiId)
      ? { regionKey: "map.dalaranVenues.region" }
      : regionId ? { regionKey: `map.publishedAreaNames.${regionId}` } : {}),
    x: poi.atlasPosition.x, y: poi.atlasPosition.y,
    ...(groups.length ? { linkedMarkerGroups: groups } : {}) };
});
settlementLayer.locations = settlementLayer.locations.map((place) => {
  const relations = relationsByPlaceId.get(place.id) ?? [];
  const groups = (place.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey !== "map.places.pointsOfInterest");
  if (relations.length) groups.push({ titleKey: "map.places.pointsOfInterest",
    links: relations.map(({ pointPoiId, pointLocationId }) => ({
      mapId: "azeroth", markerId: pointLocationId,
      nameKey: `map.publishedPointsOfInterest.${pointPoiId}`,
    })) });
  const updated = { ...place };
  if (groups.length) updated.linkedMarkerGroups = groups;
  else delete updated.linkedMarkerGroups;
  return updated;
});
flightLayer.locations = flightLayer.locations.map((location) => {
  const taxiNodeId = Number(location.id.replace(/^client-taxi-node-/, ""));
  const links = byFlightId.get(taxiNodeId) ?? [];
  const groups = (location.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey !== "map.flightPoints.nearbyPlaces");
  if (links.length) groups.push({ titleKey: "map.flightPoints.nearbyPlaces", links });
  const updated = { ...location };
  if (groups.length) updated.linkedMarkerGroups = groups;
  else delete updated.linkedMarkerGroups;
  return updated;
});
await writeFile(join(root, "public/maps/world-atlas/locations-points-of-interest.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, flightPath), `${JSON.stringify(flightLayer, null, 2)}\n`);
await writeFile(join(root, settlementPath), `${JSON.stringify(settlementLayer, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-point-of-interest-evidence.json"),
  `${JSON.stringify({ source: profile.source,
    selectionRule: "Named, positioned AreaPOIs in native icon/UI groups 4:0:6, 4:0:2, 0:0:7, 0:0:6, 0:0:0, 1:3:4, and 3:0:15, excluding IDs already published and same-name city/town pins within 100 atlas pixels. These identify places only, not a service or NPC.",
    linkRule: "A same-map flight node uses the exact place name or that name followed by a comma and lies within 100 client world units of the POI. Area links require the same native AreaTable ID and name as a nearby city/town POI.",
    caveat: "A place POI identifies a named map location. It does not establish an NPC, service, loot, entrance, or quest at that position.",
    excludedSpecificPlaceDuplicates: duplicates,
    markers: nearby.map(({ poi, flights: matches }) => ({ poiId: poi.poiId, name: poi.name,
      iconId: poi.iconId, uiCategory: poi.uiCategory, uiPriority: poi.uiPriority,
      mapId: poi.mapId, worldPosition: poi.worldPosition,
      atlasPosition: poi.atlasPosition, areaId: poi.areaId,
      areaName: poi.areaName, parentAreaId: poi.parentAreaId,
      parentAreaName: poi.parentAreaName,
      linkedTaxiNodeIds: matches.map(({ taxiNodeId }) => taxiNodeId),
      linkedPlacePoiId: relationsByPointId.get(poi.poiId)?.placePoiId ?? null })) }, null, 2)}\n`);
console.log(`Published ${locations.length} world-place POIs with ${[...byFlightId.values()].reduce((sum, links) => sum + links.length, 0)} flight and ${areaRelations.records.length} area links.`);
