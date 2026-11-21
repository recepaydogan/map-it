import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { build } from "esbuild";

const root = path.resolve(import.meta.dirname, "..");
const directory = path.resolve(root, process.argv[2] ?? "public");
const json = async file => JSON.parse(await fs.readFile(file, "utf8"));
const [raw, metadata, catalog, unplaced, manifest, english, sourceTiles] = await Promise.all([
  json(path.join(root, "artifacts/gta6-import/landmarks.json")),
  json(path.join(directory, "maps/leonida/metadata.json")),
  json(path.join(directory, "data/gta6/landmarks.json")),
  json(path.join(directory, "data/gta6/unplaced-landmarks.json")),
  json(path.join(directory, "data/gta6/asset-manifest.json")),
  json(path.join(root, "src/i18n/locales/en.json")),
  json(path.join(root, "artifacts/gta6-import/tiles-tree.json")),
]);
const bundled = await build({ stdin: { contents: 'export { MAP_CATEGORIES, getPointAppearance } from "./src/features/map/map-config.ts"; export { matchesLandmarkFilters, DEFAULT_LANDMARK_FILTERS } from "./src/features/map/map-landmark-filters.ts";', resolveDir: root }, bundle: true, platform: "node", format: "esm", write: false, define: { "import.meta.env": '{"BASE_URL":"/","VITE_CONTENT_BASE_URL":""}' } });
const { MAP_CATEGORIES, getPointAppearance, matchesLandmarkFilters, DEFAULT_LANDMARK_FILTERS } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].contents).toString("base64")}`);
const categories = new Set(MAP_CATEGORIES.map(category => category.id));
for (const category of MAP_CATEGORIES) assert.equal(typeof category.labelKey.split(".").reduce((value, key) => value?.[key], english), "string", category.labelKey);
const records = new Map(catalog.records.map(record => [record.landmark.id, record]));
const curationPolicy = await json(path.join(root, 'scripts/data/gta6-curation-policy.json'));
for (const id of curationPolicy.mergeOnlyAnonymousIds) {
  assert(!records.get(id)?.areaLabel, `Unreviewed anonymous record became a standalone pin: ${id}`);
}
for (const [id, name] of [['L3402', 'Tennis Courts'], ['L3408', "Ricardo's Tires"],
  ['L3411', 'RES TRADE PAINT'], ['L3416', 'The Atoll Bar & Grill']]) {
  assert.equal(records.get(id)?.name, name, `Missing named source addition: ${id}`);
}
const points = new Map(metadata.locations.map(point => [point.landmark.id, point]));
const assets = new Map(manifest.assets.map(asset => [asset.path, asset]));
const media = await json(path.join(directory, "data/gta6/media.json"));
const supplemental = await json(path.join(root, "artifacts/gtabase-import/supplemental-markers.json"));
const supplementalById = new Map(supplemental.records.map(row => [row.id, row]));
const comparison = await json(path.join(root, "artifacts/gta6-import/source-comparison.json"));
const secondaryByTarget = Map.groupBy(comparison.records, row => row.canonicalId);
for (const row of comparison.records) {
  if (!row.canonicalId) {
    assert(!catalog.records.some(candidate => candidate.landmark.id === row.id), `Unmatched source became a pin: ${row.id}`);
    continue;
  }
  const record = catalog.records.find(candidate => candidate.id === row.canonicalId);
  assert(record, `Missing source comparison target: ${row.id}`);
  const secondaryId = `leonida-${row.id}`;
  if (secondaryId !== record.id) {
    assert(record.aliasIds.includes(secondaryId), `Missing durable alias: ${row.id}`);
    assert(!catalog.records.some(candidate => candidate.id === secondaryId), `Duplicate mapped location: ${row.id}`);
  }
}
for (const asset of manifest.assets.filter(asset => asset.path.includes('/photos/'))) {
  assert.equal(new URL(asset.upstream).hostname, 'www.gtabase.com', 'Photos must remain GTABase-sourced');
}
const descriptions = await json(path.join(directory, "data/gta6/descriptions.json"));
const aliases = await json(path.join(directory, "data/gta6/marker-aliases.json"));
assert.equal(aliases['leonida-gas-station-025'], 'leonida-l2245');
assert.equal(records.get('L2245')?.landmark.positionStatus, 'confirmed');
for (const [id, description] of Object.entries(descriptions.records)) {
  const pointId = `leonida-${id.toLowerCase()}`;
  const record = catalog.records.find(record => record.id === (aliases[pointId] ?? pointId));
  assert.equal(record?.landmark.description, description, `Missing or misplaced description: ${id}`);
}
const publishedDescriptions = new Set(Object.values(descriptions.records));
for (const record of catalog.records) {
  const description = record.landmark.description;
  if (!description || publishedDescriptions.has(description)) continue;
  assert((secondaryByTarget.get(record.id) ?? []).some(row =>
    supplementalById.get(row.id)?.description?.replace(/<[^>]*>/g, "").trim() === description),
  `Unbacked supplemental description: ${record.id}`);
}
if (directory !== path.join(root, "public")) {
  for (const file of ["data/gta6/descriptions.json", "data/gta6/landmarks.json", "data/gta6/asset-manifest.json", "maps/leonida/metadata.json", "data/map-search/index.json"]) {
    assert.deepEqual(await json(path.join(directory, file)), await json(path.join(root, "public", file)), `Stale build content: ${file}`);
  }
}
const audit = await json(path.join(root, "artifacts/gta6-import/curation-report.json"));
const covered = audit.audit.flatMap(group => group.ids);
assert.equal(covered.length, new Set(covered).size, "Every raw record has exactly one curation decision");
assert.deepEqual([...covered].sort(), Object.keys(raw).sort(), "No raw records lost from the audit");
assert.equal(records.size, catalog.records.length);
assert.equal(points.size, metadata.locations.length);
assert.equal(unplaced.records.length + points.size, records.size);
assert.equal(points.size, audit.placed);
assert(!categories.has("place-unclassified") && !categories.has("place-other"));
for (const category of MAP_CATEGORIES) {
  assert(category.nativeIconPath && assets.has(category.nativeIconPath), `Missing native icon: ${category.id}`);
  assert(!category.nativeIconPath.includes("question-mark"));
}
const expectedPhotos = new Set();
for (const record of catalog.records) {
  const detail = record.landmark, id = detail.id, row = raw[id];
  assert(row, `Unbacked GTADB marker: ${id}`);
  const appearance = getPointAppearance(record);
  assert(appearance.nativeIconPath.endsWith('.png'), `Expected PNG artwork: ${id}`);
  assert(assets.has(appearance.nativeIconPath.replace(/^\//, '')), `Missing rendered artwork: ${id}`);
  assert(appearance.markerClass.includes('map-marker-icon-only'), `Opaque marker badge: ${id}`);
  assert(categories.has(record.category), `Unmapped category ${record.category}`);
  assert(!/^L\d+\s*[·-]/.test(record.name), `Anonymous ID shown: ${record.name}`);
  assert(!/unclassified|\?/.test(record.category + record.name.toLowerCase()));
  if (detail.nameStatus === "unknown") {
    assert(record.areaLabel, 'Unknown place names must use their actual region label');
    assert(record.name.length > 0);
  }
  assert.equal(detail.inGameAddress, row[0]);
  assert.equal(detail.realWorldAddress, row[3]);
  const memberIds = record.memberIds.map(member => member.replace("leonida-", "").toUpperCase()).filter(member => raw[member]);
  assert(memberIds.includes(id));
  const allowedTags = new Set(memberIds.flatMap(member => raw[member][6]));
  for (const tag of detail.tags) assert(allowedTags.has(tag));
  const photoSources = memberIds.map(member => media.records[member]?.gamePhoto).filter(Boolean);
  if (detail.gamePhoto && !photoSources.includes(detail.gamePhoto)) {
    const photo = assets.get(detail.gamePhoto);
    assert((secondaryByTarget.get(record.id) ?? []).some(source => {
      const image = supplementalById.get(source.id)?.image;
      return image && new URL(image, "https://www.gtabase.com").href === photo?.upstream;
    }), "Photo must belong to this site");
  }
  assert.deepEqual(record.aliasIds, record.memberIds.filter(member => member !== record.id));
  assert.equal(Boolean(detail.gameCoordinates), row[1]?.length >= 2, `GTADB placement must back ${id}`);
  if (detail.gameCoordinates) {
    const point = points.get(id);
    assert(point, `Missing pin ${id}`);
    const [x, y] = row[1];
    const source = { x, y };
    assert.equal(point.x, source.x);
    assert.equal(point.y, -source.y);
    assert.deepEqual(point.referenceCoordinates, source);
    assert(point.x >= metadata.bounds.minX && point.x <= metadata.bounds.maxX && point.y >= metadata.bounds.minY && point.y <= metadata.bounds.maxY, `Out of bounds ${id}`);
  } else {
    assert(!points.has(id));
    assert(unplaced.records.some(entry => entry.id === record.id));
    assert.equal(record.x, undefined);
    assert.equal(record.y, undefined);
  }
  assert.equal(detail.realPhoto, undefined, "Real-world photos must not ship");
  if (detail.gamePhoto) { assert(assets.has(detail.gamePhoto)); expectedPhotos.add(detail.gamePhoto); }
  if (record.iconPath) { assert(assets.has(record.iconPath)); assert(!record.iconPath.includes("question-mark")); }
}
assert.equal(catalog.records.filter(r => r.name === "Watson Bay").length, 1);
for (const id of curationPolicy.townAnchorIds) assert.equal(records.get(id)?.category, 'place-town');
assert.equal(records.get("L3391").name, "Kelly County");
assert.equal(records.get("L1082").name, "Kelly County");
assert(records.get("L3391").memberIds.includes("leonida-l3392"));
assert(records.get("L1082").memberIds.includes("leonida-l1085"));
for (const id of ["L527", "L278", "L279", "L280"]) {
  assert(records.has(id), `Named Kelly County facility must remain: ${id}`);
  assert(!records.get("L3391").memberIds.includes(`leonida-${id.toLowerCase()}`));
  assert(!records.get("L1082").memberIds.includes(`leonida-${id.toLowerCase()}`));
}
const artwork = await json(path.join(directory, 'data/gta6/marker-artwork.json'));
assert.equal(records.get("L280").iconPath, artwork.symbols['water-tower']);
assert(!records.get("L527").memberIds.includes("leonida-l278"), "Kelly County compounds stay separate");
assert(records.get("L281").memberIds.includes("leonida-l2674"), "Raceway turns join the raceway");
assert(catalog.records.filter(r => r.name === "Xero Gas Station").length > 1, "Distinct branches stay separate");
const dayTileTree = await json(path.join(root, "artifacts/gta6-import/day-tiles-tree.json"));
let tileCount = 0;
for (const [id, tree, maxZoom, folder] of [["leonida", sourceTiles, 5, "tiles"], ["day", dayTileTree, 6, "day/tiles"]]) {
  const layer = metadata.terrainLayers.find(layer => layer.id === id);
  assert(layer, id);
  const expectedTiles = tree.tree.filter(entry => entry.type === "blob");
  const coverage = layer.tileCoverage.map(level => new Set(level));
  for (const tile of expectedTiles) {
    const [z, y, x] = tile.path.match(/\/(\d+),(\d+),(\d+)\.jpg$/).slice(1).map(Number);
    const level = maxZoom - z;
    const localPath = `maps/leonida/${folder}/${level}/${x}-${y}.jpg`;
    assert.equal(assets.get(localPath)?.sha, tile.sha);
    assert(coverage[level].has(`${x},${y}`));
    // Independent projection check against the shared 32768-unit / 1024-pixel zoom-zero grid.
    const span = 32768 / (4 * 2 ** z);
    assert.equal(layer.originX + x * layer.tileSize * 2 ** level * layer.scaleX, x * span - 16384);
    assert.equal(layer.originY + y * layer.tileSize * 2 ** level * layer.scaleY, y * span - 16384);
  }
  assert.equal(coverage.reduce((n, level) => n + level.size, 0), expectedTiles.length);
  tileCount += expectedTiles.length;
}
assert.equal(tileCount, manifest.assets.filter(asset => asset.path.includes("/tiles/")).length);
for (const style of metadata.terrainStyles) {
  assert(metadata.terrainLayers.some(layer => layer.id === style.layerId));
  assert.equal(typeof style.labelKey.split(".").reduce((value, key) => value?.[key], english), "string");
}
assert.equal(manifest.assets.filter(asset => asset.path.includes("/photos/")).length, expectedPhotos.size);
const rules = [
  ["name", "confirmed", record => record.nameStatus === "confirmed"],
  ["position", "unknown", record => !record.gameCoordinates],
  ["gamePhoto", "with", record => Boolean(record.gamePhoto)],
];
for (const [key, value, predicate] of rules) for (const record of catalog.records) {
  assert.equal(matchesLandmarkFilters(record.landmark, { ...DEFAULT_LANDMARK_FILTERS, [key]: value }), predicate(record.landmark));
}
for (const record of catalog.records) assert.equal(matchesLandmarkFilters(record.landmark, { ...DEFAULT_LANDMARK_FILTERS, name: "confirmed", gamePhoto: "with" }), record.landmark.nameStatus === "confirmed" && Boolean(record.landmark.gamePhoto));
let next = 0;
await Promise.all(Array.from({ length: 12 }, async () => {
  while (next < manifest.assets.length) {
    const asset = manifest.assets[next++];
    const file = path.resolve(directory, asset.path);
    assert(file.startsWith(directory + path.sep));
    const bytes = await fs.readFile(file);
    assert.equal(bytes.length, asset.size, asset.path);
    assert.equal(createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex"), asset.sha, asset.path);
    const image = await sharp(bytes).metadata();
    assert(image.width > 0 && image.height > 0, asset.path);
    if (asset.path.includes("/tiles/")) assert.deepEqual([image.width, image.height], [256, 256], asset.path);
  }
}));
assert((await fs.readFile(path.join(directory, "licenses/gta6-map-data.txt"), "utf8")).includes("CC BY 4.0"));
console.log(JSON.stringify({ status: "passed", directory, records: records.size, pins: points.size, unplaced: unplaced.records.length, tiles: tileCount, photos: expectedPhotos.size, validatedAssets: next, sourceProjection: "verified", filters: "verified" }));
