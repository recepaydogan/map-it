/** Publish named, positioned taxi nodes backed by repeatable client route data. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const identities = await readJson("data/client-research/taxi-node-identities.json");
const english = await readJson("src/i18n/locales/en.json");
if (atlas.source?.build !== identities.source.build) {
  throw new Error("The flight network and atlas belong to different client builds.");
}
const affiliation = ([hordeMount, allianceMount]) => {
  if (hordeMount > 0 && allianceMount > 0) return "both";
  if (hordeMount > 0) return "horde";
  if (allianceMount > 0) return "alliance";
  return null;
};
const hasMapPosition = ({ x, y }) => x >= atlas.bounds.minX && x <= atlas.bounds.maxX
  && y >= atlas.bounds.minY && y <= atlas.bounds.maxY;
const selected = identities.nodes.filter((node) => node.atlasPosition
  && hasMapPosition(node.atlasPosition)
  && node.routeStatus === "position-candidate"
  && node.routeObservationCount >= 2
  && node.routeEndpointDistance !== null && node.routeEndpointDistance <= 10
  && affiliation(node.mountCreatureIds) !== null);
const byId = new Map(selected.map((node) => [node.id, node]));
for (const node of selected) {
  if (english.map?.publishedFlightPoints?.[node.id] !== node.name) {
    throw new Error(`Add the client name for TaxiNode ${node.id} to map.publishedFlightPoints in en.json.`);
  }
}
const sharesAffiliation = (left, right) => left.mountCreatureIds.some((mount, index) =>
  mount > 0 && right.mountCreatureIds[index] > 0);
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
  linkedMarkersTitleKey: "map.flightPoints.connections",
  x: node.atlasPosition.x,
  y: node.atlasPosition.y,
  linkedMarkers: node.outgoingTaxiNodeIds.flatMap((targetId) => {
    const target = byId.get(targetId);
    return target && sharesAffiliation(node, target)
      ? [{ mapId: "azeroth", markerId: `client-taxi-node-${targetId}`,
        nameKey: `map.publishedFlightPoints.${targetId}` }] : [];
  }),
}));
await writeFile(join(root, "public/maps/world-atlas/locations-flight.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-flight-point-evidence.json"),
  `${JSON.stringify({ source: identities.source,
    selectionRule: "Named TaxiNodes on the atlas with a nonzero mount slot, at least one nearby arrival and departure route observation on the same world map, and a mean endpoint within 10 world units of the node's exact client position.",
    affiliationRule: "Mount slot order is inferred from named Stormwind and Thunder Bluff records; both nonzero slots mean both factions.",
    positionNote: "The marker uses the exact TaxiNodes position. A flight-master NPC may stand nearby rather than at this coordinate.",
    markers: selected.map((node) => ({
      locationId: `client-taxi-node-${node.id}`,
      taxiNodeId: node.id,
      name: node.name,
      mapId: node.mapId,
      worldPosition: node.worldPosition,
      atlasPosition: node.atlasPosition,
      mountCreatureIds: node.mountCreatureIds,
      inferredAffiliation: affiliation(node.mountCreatureIds),
      routeObservationCount: node.routeObservationCount,
      routeEndpointDistance: node.routeEndpointDistance,
      routePathIds: node.routePathIds,
      outgoingTaxiNodeIds: node.outgoingTaxiNodeIds,
    })),
  }, null, 2)}\n`);
console.log(`Published ${locations.length} named client flight points with ${locations.reduce((count, location) => count + location.linkedMarkers.length, 0)} directed links.`);
