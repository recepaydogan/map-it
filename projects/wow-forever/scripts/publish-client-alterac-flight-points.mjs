/** Project route-corroborated TaxiNodes onto the extracted Alterac Valley map. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const terrain = await readJson("public/maps/wdt-790112/metadata.json");
const identities = await readJson("data/client-research/wdt-map-identities.json");
const taxi = await readJson("data/client-research/taxi-node-identities.json");
const network = await readJson("data/client-research/taxi-path-network.json");
const publishedWorld = await readJson("data/client-research/published-flight-point-evidence.json");
const worldLayerPath = "public/maps/world-atlas/locations-flight.json";
const worldLayer = await readJson(worldLayerPath);
const english = await readJson("src/i18n/locales/en.json");
const build = terrain.source?.build;
if (build !== identities.source.build || build !== taxi.source.build
  || build !== network.source.build || build !== publishedWorld.source.build
  || terrain.source.product !== identities.source.product
  || terrain.source.product !== taxi.source.product
  || terrain.source.missingFileDataIds.length
  || terrain.tileCoverage[0].length !== terrain.source.tileCount) {
  throw new Error("Alterac terrain and taxi records are incomplete or from different builds.");
}
const wdt = identities.records.find(({ wdtFileDataId }) =>
  wdtFileDataId === terrain.source.wdtFileDataId);
if (wdt?.maps.length !== 1 || wdt.maps[0].mapId !== 30
  || wdt.maps[0].name !== english.map.battlegroundMaps.alteracValley
  || wdt.tileCount !== terrain.source.tileCount) {
  throw new Error("The extracted terrain does not uniquely identify Alterac Valley Map 30.");
}
const { grid } = terrain.source;
const worldTileSize = 1600 / 3;
const project = ([worldX, worldY]) => ({
  x: (32 - worldY / worldTileSize - grid.minX) * terrain.tileSize,
  y: (32 - worldX / worldTileSize - grid.minY) * terrain.tileSize,
});
const withinBounds = ({ x, y }) => x >= terrain.bounds.minX && x <= terrain.bounds.maxX
  && y >= terrain.bounds.minY && y <= terrain.bounds.maxY;
const affiliation = ([hordeMount, allianceMount]) => hordeMount && allianceMount ? "both"
  : hordeMount ? "horde" : allianceMount ? "alliance" : null;
const selected = taxi.nodes.filter((node) => node.mapId === 30
  && node.routeStatus === "position-candidate"
  && node.routeObservationCount >= 2
  && node.routeEndpointDistance !== null && node.routeEndpointDistance <= 10
  && affiliation(node.mountCreatureIds) && withinBounds(project(node.worldPosition)));
if (!selected.length) throw new Error("No route-corroborated Alterac Valley TaxiNodes.");
for (const node of selected) {
  if (english.map.publishedFlightPoints[node.id] !== node.name) {
    throw new Error(`Add the exact TaxiNode ${node.id} name to en.json.`);
  }
}

const allNodes = new Map(taxi.nodes.map((node) => [node.id, node]));
const publishedWorldIds = new Set(publishedWorld.markers.map(({ taxiNodeId }) => taxiNodeId));
const near = (left, right) => Math.hypot(...left.map((value, index) => value - right[index])) <= 10;
const corroboratedRoute = (from, to) => network.paths.some((path) =>
  path.fromTaxiNodeId === from.id && path.toTaxiNodeId === to.id
  && path.nodes.length >= 2
  && path.nodes[0].mapId === from.mapId
  && path.nodes.at(-1).mapId === to.mapId
  && near(path.nodes[0].position, from.worldPosition)
  && near(path.nodes.at(-1).position, to.worldPosition));
const sharesAffiliation = (left, right) => left.mountCreatureIds.some((mount, index) =>
  mount > 0 && right.mountCreatureIds[index] > 0);
const reciprocalWorldLinks = selected.flatMap((node) => node.connectedTaxiNodeIds.flatMap((worldId) => {
  const world = allNodes.get(worldId);
  return world && publishedWorldIds.has(worldId)
    && sharesAffiliation(node, world)
    && corroboratedRoute(node, world) && corroboratedRoute(world, node)
    ? [{ localTaxiNodeId: node.id, worldTaxiNodeId: worldId }] : [];
}));
const linkedWorldByLocal = new Map(reciprocalWorldLinks.map(({ localTaxiNodeId, worldTaxiNodeId }) =>
  [localTaxiNodeId, worldTaxiNodeId]));
const locations = selected.map((node) => ({
  id: `client-taxi-node-${node.id}`,
  name: "",
  nameKey: `map.publishedFlightPoints.${node.id}`,
  category: "flight-master",
  label: "",
  subtype: "flight-master",
  regionId: "",
  region: "",
  detailLabelKey: `map.affiliations.${affiliation(node.mountCreatureIds)}`,
  x: project(node.worldPosition).x,
  y: project(node.worldPosition).y,
  ...(linkedWorldByLocal.has(node.id) ? {
    linkedMarkersTitleKey: "map.flightPoints.connections",
    linkedMarkers: [{ mapId: "azeroth", markerId: `client-taxi-node-${linkedWorldByLocal.get(node.id)}`,
      nameKey: `map.publishedFlightPoints.${linkedWorldByLocal.get(node.id)}` }],
  } : {}),
}));
worldLayer.locations = worldLayer.locations.map((location) => {
  const sourceId = Number(location.id.replace(/^client-taxi-node-/, ""));
  const links = reciprocalWorldLinks.filter(({ worldTaxiNodeId }) => worldTaxiNodeId === sourceId)
    .map(({ localTaxiNodeId }) => ({ mapId: "alterac-valley",
      markerId: `client-taxi-node-${localTaxiNodeId}`,
      nameKey: `map.publishedFlightPoints.${localTaxiNodeId}` }));
  const existing = location.linkedMarkers ?? [];
  const additions = links.filter((link) => !existing.some((candidate) =>
    candidate.mapId === link.mapId && candidate.markerId === link.markerId));
  return additions.length ? { ...location, linkedMarkers: [...existing, ...additions] } : location;
});
await writeFile(join(root, "public/maps/wdt-790112/locations-flight.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, worldLayerPath), `${JSON.stringify(worldLayer, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-alterac-flight-evidence.json"),
  `${JSON.stringify({ source: { product: terrain.source.product, build,
    wdtFileDataId: terrain.source.wdtFileDataId, wdtSha256: terrain.source.wdtSha256,
    taxiNodesSha256: taxi.source.sha256 },
  rule: "The client Map record uniquely joins the extracted WDT. Named TaxiNodes on Map 30 use the native 64×64 ADT grid and are published only when nearby route endpoints corroborate their positions.",
  caveat: "A TaxiNode coordinate does not establish the exact nearby NPC or current battleground service availability.",
  markers: selected.map((node) => ({ taxiNodeId: node.id, name: node.name,
    worldPosition: node.worldPosition, mapPosition: project(node.worldPosition),
    routePathIds: node.routePathIds, routeObservationCount: node.routeObservationCount,
    routeEndpointDistance: node.routeEndpointDistance })),
  reciprocalWorldLinks }, null, 2)}\n`);
console.log(`Published ${locations.length} Alterac Valley TaxiNodes and ${reciprocalWorldLinks.length} cross-map route links.`);
