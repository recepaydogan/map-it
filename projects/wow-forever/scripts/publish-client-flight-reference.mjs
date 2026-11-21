/** Publish route-corroborated flight points as reciprocal database records. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const worldEvidence = await readJson("data/client-research/published-flight-point-evidence.json");
const alteracEvidence = await readJson("data/client-research/published-alterac-flight-evidence.json");
const worldPath = "public/maps/world-atlas/locations-flight.json";
const alteracPath = "public/maps/wdt-790112/locations-flight.json";
const world = await readJson(worldPath);
const alterac = await readJson(alteracPath);
const indexPath = "public/data/reference/index.json";
const index = await readJson(indexPath);
const english = await readJson("src/i18n/locales/en.json");
if (worldEvidence.source.build !== alteracEvidence.source.build
  || worldEvidence.source.product !== alteracEvidence.source.product
  || index.version !== 1 || !Array.isArray(index.entries) || !Array.isArray(index.categories)) {
  throw new Error("Flight references use incompatible source records.");
}

const evidence = new Map([...worldEvidence.markers.map((marker) => [marker.locationId, marker]),
  ...alteracEvidence.markers.map((marker) => [`client-taxi-node-${marker.taxiNodeId}`, marker])]);
const sources = [
  ...world.locations.map((location) => ({ location, mapId: "azeroth" })),
  ...alterac.locations.map((location) => ({ location, mapId: "alterac-valley" })),
];
if (sources.length !== evidence.size || new Set(sources.map(({ location }) => location.id)).size !== sources.length) {
  throw new Error("Flight marker counts or IDs differ from client evidence.");
}
const byId = new Map(sources.map((source) => [source.location.id, source]));
const records = sources.map(({ location, mapId }) => {
  const source = evidence.get(location.id);
  const name = english.map?.publishedFlightPoints?.[source?.taxiNodeId];
  if (!source || location.category !== "flight-master" || !name || name !== source.name
    || location.nameKey !== `map.publishedFlightPoints.${source.taxiNodeId}`
    || !location.detailLabelKey?.startsWith("map.affiliations.")) {
    throw new Error(`Unverified flight point ${mapId}:${location.id}.`);
  }
  const connections = (location.linkedMarkers ?? []).map((link) => {
    const destination = byId.get(link.markerId);
    if (!destination || destination.mapId !== link.mapId
      || destination.location.nameKey !== link.nameKey
      || !(destination.location.linkedMarkers ?? []).some((returnLink) =>
        returnLink.mapId === mapId && returnLink.markerId === location.id)) {
      throw new Error(`Unverified flight route ${mapId}:${location.id} → ${link.mapId}:${link.markerId}.`);
    }
    return { id: destination.location.id, category: "flight-points",
      name: english.map.publishedFlightPoints[Number(destination.location.id.replace("client-taxi-node-", ""))],
      noteKey: destination.location.detailLabelKey };
  });
  const summary = { id: location.id, category: "flight-points", chunk: "client-taxi-nodes",
    name, icon: "maps/client-icons/tracking/flight-master.png",
    subtitleKey: location.detailLabelKey };
  const entry = { ...summary,
    facts: [],
    sections: connections.length ? [{ title: "map.flightPoints.connections", links: connections }] : [],
    locations: [{ mapId, markerId: location.id, name }],
    source: `TaxiNodes + TaxiPath, ${worldEvidence.source.product} build ${worldEvidence.source.build}`,
  };
  return { location, summary, entry };
});
const prior = index.entries.filter((entry) => entry.category !== "flight-points");
const summaries = [...prior, ...records.map(({ summary }) => summary)]
  .sort((left, right) => left.category.localeCompare(right.category) || left.name.localeCompare(right.name));
const counts = new Map();
for (const summary of summaries) counts.set(summary.category, (counts.get(summary.category) ?? 0) + 1);
const categories = [...counts].map(([id, count]) => ({ id, count }));
await mkdir(join(root, "public/data/reference/flight-points"), { recursive: true });
await writeFile(join(root, indexPath), `${JSON.stringify({ version: 1, categories, entries: summaries }, null, 2)}\n`);
await writeFile(join(root, "public/data/reference/flight-points/client-taxi-nodes.json"),
  `${JSON.stringify({ version: 1, entries: Object.fromEntries(records.map(({ entry }) => [entry.id, entry])) }, null, 2)}\n`);
for (const [path, layer] of [[worldPath, world], [alteracPath, alterac]]) {
  layer.locations = layer.locations.map((location) => ({ ...location,
    reference: { category: "flight-points", id: location.id } }));
  await writeFile(join(root, path), `${JSON.stringify(layer, null, 2)}\n`);
}
console.log(`Published ${records.length} reciprocal flight-point database entries.`);
