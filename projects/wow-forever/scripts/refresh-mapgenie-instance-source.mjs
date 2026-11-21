/** Snapshot MapGenie's public Azeroth instance locations and calibration towns. */
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceUrl = "https://mapgenie.io/api/v1/maps/1027/data";
const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`MapGenie returned ${response.status}.`);
const data = await response.json();
if (data.map?.id !== 1027 || !Array.isArray(data.locations)) {
  throw new Error("Unexpected MapGenie Azeroth response.");
}
const select = (categoryIds) => data.locations
  .filter((location) => categoryIds.includes(location.category_id))
  .map(({ id, title, latitude, longitude, description }) => {
    const point = { id, title, latitude: Number(latitude), longitude: Number(longitude) };
    if (!Number.isInteger(id) || typeof title !== "string" || !title.trim()
      || !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude)) {
      throw new Error(`Invalid MapGenie location ${id}.`);
    }
    return { ...point,
      ...(categoryIds.length === 1 ? { kind: /\braid\b/i.test(description ?? "") ? "raid" : "dungeon" } : {}),
    };
  });
const instances = select([27625]);
const calibrationPlaces = select([27619, 27633]);
if (instances.length < 29 || calibrationPlaces.length < 50
  || new Set(instances.map(({ title }) => title)).size !== instances.length) {
  throw new Error("MapGenie instance or calibration coverage unexpectedly changed.");
}
const snapshot = { source: {
  pageUrl: "https://mapgenie.io/world-of-warcraft-forever/maps/azeroth",
  dataUrl: sourceUrl, mapId: 1027, instanceCategoryId: 27625,
  retrievedAt: new Date().toISOString(),
}, instances, calibrationPlaces };
await writeFile(join(root, "data/client-research/mapgenie-instance-source.json"),
  `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`Saved ${instances.length} MapGenie instances and ${calibrationPlaces.length} calibration places.`);
