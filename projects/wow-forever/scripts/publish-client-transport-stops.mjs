/** Publish route-specific stop positions recovered from the installed client. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/transport-stop-relations.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const boatLayerPath = "public/maps/world-atlas/locations-boats.json";
const signLayerPath = "public/maps/world-atlas/locations-transport-signs.json";
const boatLayer = await readJson(boatLayerPath);
const signLayer = await readJson(signLayerPath);
if (trace.source.build !== atlas.source.build
  || !english.map?.transportStops?.routeStops
  || !english.map?.transportStops?.availability) {
  throw new Error("Transport stops, atlas, or translations are out of sync.");
}

// Each sequence and map is checked against the current client's path records.
// The display names live exclusively in the English locale.
const routes = [
  { id: 241, mode: "boat", stops: [[11, 1, "ratchet", "map.publishedSettlements.39"],
    [29, 0, "bootyBay", "map.publishedSettlements.40"]] },
  { id: 285, mode: "zeppelin", stops: [[4, 0, "gromgol", "map.publishedSettlements.41"],
    [20, 1, "orgrimmar", "map.publishedSettlements.33"]] },
  { id: 292, mode: "boat", stops: [[8, 0, "menethil", "map.publishedSettlements.11"],
    [21, 1, "theramore", "map.publishedSettlements.791"]] },
  { id: 293, mode: "boat", stops: [[5, 1, "teldrassil", "map.publishedSettlementRegions.36"],
    [17, 1, "auberdine", "map.publishedSettlements.798"]] },
  { id: 295, mode: "boat", stops: [[7, 0, "menethil", "map.publishedSettlements.11"],
    [24, 1, "auberdine", "map.publishedSettlements.798"]] },
  { id: 301, mode: "zeppelin", stops: [[5, 0, "gromgol", "map.publishedSettlements.41"],
    [21, 0, "undercity", "map.publishedSettlements.18"]] },
  { id: 302, mode: "zeppelin", stops: [[7, 1, "orgrimmar", "map.publishedSettlements.33"],
    [28, 0, "undercity", "map.publishedSettlements.18"]] },
  { id: 303, mode: "boat", stops: [[1, 1, "feathermoon", "map.publishedSettlements.796"],
    [6, 1, "feralas", "map.publishedAreaNames.357"]] },
  { id: 11167, mode: "boat", stops: [[7, 0, "menethil", "map.publishedSettlements.11"],
    [20, 0, "southshore", "map.publishedSettlements.22"],
    [34, 1, "auberdine", "map.publishedSettlements.798"]] },
  { id: 11391, mode: "boat", stops: [[5, 1, "steamwheedle", "map.wayfinding.steamwheedlePort"],
    [23, 0, "powderfuse", "map.transportStops.places.powderfuse"]] },
  { id: 11398, mode: "zeppelin", stops: [[13, 0, "dalaran", "map.dalaranVenues.region"],
    [31, 2991, "zephras", "map.zephrasIsle"]] },
  { id: 11457, mode: "zeppelin", stops: [[5, 1, "thunderBluff", "map.publishedPlaces.thunderBluff.name"],
    [17, 2991, "zephras", "map.zephrasIsle"]] },
  { id: 11616, mode: "boat", stops: [[6, 1, "auberdine", "map.publishedSettlements.798"],
    [18, 0, "stormwindHarbor", "map.publishedPointsOfInterest.8825"]] },
];
if (trace.lineCount !== routes.length
  || trace.routeSpecificStopCount !== routes.reduce((sum, route) =>
    sum + route.stops.length, 0)) {
  throw new Error("The current client has a different transport-route set.");
}
const locations = [];
const evidence = [];
for (const route of routes) {
  const line = trace.lines.find(({ pathId }) => pathId === route.id);
  if (!line || line.stops.length !== route.stops.length
    || !["boat", "zeppelin"].includes(route.mode)) {
    throw new Error(`Transport route ${route.id} changed or has no classified mode.`);
  }
  for (const [sequence, mapId, stopKey, regionKey] of route.stops) {
    const stop = line.stops.find((candidate) =>
      candidate.sequence === sequence && candidate.mapId === mapId);
    if (!stop || stop.rawFields[0] !== 2 || stop.rawFields[1] <= 0
      || stop.sourceRouteNodeIds.length < 1
      || !english.map.transportStops.places[stopKey]
      || !english.map.transportStops.names?.[route.id]?.[sequence]
      || !regionKey.split(".").reduce((value, part) => value?.[part], english)) {
      throw new Error(`Unverified stop ${route.id}:${sequence}.`);
    }
    const links = route.stops.filter(([otherSequence]) =>
      otherSequence !== sequence).map(([otherSequence, , otherKey]) => ({
      mapId: "azeroth",
      markerId: `client-transport-stop-${route.id}-${otherSequence}`,
      nameKey: `map.transportStops.places.${otherKey}`,
    }));
    const { x, y } = stop.atlasPosition;
    if (x < atlas.bounds.minX || x > atlas.bounds.maxX
      || y < atlas.bounds.minY || y > atlas.bounds.maxY) {
      throw new Error(`Transport stop ${stop.stopId} is outside the atlas.`);
    }
    locations.push({ id: stop.stopId, name: "",
      nameKey: `map.transportStops.names.${route.id}.${sequence}`,
      category: "transport", label: "", subtype: "recorded-route-stop",
      regionId: "", region: "", regionKey,
      descriptionKey: "map.transportStops.availability",
      x, y, linkedMarkerGroups: [{
        titleKey: "map.transportStops.routeStops", links,
      }] });
    evidence.push({ locationId: stop.stopId, pathId: route.id,
      mode: route.mode,
      sequence, sourceRouteNodeIds: stop.sourceRouteNodeIds,
      rawFields: stop.rawFields, mapId, worldPosition: stop.worldPosition,
      atlasPosition: stop.atlasPosition, terrain: stop.terrain,
      nearbyPlaces: stop.nearbyPlaces,
      nearbyNamedObjects: stop.nearbyNamedObjects,
      nearbyTaxiNodes: stop.nearbyTaxiNodes });
  }
}

// Keep the older, independently verified sign markers; connect them to the
// actual route-stop records when their placed source coordinates are close.
const signRelations = [
  { id: "client-boat-signs-auberdine", stops: [
    "client-transport-stop-293-17", "client-transport-stop-295-24",
    "client-transport-stop-11167-34", "client-transport-stop-11616-6"] },
  { id: "client-boat-signs-menethil-harbor", stops: [
    "client-transport-stop-292-8", "client-transport-stop-295-7",
    "client-transport-stop-11167-7"] },
  { id: "client-transport-sign-165549", stops: ["client-transport-stop-241-11"] },
  { id: "client-transport-sign-165557", stops: [
    "client-transport-stop-285-20", "client-transport-stop-302-7"] },
  { id: "client-transport-sign-165558", stops: [
    "client-transport-stop-301-21", "client-transport-stop-302-28"] },
];
for (const relation of signRelations) {
  const sign = [...boatLayer.locations, ...signLayer.locations]
    .find(({ id }) => id === relation.id);
  if (!sign) throw new Error(`Missing transport sign ${relation.id}.`);
  sign.linkedMarkerGroups = (sign.linkedMarkerGroups ?? [])
    .filter(({ titleKey }) => titleKey !== "map.transportStops.nearbyRoutes");
  const links = relation.stops.map((id) => {
    const marker = locations.find((location) => location.id === id);
    if (!marker || Math.hypot(marker.x - sign.x, marker.y - sign.y) > 550) {
      throw new Error(`Transport sign ${sign.id} is too far from stop ${id}.`);
    }
    marker.linkedMarkerGroups.push({
      titleKey: "map.transportStops.nearbySign",
      links: [{ mapId: "azeroth", markerId: sign.id,
        nameKey: sign.nameKey }],
    });
    return { mapId: "azeroth", markerId: id,
      nameKey: marker.nameKey };
  });
  sign.linkedMarkerGroups.push({
    titleKey: "map.transportStops.nearbyRoutes", links,
  });
}

await writeFile(join(root, "public/maps/world-atlas/locations-transport-stops.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, boatLayerPath),
  `${JSON.stringify(boatLayer, null, 2)}\n`);
await writeFile(join(root, signLayerPath),
  `${JSON.stringify(signLayer, null, 2)}\n`);
await writeFile(join(root,
  "data/client-research/published-transport-stop-evidence.json"),
`${JSON.stringify({ source: trace.source, routeCount: routes.length,
  stopCount: locations.length, rule: "Publish every distinct multi-stop TaxiPath pause candidate from the current game client. Route waypoints, nearby named places, and posted signs support their locations. Each panel links only the other stops in its own path.",
  caveat: "Mode labels combine posted signs, shoreline geometry, port names, and the user's Zephras identification. Client route records do not prove a live timetable, available service, vehicle model, fare, or a reverse trip.",
  markers: evidence }, null, 2)}\n`);
console.log(`Published ${locations.length} route-specific transport stops on ${routes.length} client paths.`);
