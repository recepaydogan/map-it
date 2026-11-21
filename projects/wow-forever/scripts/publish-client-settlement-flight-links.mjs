/** Expose verified settlement/flight-node links in both map panels. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const research = await readJson("data/client-research/settlement-flight-links.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
if (research.source.build !== atlas.source?.build) {
  throw new Error("The settlement/flight links and atlas belong to different builds.");
}
const layerPaths = ["locations-client.json", "locations-settlements.json", "locations-flight.json"];
const layers = await Promise.all(layerPaths.map(async (name) => ({
  name, data: await readJson(`public/maps/world-atlas/${name}`),
})));
const allLocations = new Map(layers.flatMap(({ data }) => data.locations.map((location) =>
  [location.id, location])));
const settlementsByFlightId = new Map();
for (const record of research.records) {
  const settlement = allLocations.get(record.settlementLocationId);
  if (!settlement) throw new Error(`Missing settlement ${record.settlementLocationId}.`);
  const remainingGroups = (settlement.linkedMarkerGroups ?? [])
    .filter(({ titleKey }) => titleKey !== "map.places.flightPoints");
  if (remainingGroups.length) settlement.linkedMarkerGroups = remainingGroups;
  else delete settlement.linkedMarkerGroups;
  if (!record.flightPoints.length) continue;
  const links = record.flightPoints.map(({ locationId }) => {
    const flight = allLocations.get(locationId);
    if (!flight || flight.category !== "flight-master") {
      throw new Error(`Missing linked flight point ${locationId}.`);
    }
    const connected = settlementsByFlightId.get(locationId) ?? [];
    connected.push({ mapId: "azeroth", markerId: settlement.id,
      nameKey: settlement.nameKey });
    settlementsByFlightId.set(locationId, connected);
    return { mapId: "azeroth", markerId: flight.id,
      nameKey: flight.nameKey };
  });
  settlement.linkedMarkerGroups = [
    ...(settlement.linkedMarkerGroups ?? []),
    { titleKey: "map.places.flightPoints", links },
  ];
}
const flightLayer = layers.find(({ name }) => name === "locations-flight.json");
for (const flight of flightLayer.data.locations) {
  const links = settlementsByFlightId.get(flight.id) ?? [];
  const remainingGroups = (flight.linkedMarkerGroups ?? [])
    .filter(({ titleKey }) => titleKey !== "map.flightPoints.nearbySettlements");
  if (remainingGroups.length) flight.linkedMarkerGroups = remainingGroups;
  else delete flight.linkedMarkerGroups;
  if (links.length) {
    flight.linkedMarkerGroups = [
      ...(flight.linkedMarkerGroups ?? []),
      { titleKey: "map.flightPoints.nearbySettlements", links },
    ];
  }
}
for (const { name, data } of layers) {
  await writeFile(join(root, "public/maps/world-atlas", name),
    `${JSON.stringify(data, null, 2)}\n`);
}
console.log(`Published ${[...settlementsByFlightId.values()].reduce((sum, links) => sum + links.length, 0)} bidirectional settlement/flight-point links.`);
