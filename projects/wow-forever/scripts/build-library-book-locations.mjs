/** Project firsthand Forever book reports onto the installed client's world atlas. */
import { readFile, writeFile } from "node:fs/promises";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
// Rumi's WoWhead Forever item uses this book artwork; keep the map pins visually consistent.
const bookMarkerIcon = "data/items/site-icons/inv_misc_book_12.jpg";
const source = await readJson("public/data/books/forever-library-books.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const search = await readJson("public/data/map-search/index.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const english = await readJson("src/i18n/locales/en.json");
if (source.version !== 2 || source.source?.kind !== "firsthand-player-reports") {
  throw new Error("Unexpected library book source catalog.");
}
if (search.source?.build !== atlas.source?.build || !Array.isArray(search.locations)) {
  throw new Error("Book pins and map search use different atlas builds.");
}
const published = source.books.flatMap((book) => book.locations
  .filter((location) => location.mapStatus === "published")
  .map((location) => ({ book, location })));
const locationKeys = source.books.flatMap((book) => book.locations.map((location) => `${book.id}:${location.id}`));
if (published.length !== 26 || source.books.length !== 26
  || new Set(source.books.map((book) => book.id)).size !== source.books.length
  || new Set(locationKeys).size !== locationKeys.length) {
  throw new Error("Library book source count or identifiers changed; review the evidence first.");
}

const unpackFloats = (value, count) => {
  if (typeof value !== "bigint") throw new Error("Expected packed UiMapAssignment floats.");
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const openTable = (storage, name) => {
  const record = catalog.identified.find((entry) => entry.name === name);
  if (!record) throw new Error(`Missing client table ${name}`);
  const file = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const { reader } = readLocalWdc5(storage.readFile(file));
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout changed in the installed client`);
  }
  return reader;
};
const sameFloats = (first, second) => first.length === second.length
  && first.every((number, index) => Math.abs(number - second[index]) < 0.0001);

const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const uiMaps = openTable(storage, "UiMap");
  const assignments = openTable(storage, "UiMapAssignment");
  const mapIdsByName = new Map(uiMaps.getAllIDs().map((id) => [uiMaps.getRowData(id)?.[0]?.string, id]));
  const assignmentsByUiMap = new Map();
  for (const id of assignments.getAllIDs()) {
    const uiMapId = assignments.getRowRelationship(id);
    const row = assignments.getRowData(id);
    if (!Number.isInteger(uiMapId) || row?.[4]?.data !== uiMapId) continue;
    const current = assignmentsByUiMap.get(uiMapId) ?? [];
    current.push({ mapId: row[6].data, worldRegion: unpackFloats(row[2].data, 6),
      uiMin: unpackFloats(row[0].data, 2), uiMax: unpackFloats(row[1].data, 2) });
    assignmentsByUiMap.set(uiMapId, current);
  }
  for (const layer of atlas.terrainLayers.filter(({ source: from }) => [0, 1].includes(from?.mapId))) {
    const current = (assignmentsByUiMap.get(947) ?? []).find(({ mapId }) => mapId === layer.source.mapId);
    if (!current || !sameFloats(current.worldRegion, layer.source.worldRegion)
      || !sameFloats(current.uiMin, layer.source.uiMin)
      || !sameFloats(current.uiMax, layer.source.uiMax)) {
      throw new Error(`Installed client differs from atlas world assignment ${layer.source.mapId}`);
    }
  }
  const project = createClientWorldProjector(atlas);
  const position = (zone, x, y) => {
    const matches = assignmentsByUiMap.get(mapIdsByName.get(zone)) ?? [];
    if (matches.length !== 1 || ![0, 1].includes(matches[0].mapId)) {
      throw new Error(`Missing or ambiguous world assignment for ${zone}`);
    }
    const { mapId, worldRegion } = matches[0];
    const worldX = worldRegion[3] - y / 100 * (worldRegion[3] - worldRegion[0]);
    const worldY = worldRegion[4] - x / 100 * (worldRegion[4] - worldRegion[1]);
    const point = project(mapId, [worldX, worldY]);
    if (!point || point.x < atlas.bounds.minX || point.x > atlas.bounds.maxX
      || point.y < atlas.bounds.minY || point.y > atlas.bounds.maxY) {
      throw new Error(`Book projects outside the atlas: ${zone} ${x}, ${y}`);
    }
    return point;
  };
  const locations = published.map(({ book, location }) => {
    const alternative = book.locations[0] !== location;
    const regionKey = alternative ? `map.books.alternates.${book.id}.${location.id}.region`
      : `map.books.regions.${book.id}`;
    const descriptionKey = alternative ? `map.books.alternates.${book.id}.${location.id}.detail`
      : `map.books.details.${book.id}`;
    const translatedRegion = alternative
      ? english.map.books?.alternates?.[book.id]?.[location.id]?.region
      : english.map.books?.regions?.[book.id];
    const translatedDetail = alternative
      ? english.map.books?.alternates?.[book.id]?.[location.id]?.detail
      : english.map.books?.details?.[book.id];
    if (location.x < 0 || location.x > 100 || location.y < 0 || location.y > 100
      || english.map.books?.names?.[book.id] !== book.name
      || translatedRegion !== location.zone || !translatedDetail) {
      throw new Error(`Invalid or untranslated book report: ${book.id}:${location.id}`);
    }
    const point = position(location.zone, location.x, location.y);
    return {
      id: `reported-library-book-${book.id}${alternative ? `-${location.id}` : ""}`,
      bookId: book.id, bookLocationId: location.id,
      name: "", nameKey: `map.books.names.${book.id}`,
      category: "book", label: "", subtype: "library-book", regionId: "", region: "",
      iconPath: bookMarkerIcon,
      regionKey, descriptionKey,
      detailLabelKey: "map.books.reportedLocation",
      x: Number(point.x.toFixed(3)), y: Number(point.y.toFixed(3)),
      referenceCoordinates: { x: location.x, y: location.y },
    };
  });
  await writeFile("public/maps/world-atlas/locations-books.json", `${JSON.stringify({
    version: 1,
    source: { kind: "firsthand-player-reports", url: source.source.url,
      coordinateStatus: "reported", clientBuild: storage.getProductInfo().buildNumber,
      atlasBuild: atlas.source.build, projection: "client-ui-map-assignment-zone-percent" },
    locations,
  }, null, 2)}\n`);
  const indexed = search.locations.filter(({ point }) => !point.id.startsWith("reported-library-book-"));
  for (const raw of locations) {
    const id = raw.bookId;
    const original = source.books.find((book) => book.id === id)?.locations[0]?.id === raw.bookLocationId;
    indexed.push({ mapId: "azeroth", mapName: "Azeroth",
      point: { ...raw, name: english.map.books.names[id], label: english.map.categories.book,
        region: original ? english.map.books.regions[id] : english.map.books.alternates[id][raw.bookLocationId].region,
        detailLabel: english.map.books.reportedLocation,
        description: original ? english.map.books.details[id] : english.map.books.alternates[id][raw.bookLocationId].detail }, count: 1 });
  }
  indexed.sort((a, b) => a.mapName.localeCompare(b.mapName)
    || a.point.name.localeCompare(b.point.name) || a.point.id.localeCompare(b.point.id));
  await writeFile("public/data/map-search/index.json", JSON.stringify({ ...search,
    source: { ...search.source, markerCount: indexed.length }, locations: indexed }));
  console.log(`Projected ${locations.length} library books.`);
} finally {
  storage.close();
}
