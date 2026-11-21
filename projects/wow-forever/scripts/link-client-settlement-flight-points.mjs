/** Join published settlement POIs to nearby same-name client flight nodes. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const namedOverlaySettlements = await readJson("data/client-research/published-marker-evidence.json");
const otherSettlements = await readJson("data/client-research/published-settlement-poi-evidence.json");
const flights = await readJson("data/client-research/published-flight-point-evidence.json");
if (namedOverlaySettlements.source.build !== otherSettlements.source.build
  || namedOverlaySettlements.source.build !== flights.source.build) {
  throw new Error("Settlement and flight-point records belong to different client builds.");
}
const normalize = (value) => value.toLocaleLowerCase().replace(/^the\s+/, "")
  .replace(/[^a-z0-9]/g, "");
const placeAliases = new Map([
  ["Feathermoon Stronghold", "Feathermoon"],
  ["Theramore Isle", "Theramore"],
  ["Grom'gol Base Camp", "Grom'gol"],
]);
const settlements = [
  ...namedOverlaySettlements.markers.map((marker) => ({
    locationId: marker.locationId, name: marker.name, category: marker.category,
    mapId: marker.sourceIds.worldMapId,
    worldPosition: marker.worldPosition,
  })),
  ...otherSettlements.markers.map((marker) => ({
    locationId: marker.locationId, name: marker.name, category: marker.category,
    mapId: marker.mapId, worldPosition: marker.worldPosition,
  })),
];
const records = settlements.map((settlement) => {
  const sameNameFlights = flights.markers.flatMap((flight) => {
    const flightPlace = flight.name.split(",")[0].trim();
    if (flight.mapId !== settlement.mapId
      || normalize(flightPlace) !== normalize(placeAliases.get(settlement.name) ?? settlement.name)) return [];
    const distance = Math.hypot(
      flight.worldPosition[0] - settlement.worldPosition[0],
      flight.worldPosition[1] - settlement.worldPosition[1]);
    return [{ locationId: flight.locationId,
      taxiNodeId: flight.taxiNodeId, name: flight.name,
      horizontalWorldDistance: distance }];
  });
  const maximumDistance = settlement.category === "city" ? 500 : 300;
  const linkedFlights = sameNameFlights.filter(({ horizontalWorldDistance }) =>
    horizontalWorldDistance <= maximumDistance);
  return { settlementLocationId: settlement.locationId,
    settlementName: settlement.name, flightPoints: linkedFlights,
    distantSameNameFlights: sameNameFlights.filter(({ horizontalWorldDistance }) =>
      horizontalWorldDistance > maximumDistance) };
});
await writeFile(join(root, "data/client-research/settlement-flight-links.json"),
  `${JSON.stringify({ source: { product: flights.source.product,
    build: flights.source.build,
    settlementEvidence: ["published-marker-evidence.json", "published-settlement-poi-evidence.json"],
    flightEvidence: "published-flight-point-evidence.json" },
  rule: "The named settlement POI and named flight node share a world map, their place names match after punctuation/optional 'The' normalization or one of three explicit Feathermoon/Theramore/Grom'gol name aliases, and their world positions are within 300 horizontal world units for towns or 500 for cities.",
  note: "This locates a flight node near the settlement, not an NPC or building inside it.",
  records }, null, 2)}\n`);
console.log(`Linked ${records.reduce((count, record) => count + record.flightPoints.length, 0)} flight nodes to ${records.filter((record) => record.flightPoints.length).length} settlements.`);
