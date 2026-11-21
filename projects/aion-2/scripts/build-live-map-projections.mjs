import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const registryPath = path.join(root, "src/features/map/map-registry.ts");
const registry = fs.readFileSync(registryPath, "utf8");
// Localized names (for example en.mapInteriors.atlas) are valid definitions too.
const ids = [...registry.matchAll(/id: "([\w-]+)", name: (?:"[^"]+"|[\w.]+), dataUrl:/g)].map((match) => match[1]);
const catalog = {};
for (const id of ids) {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, "public/maps", id, "metadata.json"), "utf8"));
  for (const entry of [metadata, ...(metadata.insets ?? [])]) {
    const projection = entry.worldProjection;
    if (!projection || catalog[projection.mapId]) continue;
    const { origin, size } = projection;
    if (!(size.X > 0 && size.Y > 0)) throw new Error(`Invalid projection: ${projection.mapId}`);
    catalog[projection.mapId] = { mapId: id, origin: [origin.X, origin.Y], size: [size.X, size.Y], bounds: entry.bounds };
  }
}
const begin = "// BEGIN GENERATED LIVE MAP PROJECTIONS";
const source = registry.includes(begin) ? registry.slice(0, registry.indexOf(begin)).trimEnd() : registry.trimEnd();
fs.writeFileSync(registryPath, `${source}\n\n${begin}\nexport const LIVE_MAP_PROJECTIONS: Record<number, { mapId: string; origin: [number, number]; size: [number, number]; bounds: { minX: number; minY: number; maxX: number; maxY: number } }> = {\n${Object.entries(catalog).map(([id, value]) => `  "${id}": ${JSON.stringify(value)}`).join(",\n")}\n};\n// END GENERATED LIVE MAP PROJECTIONS\n`);
console.log(`Live map projections: ${Object.keys(catalog).length}`);
