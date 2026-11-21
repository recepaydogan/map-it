/** Index interactive published pins on registered maps, independent of active filters. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAP_DEFINITIONS, MAP_SOURCE } from "../src/features/map/map-registry.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await readJson("src/i18n/locales/en.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const worldSignposts = await readJson("data/client-research/world-signpost-relations.json");
const expectedBuild = atlas.source?.build;
if (worldSignposts.source.build !== expectedBuild) {
  throw new Error("Search aliases and world signposts belong to different client builds.");
}
const signpostsById = new Map(worldSignposts.signposts.map((post) =>
  [post.signpostId, post]));
const localize = (key) => {
  const value = key.split(".").reduce((record, part) => record?.[part], english);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing English map string ${key}.`);
  }
  return value;
};
const entries = [];
const seen = new Set();
for (const map of MAP_DEFINITIONS) {
  if (!map.dataUrl.startsWith("/maps/")) {
    throw new Error(`Map ${map.id} does not use a bundled client map path.`);
  }
  const path = join("public", map.dataUrl.slice(1));
  const metadata = await readJson(join(path, "metadata.json"));
  if (!Number.isInteger(expectedBuild)
    || metadata.source?.build !== expectedBuild
    || metadata.source?.product !== MAP_SOURCE.product) {
    throw new Error(`Map ${map.id} differs from the client search build.`);
  }
  const mapName = map.nameKey ? localize(map.nameKey) : map.name;
  if (!mapName) throw new Error(`Map ${map.id} lacks a display name.`);
  const layers = [metadata, ...await Promise.all((map.locationFiles ?? [])
    .map((file) => readJson(join(path, file))))];
  for (const layer of layers) {
    if (!Array.isArray(layer.locations)) throw new Error(`Map ${map.id} lacks locations.`);
    for (const raw of layer.locations) {
      if (raw.hiddenFromMap || raw.category === "point-of-interest") continue;
      const address = `${map.id}:${raw.id}`;
      if (seen.has(address)) throw new Error(`Duplicate map search pin ${address}.`);
      seen.add(address);
      const name = raw.nameKey ? localize(raw.nameKey) : raw.name;
      const region = raw.regionKey ? localize(raw.regionKey) : raw.region ?? "";
      const labelId = raw.category.replace(/-([a-z])/g, (_, letter) =>
        letter.toUpperCase());
      const label = ["profession-trainer", "class-trainer"].includes(raw.category) && raw.trainerTitleKey
        ? localize(raw.trainerTitleKey)
        : english.map.categories[labelId] ?? raw.label ?? "";
      if (typeof name !== "string" || !name.trim()
        || !Number.isFinite(raw.x) || !Number.isFinite(raw.y)
        || typeof raw.category !== "string") {
        throw new Error(`Invalid map search pin ${address}.`);
      }
      const signpost = raw.category === "directional-signpost"
        ? signpostsById.get(raw.id) : null;
      if (raw.category === "directional-signpost" && !signpost) {
        throw new Error(`Missing source signpost search aliases for ${raw.id}.`);
      }
      entries.push({ mapId: map.id, mapName,
        point: { ...raw, name, label, region,
          subtype: raw.subtype ?? raw.category, regionId: raw.regionId ?? "" },
        count: raw.occurrences ?? 1,
        ...(signpost ? { names: [name, ...signpost.destinations.flatMap(({ name: destination }) =>
          [destination, `Sign to ${destination}`])] } : {}) });
    }
  }
}
const aliases = new Set(entries.flatMap(({ point }) => point.aliasIds ?? []));
const publishedEntries = entries.filter(({ point }) => !aliases.has(point.id));
publishedEntries.sort((a, b) => a.mapName.localeCompare(b.mapName)
  || a.point.name.localeCompare(b.point.name)
  || a.point.id.localeCompare(b.point.id));
await writeFile(join(root, "public/data/map-search/index.json"),
  `${JSON.stringify({ version: 1, source: { product: MAP_SOURCE.product,
    build: expectedBuild, mapCount: MAP_DEFINITIONS.length,
    markerCount: publishedEntries.length }, locations: publishedEntries, items: [] }, null, 2)}\n`);
console.log(`Indexed ${publishedEntries.length} published pins on ${MAP_DEFINITIONS.length} registered maps.`);
await import("./build-map-item-search.mjs");
