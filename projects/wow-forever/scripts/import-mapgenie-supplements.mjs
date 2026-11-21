/** Add supplied map pins only after checking the corresponding client taxi network. */
import { readFile, writeFile } from "node:fs/promises";
import { projectMapgenieAtlas } from "./lib/project-mapgenie-atlas.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const flightmasters = await readJson("flightmasters.json");
const suppliedRoutes = await readJson("flightmaster-routes.json");
const vaults = await readJson("guildvault.json");
const graveyards = await readJson("graveyards.json");
const identities = await readJson("data/client-research/taxi-node-identities.json");
const network = await readJson("data/client-research/taxi-path-network.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const publishedFlights = await readJson("public/maps/world-atlas/locations-flight.json");
const publishedCommunity = await readJson("public/maps/world-atlas/locations-mapgenie-community.json");
const settlements = await readJson("public/maps/world-atlas/locations-settlements.json");
const search = await readJson("public/data/map-search/index.json");
const english = await readJson("src/i18n/locales/en.json");
if (identities.source.build !== atlas.source.build || network.source.build !== atlas.source.build) {
  throw new Error("Taxi routes and map atlas belong to different client builds.");
}

const existingFlightIds = new Set(publishedFlights.locations.map(({ id }) => id));
const nodeById = new Map(identities.nodes.map((node) => [node.id, node]));
const pathIds = new Set(network.paths.map((path) => `${path.fromTaxiNodeId}:${path.toTaxiNodeId}`));
const sideFor = (node) => node.mountCreatureIds[0] && node.mountCreatureIds[1] ? "Neutral"
  : node.mountCreatureIds[0] ? "Horde" : node.mountCreatureIds[1] ? "Alliance" : null;
const matchNode = (pin) => {
  const projected = projectMapgenieAtlas(pin.latitude, pin.longitude);
  const matches = identities.nodes.filter((node) => node.name === pin.title && node.atlasPosition)
    .map((node) => ({ node, distance: Math.hypot(projected.x - node.atlasPosition.x,
      projected.y - node.atlasPosition.y) }))
    .sort((left, right) => left.distance - right.distance);
  if (!matches.length || matches[0].distance > 1) {
    throw new Error(`No coordinate-matched client TaxiNode for pin ${pin.id}.`);
  }
  return matches[0].node;
};

const matched = new Map(flightmasters.map((pin) => [pin.id, matchNode(pin)]));
const missing = flightmasters.filter((pin) => !existingFlightIds.has(`client-taxi-node-${matched.get(pin.id).id}`));
const missingIds = new Set(missing.map((pin) => matched.get(pin.id).id));
if (missing.length !== 6 || missingIds.size !== 6) {
  throw new Error(`Expected six distinct, coordinate-confirmed missing flight points; got ${missing.length}.`);
}
for (const pin of missing) {
  const node = matched.get(pin.id);
  if (pin.side !== sideFor(node) || node.outgoingTaxiNodeIds.some((id) =>
    !pathIds.has(`${node.id}:${id}`))) {
    throw new Error(`Client route or faction mismatch at ${pin.title} (${pin.id}).`);
  }
}

english.map.publishedFlightPoints ??= {};
english.map.supplementalLocations ??= {};
const locations = missing.map((pin) => {
  const node = matched.get(pin.id);
  english.map.publishedFlightPoints[node.id] = node.name;
  const side = sideFor(node);
  return {
    id: `client-taxi-node-${node.id}`,
    name: "", nameKey: `map.publishedFlightPoints.${node.id}`,
    category: "flight-master", label: "", subtype: "flight-master",
    regionId: "", region: "",
    detailLabelKey: `map.affiliations.${side === "Neutral" ? "both" : side.toLowerCase()}`,
    x: node.atlasPosition.x, y: node.atlasPosition.y,
    linkedMarkersTitleKey: "map.flightPoints.connections",
    linkedMarkers: node.outgoingTaxiNodeIds.filter((targetId) =>
      existingFlightIds.has(`client-taxi-node-${targetId}`) || missingIds.has(targetId))
      .map((targetId) => ({ mapId: "azeroth", markerId: `client-taxi-node-${targetId}`,
        nameKey: `map.publishedFlightPoints.${targetId}` })),
    reference: { category: "flight-points", id: `client-taxi-node-${node.id}` },
  };
});

const settlementNames = new Map(settlements.locations.map((point) => [point.id,
  point.nameKey.split(".").reduce((value, part) => value?.[part], english)]));
for (const pin of vaults) {
  const projected = projectMapgenieAtlas(pin.latitude, pin.longitude);
  const nearest = settlements.locations.map((point) => ({ point,
    distance: Math.hypot(projected.x - point.x, projected.y - point.y) }))
    .sort((left, right) => left.distance - right.distance)[0];
  const city = settlementNames.get(nearest?.point.id);
  if (!city || !["Stormwind", "Ironforge"].includes(city) || nearest.distance > 300) {
    throw new Error(`Guild vault ${pin.id} does not match an expected city.`);
  }
  english.map.supplementalLocations[pin.id] = { name: pin.title };
  locations.push({ id: `mapgenie-guild-vault-${pin.id}`,
    name: "", nameKey: `map.supplementalLocations.${pin.id}.name`,
    category: "guild-vault", label: "", subtype: "guild-vault",
    regionId: "", region: "", regionKey: nearest.point.nameKey,
    x: Number(projected.x.toFixed(3)), y: Number(projected.y.toFixed(3)) });
}

const publishedGraveyardIds = new Set(publishedCommunity.locations
  .filter((point) => point.category === "graveyard").map((point) => point.id));
for (const pin of graveyards) {
  const id = `mapgenie-graveyard-${pin.id}`;
  if (publishedGraveyardIds.has(id)) continue;
  const projected = projectMapgenieAtlas(pin.latitude, pin.longitude);
  english.map.supplementalLocations[pin.id] = { name: pin.title };
  locations.push({ id, name: "", nameKey: `map.supplementalLocations.${pin.id}.name`,
    category: "graveyard", label: "", subtype: "graveyard",
    regionId: "", region: "", x: Number(projected.x.toFixed(3)),
    y: Number(projected.y.toFixed(3)) });
}

const mismatchedNodeIds = [];
const rejectedRoutes = [];
for (const route of suppliedRoutes.filter((route) => route.mapgenieId !== null)) {
  const node = matched.get(route.mapgenieId);
  if (!node) throw new Error(`Unknown supplied flight route pin ${route.mapgenieId}.`);
  if (node.id !== route.taxiNodeId) mismatchedNodeIds.push({ pinId: route.mapgenieId,
    suppliedTaxiNodeId: route.taxiNodeId, clientTaxiNodeId: node.id });
  for (const destination of route.destinations) {
    if (!pathIds.has(`${node.id}:${destination.taxiNodeId}`)) {
      rejectedRoutes.push({ pinId: route.mapgenieId,
        fromTaxiNodeId: node.id, toTaxiNodeId: destination.taxiNodeId });
    }
  }
}
const sideConflicts = flightmasters.filter((pin) => pin.side !== sideFor(matched.get(pin.id)))
  .map((pin) => ({ pinId: pin.id, suppliedSide: pin.side,
    clientSide: sideFor(matched.get(pin.id)) }));
const existingIds = new Set(locations.map((point) => point.id));
const indexed = search.locations.filter(({ point }) => !existingIds.has(point.id));
for (const point of locations) {
  const name = point.nameKey.split(".").reduce((value, part) => value?.[part], english);
  const categoryKey = point.category.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  indexed.push({ mapId: "azeroth", mapName: "Azeroth", point: { ...point, name,
    label: english.map.categories[categoryKey],
    region: point.regionKey ? point.regionKey.split(".").reduce((value, part) => value?.[part], english) : "" }, count: 1 });
}
indexed.sort((left, right) => left.mapName.localeCompare(right.mapName)
  || left.point.name.localeCompare(right.point.name) || left.point.id.localeCompare(right.point.id));
search.locations = indexed;
search.source.markerCount = indexed.length;

await writeFile("public/maps/world-atlas/locations-mapgenie-supplements.json",
  `${JSON.stringify({ version: 1, locations }, null, 2)}\n`);
await writeFile("public/data/map-search/index.json", `${JSON.stringify(search, null, 2)}\n`);
await writeFile("src/i18n/locales/en.json", `${JSON.stringify(english, null, 2)}\n`);
await writeFile("data/client-research/flight-route-cross-check.json",
  `${JSON.stringify({ clientBuild: atlas.source.build,
    sourceFlightPins: flightmasters.length,
    publishedClientFlightPoints: publishedFlights.locations.length,
    addedTaxiNodeIds: [...missingIds].sort((left, right) => left - right),
    mismatchedNodeIds, rejectedRoutes, sideConflicts,
    excludedUnplacedOrUnroutedTaxiNodeIds: [9, 46, 3205, 3274] }, null, 2)}\n`);
console.log(`Added ${missing.length} verified flight points, ${vaults.length} guild vaults, and ${locations.length - missing.length - vaults.length} graveyard pins; rejected ${rejectedRoutes.length} supplied route claims.`);
