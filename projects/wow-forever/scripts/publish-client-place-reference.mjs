/** Publish verified cities and towns with their existing flight and sign links. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const overlayEvidence = await readJson("data/client-research/published-marker-evidence.json");
const settlementEvidence = await readJson("data/client-research/published-settlement-poi-evidence.json");
const flightLinks = await readJson("data/client-research/settlement-flight-links.json");
const areaRelations = await readJson("data/client-research/place-poi-area-relations.json");
const overlayPath = "public/maps/world-atlas/locations-client.json";
const settlementPath = "public/maps/world-atlas/locations-settlements.json";
const flightPath = "public/maps/world-atlas/locations-flight.json";
const overlayLayer = await readJson(overlayPath);
const settlementLayer = await readJson(settlementPath);
const flightLayer = await readJson(flightPath);
const pointLayer = await readJson("public/maps/world-atlas/locations-points-of-interest.json");
const boatLayer = await readJson("public/maps/world-atlas/locations-boats.json");
const transportSigns = await readJson("public/maps/world-atlas/locations-transport-signs.json");
const transportEvidence = await readJson("data/client-research/published-transport-sign-evidence.json");
const serviceSigns = await readJson("public/maps/world-atlas/locations-service-signs.json");
const thunderBluffSigns = await readJson("public/maps/world-atlas/locations-thunder-bluff-signs.json");
const thunderBluffEvidence = await readJson("data/client-research/published-thunder-bluff-sign-evidence.json");
const worldSignposts = await readJson("public/maps/world-atlas/locations-world-signposts.json");
const worldSignpostEvidence = await readJson("data/client-research/world-signpost-relations.json");
const demonFallSigns = await readJson("public/maps/wdt-5900942/locations-signs.json");
const demonFallEvidence = await readJson("data/client-research/published-demon-fall-sign-evidence.json");
const indexPath = "public/data/reference/index.json";
const index = await readJson(indexPath);
const flightReferencePath = "public/data/reference/flight-points/client-taxi-nodes.json";
const flightReferences = await readJson(flightReferencePath);
const english = await readJson("src/i18n/locales/en.json");
const build = overlayEvidence.source.build;
if (build !== settlementEvidence.source.build || build !== flightLinks.source.build
  || build !== demonFallEvidence.source.build
  || build !== transportEvidence.source.build
  || build !== thunderBluffEvidence.source.build
  || build !== worldSignpostEvidence.source.build
  || build !== areaRelations.source.build
  || index.version !== 1 || flightReferences.version !== 1) {
  throw new Error("Place references use incompatible source records.");
}
const localize = (key) => key.split(".").reduce((value, part) => value?.[part], english);
const sources = [...overlayLayer.locations.filter(({ category }) => ["city", "town"].includes(category)),
  ...settlementLayer.locations];
const evidence = new Map([...overlayEvidence.markers.map((marker) => [marker.locationId, marker]),
  ...settlementEvidence.markers.map((marker) => [marker.locationId, marker])]);
if (sources.length !== evidence.size || new Set(sources.map(({ id }) => id)).size !== sources.length) {
  throw new Error("Place marker counts or IDs differ from client evidence.");
}
const byId = new Map(sources.map((location) => [location.id, location]));
const flightById = new Map(flightLayer.locations.map((location) => [location.id, location]));
const pointById = new Map(pointLayer.locations.map((location) => [location.id, location]));
const signById = new Map([...boatLayer.locations, ...transportSigns.locations,
  ...serviceSigns.locations,
  ...thunderBluffSigns.locations].map((location) =>
  [location.id, location]));
const expectedFlightLinks = new Map(flightLinks.records.map(({ settlementLocationId, flightPoints }) =>
  [settlementLocationId, flightPoints.map(({ locationId }) => locationId).sort()]));
const records = sources.map((location) => {
  const source = evidence.get(location.id);
  const name = localize(location.nameKey);
  const region = location.regionKey ? localize(location.regionKey) : undefined;
  if (!source || !name || source.name !== name || source.category !== location.category
    || !["city", "town"].includes(location.category)
    || location.regionKey && !region) {
    throw new Error(`Unverified city or town ${location.id}.`);
  }
  const flightGroups = (location.linkedMarkerGroups ?? []).filter((group) =>
    group.titleKey === "map.places.flightPoints");
  const flightIds = flightGroups.flatMap(({ links }) => links.map(({ markerId }) => markerId)).sort();
  if (JSON.stringify(flightIds) !== JSON.stringify(expectedFlightLinks.get(location.id) ?? [])) {
    throw new Error(`Place/flight links differ from client evidence: ${location.id}.`);
  }
  const pointIds = (location.linkedMarkerGroups ?? []).filter(({ titleKey }) =>
    titleKey === "map.places.pointsOfInterest").flatMap(({ links }) =>
    links.map(({ markerId }) => markerId)).sort();
  const expectedPointIds = areaRelations.records.filter(({ placeLocationId }) =>
    placeLocationId === location.id).map(({ pointLocationId }) => pointLocationId).sort();
  if (JSON.stringify(pointIds) !== JSON.stringify(expectedPointIds)) {
    throw new Error(`Place/POI links differ from client AreaTable evidence: ${location.id}.`);
  }
  const flightReferencesForPlace = flightGroups.flatMap(({ links }) => links.map((link) => {
    const target = flightById.get(link.markerId);
    const summary = index.entries.find((entry) => entry.category === "flight-points" && entry.id === link.markerId);
    if (!target || !summary || link.mapId !== "azeroth" || link.nameKey !== target.nameKey
      || !flightReferences.entries[link.markerId]) {
      throw new Error(`Unverified flight-point reference at ${location.id}.`);
    }
    return { id: target.id, category: "flight-points", name: summary.name,
      noteKey: target.detailLabelKey };
  }));
  const mapLinks = (location.linkedMarkerGroups ?? []).filter((group) =>
    group.titleKey !== "map.places.flightPoints").map((group) => {
    if (!["map.places.shopSigns", "map.places.bankSigns", "map.places.boatSigns",
      "map.places.namedOnBoatSigns", "map.places.transportSigns",
      "map.places.namedOnTransportSigns", "map.places.signposts",
      "map.places.pointsOfInterest"].includes(group.titleKey)) {
      throw new Error(`Unsupported nearby marker relationship ${group.titleKey}.`);
    }
    for (const link of group.links) {
      if (group.titleKey === "map.places.pointsOfInterest") {
        const point = pointById.get(link.markerId);
        const relation = areaRelations.records.find(({ placeLocationId, pointLocationId }) =>
          placeLocationId === location.id && pointLocationId === link.markerId);
        if (!relation || !point || link.mapId !== "azeroth"
          || link.nameKey !== point.nameKey || !localize(link.nameKey)) {
          throw new Error(`Unverified place/POI area link at ${location.id}.`);
        }
        continue;
      }
      if (group.titleKey === "map.places.signposts") {
        if (link.mapId === "demon-fall-canyon") {
          const sign = demonFallSigns.locations.find(({ id }) => id === link.markerId);
          if (location.id !== demonFallEvidence.marker.postedPlaceLink.townLocationId
            || link.markerId !== demonFallEvidence.marker.locationId
            || !sign || link.nameKey !== sign.nameKey || !localize(link.nameKey)) {
            throw new Error(`Unverified Demon Fall Canyon sign at ${location.id}.`);
          }
        } else if (link.markerId.startsWith("client-world-signpost-")) {
          const sign = worldSignposts.locations.find(({ id }) => id === link.markerId);
          const source = worldSignpostEvidence.signposts.find(({ signpostId }) =>
            signpostId === link.markerId);
          if (link.mapId !== "azeroth" || !sign || !source
            || sign.category !== "directional-signpost"
            || link.nameKey !== sign.nameKey || !localize(link.nameKey)
            || !source.destinations.some(({ placeLocationId }) =>
              placeLocationId === location.id)) {
            throw new Error(`Unverified world direction sign at ${location.id}.`);
          }
        } else {
          const sign = thunderBluffSigns.locations.find(({ id }) => id === link.markerId);
          const source = thunderBluffEvidence.signs.find(({ locationId }) =>
            locationId === link.markerId);
          if (location.id !== thunderBluffEvidence.source.cityLocationId
            || link.mapId !== "azeroth" || !sign || !source
            || link.nameKey !== sign.nameKey || !localize(link.nameKey)) {
            throw new Error(`Unverified Thunder Bluff sign at ${location.id}.`);
          }
        }
        continue;
      }
      const target = signById.get(link.markerId);
      if (link.mapId !== "azeroth" || !target || !localize(link.nameKey)) {
        throw new Error(`Unverified nearby sign at ${location.id}.`);
      }
      if (["map.places.transportSigns", "map.places.namedOnTransportSigns"]
        .includes(group.titleKey)) {
        const sign = transportEvidence.signs.find(({ locationId }) =>
          locationId === link.markerId);
        const expectedPlaceId = group.titleKey === "map.places.transportSigns"
          ? sign?.nearbyPlacePoiId : sign?.destinationPlacePoiId;
        if (!sign || target.nameKey !== link.nameKey
          || location.id !== `client-settlement-poi-${expectedPlaceId}`) {
          throw new Error(`Unverified transport-sign place link at ${location.id}.`);
        }
      }
    }
    return { titleKey: group.titleKey, links: group.links };
  });
  const summary = { id: location.id, category: "places", chunk: "client-settlements",
    name, group: location.category, groupKey: `map.categories.${location.category}`,
    icon: `maps/client-icons/atlas/${location.category === "city" ? "poi-majorcity" : "poi-town"}.png`,
    ...(location.regionKey ? { subtitleKey: location.regionKey } : {}) };
  const entry = { ...summary, facts: [],
    sections: flightReferencesForPlace.length
      ? [{ title: "map.places.flightPoints", links: flightReferencesForPlace }] : [],
    locations: [{ mapId: "azeroth", markerId: location.id, name: region ?? name }],
    ...(mapLinks.length ? { mapLinks } : {}),
    source: `${location.id.startsWith("client-world-map-overlay-") ? "AreaPOI + WorldMapOverlay" : "AreaPOI"}, ${overlayEvidence.source.product} build ${build}`,
  };
  return { location, summary, entry };
});
const prior = index.entries.filter((entry) => entry.category !== "places");
const summaries = [...prior, ...records.map(({ summary }) => summary)]
  .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
const counts = new Map();
for (const summary of summaries) counts.set(summary.category, (counts.get(summary.category) ?? 0) + 1);
await mkdir(join(root, "public/data/reference/places"), { recursive: true });
await writeFile(join(root, indexPath), `${JSON.stringify({ version: 1,
  categories: [...counts].map(([id, count]) => ({ id, count })), entries: summaries }, null, 2)}\n`);
await writeFile(join(root, "public/data/reference/places/client-settlements.json"),
  `${JSON.stringify({ version: 1, entries: Object.fromEntries(records.map(({ entry }) =>
    [entry.id, entry])) }, null, 2)}\n`);
const placeIds = new Set(records.map(({ entry }) => entry.id));
for (const [path, layer] of [[overlayPath, overlayLayer], [settlementPath, settlementLayer]]) {
  layer.locations = layer.locations.map((location) => placeIds.has(location.id)
    ? { ...location, reference: { category: "places", id: location.id } } : location);
  await writeFile(join(root, path), `${JSON.stringify(layer, null, 2)}\n`);
}
for (const flight of flightLayer.locations) {
  const linked = (flight.linkedMarkerGroups ?? []).filter((group) =>
    group.titleKey === "map.flightPoints.nearbySettlements").flatMap(({ links }) => links);
  const entry = flightReferences.entries[flight.id];
  if (!entry) throw new Error(`Missing flight database entry ${flight.id}.`);
  const placeLinks = linked.map((link) => {
    const target = byId.get(link.markerId);
    if (link.mapId !== "azeroth" || !target || link.nameKey !== target.nameKey
      || !placeIds.has(link.markerId)) {
      throw new Error(`Unverified flight/settlement link ${flight.id} → ${link.markerId}.`);
    }
    return { id: target.id, category: "places", name: localize(target.nameKey),
      noteKey: `map.categories.${target.category}` };
  });
  entry.sections = entry.sections.filter(({ title }) => title !== "map.flightPoints.nearbySettlements");
  if (placeLinks.length) entry.sections.push({ title: "map.flightPoints.nearbySettlements",
    links: placeLinks });
}
await writeFile(join(root, flightReferencePath), `${JSON.stringify(flightReferences, null, 2)}\n`);
console.log(`Published ${records.length} city/town entries with ${records.reduce((sum, record) =>
  sum + (record.entry.sections[0]?.links.length ?? 0), 0)} flight-point relationships.`);
