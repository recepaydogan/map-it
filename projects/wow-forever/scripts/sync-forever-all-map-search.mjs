/** Index the consumed Forever All map layers and retire the older New search entries. */
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const indexPath = "public/data/map-search/index.json";
const index = await readJson(indexPath);
const filenames = ["gatherables", "new-gathering", "books", "rares", "quest-givers",
  "new-quest-givers", "quests", "new-trainers", "updates", "vendors"];
const catalogs = await Promise.all(filenames.map((name) =>
  readJson(`public/maps/world-atlas/locations-forever-${name === "vendors" ? "" : "all-"}${name}.json`)));
const english = await readJson("src/i18n/locales/en.json");
const allLocations = catalogs.flatMap((catalog) => catalog.locations);
if (catalogs.some((catalog) => !Array.isArray(catalog.locations) || catalog.locations.length === 0)
  || new Set(allLocations.map((point) => point.id)).size !== allLocations.length) {
  throw new Error("Missing or duplicate All map locations");
}
const searchableLocations = allLocations.filter((point) => !point.questGiverMarkerId);
const legacyIds = new Set();
for (const name of ["gatherables", "rares", "quest-givers", "quests"]) {
  const catalog = await readJson(`public/maps/world-atlas/locations-forever-new-${name}.json`);
  for (const point of catalog.locations) legacyIds.add(point.id);
}
const oldBooks = await readJson("public/maps/world-atlas/locations-books.json");
const instances = await readJson("public/maps/world-atlas/locations-instances.json");
const community = await readJson("public/maps/world-atlas/locations-mapgenie-community.json");
const supplements = [...instances.locations, ...community.locations.filter((point) => point.category === "battlemaster")];
const supplementalIds = new Set(supplements.map((point) => point.id));
for (const point of oldBooks.locations) legacyIds.add(point.id);
const aliases = new Set(allLocations.flatMap((point) => point.aliasIds ?? []));
const unmatchedBooks = oldBooks.locations.filter((point) => !aliases.has(point.id));
const locations = [...searchableLocations, ...unmatchedBooks.map((point) => ({
  ...point, name: point.name || english.map.books.names[point.bookId] || point.bookId,
})), ...supplements.map((point) => ({ ...point,
  name: point.name || point.nameKey?.split(".").reduce((value, key) => value?.[key], english) || point.id,
}))];
const entries = index.locations.filter(({ point }) => !legacyIds.has(point.id)
  && !supplementalIds.has(point.id)
  && point.category !== "point-of-interest"
  && !point.id.startsWith("reported-rare-")
  && !point.id.startsWith("wowhead-vendor-")
  && !point.id.startsWith("forever-all-"));
for (const point of locations) {
  const key = point.category.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  const labelKey = point.category === "gatherable-herb" ? "gatherableHerbs"
    : point.category === "gatherable-ore" ? "gatherableOre"
      : point.category.startsWith("gatherable-")
        ? point.category.slice("gatherable-".length).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
        : key;
  const searchPoint = { ...point };
  delete searchPoint.droppedBy;
  entries.push({ mapId: "azeroth", mapName: "Azeroth",
    point: { ...searchPoint, label: point.trainerTitleKey
      ? point.trainerTitleKey.split(".").reduce((value, part) => value?.[part], english)
      : english.map.gatherableTypes[point.subtype] ?? english.map.categories[labelKey] ?? point.label },
    ...(point.questOffers ? { names: [point.name, ...point.questOffers.map((offer) => offer.name)] } : {}),
    count: 1 });
}
entries.sort((left, right) => left.mapName.localeCompare(right.mapName)
  || left.point.name.localeCompare(right.point.name)
  || left.point.id.localeCompare(right.point.id));
const next = { ...index, source: { ...index.source, markerCount: entries.length }, locations: entries };
if (process.argv.includes("--check")) {
  if (JSON.stringify(next) !== JSON.stringify(index)) throw new Error("All search index is out of date");
} else {
  await writeFile(indexPath, `${JSON.stringify(next)}\n`);
}
console.log(`Indexed ${searchableLocations.length} Forever All map pins and ${unmatchedBooks.length} unmatched reported books; ${entries.length} searchable locations total.`);
// Source chunks store location offsets, so regenerate whenever the pin order changes.
const searchBuild = spawnSync(process.execPath, ["--experimental-strip-types",
  fileURLToPath(new URL("./build-map-item-search.mjs", import.meta.url)),
  ...(process.argv.includes("--check") ? ["--check"] : []),
], { stdio: "inherit" });
if (searchBuild.error) throw searchBuild.error;
if (searchBuild.status !== 0) process.exit(searchBuild.status ?? 1);
