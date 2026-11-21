/** Check that the configured Azeroth map layers load together without ID or bound conflicts. */
import { readFile } from "node:fs/promises";

const source = await readFile("src/features/map/map-registry.ts", "utf8");
const files = [...source.match(/locationFiles: \[([^\]]+)\]/)?.[1].matchAll(/"([^"]+)"/g) ?? []]
  .map((match) => match[1]);
const base = "public/maps/world-atlas/";
const metadata = JSON.parse(await readFile(`${base}metadata.json`, "utf8"));
const ids = new Set(metadata.locations.map((location) => location.id));
for (const file of files) {
  const data = JSON.parse(await readFile(`${base}${file}`, "utf8"));
  for (const location of data.locations) {
    if (typeof location.id !== "string" || typeof location.name !== "string" ||
      typeof location.category !== "string" || !Number.isFinite(location.x) ||
      !Number.isFinite(location.y)) throw new Error(`Invalid shape ${file}: ${location.id}`);
    if (ids.has(location.id)) throw new Error(`Duplicate ${file}: ${location.id}`);
    ids.add(location.id);
    const bounds = metadata.insets?.find((inset) => inset.id === location.regionId)?.bounds ?? metadata.bounds;
    if (location.x < bounds.minX || location.x > bounds.maxX ||
      location.y < bounds.minY || location.y > bounds.maxY) {
      throw new Error(`Out of bounds ${file}: ${location.id}`);
    }
  }
}
console.log(`${files.length} layers, ${ids.size} unique locations`);
