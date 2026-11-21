import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { curateLandmarks } from "./curate-gta6-landmarks.mjs";
import { mergeMapMarkerSources } from "./gta6-marker-sources.mjs";
import { attachSupplementalMedia } from "./gta6-supplemental-media.mjs";
import curationPolicy from "./data/gta6-curation-policy.json" with { type: "json" };
import reviewedMatches from "./data/gta6-media-matches.json" with { type: "json" };
import sourceMatches from "./data/gta6-marker-source-matches.json" with { type: "json" };

// A pinned, openly licensed snapshot. Never hotlink the application to the map host.
const revision = "d406fea099e1df2bce42fd6b87eed04bce646629";
const repository = "rolux/gtadb.org";
const tileSet = "yanis,18";
const rawRoot = `https://raw.githubusercontent.com/${repository}/${revision}`;
const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, "artifacts", "gta6-import");
const publicRoot = path.join(root, "public");
const hash = bytes => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
await fs.mkdir(cache, { recursive: true });
const writeJson = async (file, value) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n");
};
async function request(url) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
}
async function snapshot(name, url) {
  const file = path.join(cache, name);
  try {
    const source = JSON.parse(await fs.readFile(`${file}.source.json`, "utf8"));
    if (source.url === url) return JSON.parse(await fs.readFile(file, "utf8"));
  }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  const data = JSON.parse((await request(url)).toString());
  await writeJson(file, data);
  await writeJson(`${file}.source.json`, { url });
  return data;
}
async function tree(parent, name, key) {
  const entries = await snapshot(`${key}-parent.json`, `https://api.github.com/repos/${repository}/contents/${parent}?ref=${revision}`);
  const directory = entries.find(entry => entry.name === name);
  if (!directory) throw new Error(`Missing directory ${parent}/${name}`);
  const result = await snapshot(`${key}-tree.json`, `https://api.github.com/repos/${repository}/git/trees/${directory.sha}?recursive=1`);
  if (result.truncated) throw new Error(`Incomplete ${key} tree`);
  return result.tree.filter(entry => entry.type === "blob");
}
const [raw, tiles, dayTiles] = await Promise.all([
  snapshot("landmarks.json", `${rawRoot}/map/data/6/landmarks.json`),
  tree("maps/tiles/6", tileSet, "tiles"),
  tree("maps/tiles/6", "day", "day-tiles"),
]);
const placeTypes = ["agriculture", "construction", "government", "hotel", "industrial", "landmark", "leisure", "mixed", "natural", "office", "other", "public", "residential", "restaurant", "retail", "transportation", "utilities"];
const media = JSON.parse(await fs.readFile(path.join(publicRoot, "data/gta6/media.json"), "utf8"));
const descriptions = JSON.parse(await fs.readFile(path.join(publicRoot, "data/gta6/descriptions.json"), "utf8"));
const markerArtwork = JSON.parse(await fs.readFile(path.join(publicRoot, "data/gta6/marker-artwork.json"), "utf8"));
const assets = [...media.assets.filter(asset => !asset.path.includes("/photos/")), ...markerArtwork.assets];
function terrain(id, sourceName, sourceTiles, maxZoom, folder, scale) {
  const coverage = Array.from({ length: maxZoom + 1 }, () => []);
  for (const tile of sourceTiles) {
    const match = tile.path.match(/^(\d+)\/\d+,(\d+),(\d+)\.jpg$/);
    if (!match) throw new Error(`Unexpected tile ${tile.path}`);
    const [, z, y, x] = match.map(Number);
    const level = maxZoom - z;
    if (level < 0) throw new Error("New zoom level requires a projection update");
    coverage[level].push(`${x},${y}`);
    assets.push({ path: `maps/leonida/${folder}/${level}/${x}-${y}.jpg`, upstream: `maps/tiles/6/${sourceName}/${tile.path}`, sha: tile.sha, size: tile.size });
  }
  return { id, basePath: ".", tilePattern: `${folder}/{level}/{x}-{y}.jpg`, tileSize: 256,
    detailLevels: coverage.map((_, level) => level), tileCoverage: coverage,
    sourceBounds: { minX: 0, minY: 0, maxX: 32768 / scale, maxY: 32768 / scale },
    originX: -16384, originY: -16384, scaleX: scale, scaleY: scale };
}
const terrainLayers = [terrain("leonida", tileSet, tiles, 5, "tiles", 1), terrain("day", "day", dayTiles, 6, "day/tiles", 0.5)];
const provisionalNameIds = new Set(curationPolicy.provisionalNameIds);
const rawCatalog = [];
for (const [id, row] of Object.entries(raw)) {
  const [inGameAddress, sourceCoordinates, , realWorldAddress, realCoordinates, , tags, color, edited] = row;
  const hasSourceCoordinates = sourceCoordinates?.length >= 2;
  const coordinates = hasSourceCoordinates ? sourceCoordinates : undefined;
  const category = placeTypes.find(type => tags.includes(type)) ?? "unclassified";
  const firstName = inGameAddress.split(",")[0].trim();
  const hasProvisionalName = firstName.startsWith('"') && provisionalNameIds.has(id);
  // Unknown game names must never silently become names of real-world buildings.
  const name = firstName && firstName !== "?" ? firstName : `${id} · ${inGameAddress.split(",").slice(1).join(",").trim() || "Leonida"}`;
  const landmark = {
    id, inGameAddress, realWorldAddress,
    ...(coordinates?.length >= 2 ? { gameCoordinates: { x: coordinates[0], y: coordinates[1] } } : {}),
    ...(realCoordinates?.length >= 2 ? { realWorldCoordinates: { latitude: realCoordinates[0], longitude: realCoordinates[1] } } : {}),
    tags: tags.filter(tag => !tag.startsWith("//") && !/^l\d+$/i.test(tag)),
    nameStatus: hasProvisionalName ? "unconfirmed"
      : !firstName || /^[?"]/.test(firstName) ? "unknown" : firstName.includes("?") ? "unconfirmed" : "confirmed",
    positionStatus: !coordinates?.length ? "unknown" : inGameAddress.endsWith("?") ? "unconfirmed" : "confirmed",
    realWorldStatus: !realWorldAddress || realWorldAddress === "?" ? "unknown" : tags.includes("unconfirmed") ? "unconfirmed" : "confirmed",
    streetAddressKnown: /\s(?:Ave|Blvd|Ct|Dr|Hwy|Ln|Pkwy|Pl|Rd|St|Way),/.test(inGameAddress),
    classified: category !== "unclassified",
    lastEdited: edited[0] ? new Date(edited[0] * 1000).toISOString() : undefined,
  };
  if (media.records[id]?.gamePhoto) landmark.gamePhoto = media.records[id].gamePhoto;
  if (descriptions.records[id]) landmark.description = descriptions.records[id];
  rawCatalog.push({ id: `leonida-${id.toLowerCase()}`, name, category: `place-${category}`, landmark,
    ...(media.records[id]?.iconPath ? { iconPath: media.records[id].iconPath } : {}),
    ...(coordinates?.length ? { x: coordinates[0], y: -coordinates[1] } : {}) });
  void color;
}
await writeJson(path.join(cache, "raw-catalog.json"), { records: rawCatalog });
const curated = curateLandmarks(rawCatalog, curationPolicy);
const bounds = { minX: -11008, minY: -11008, maxX: 10240, maxY: 9216 };
const supplemental = JSON.parse(await fs.readFile(path.join(root, "artifacts/gtabase-import/supplemental-markers.json"), "utf8"));
const previousManifest = JSON.parse(await fs.readFile(path.join(publicRoot, "data/gta6/asset-manifest.json"), "utf8"));
const merged = mergeMapMarkerSources(curated, supplemental, { ...reviewedMatches, ...sourceMatches }, bounds);
for (const { marker, targetId } of merged.attachments) {
  const landmark = merged.records.get(targetId).landmark;
  landmark.description ??= descriptions.records[marker.id];
}
const { photos, failures: photoFailures } = await attachSupplementalMedia(merged, media.assets, previousManifest.assets, publicRoot);
assets.push(...photos);
const catalog = [...merged.records.values()];
const comparisonCounts = Object.fromEntries(Object.entries(Object.groupBy(merged.comparisons, row => row.status))
  .map(([status, rows]) => [status, rows.length]));
const comparisonFile = path.join(cache, "source-comparison.json");
const previousComparison = await fs.readFile(comparisonFile, "utf8").then(JSON.parse).catch(error => {
  if (error.code !== "ENOENT") throw error;
  return { records: [], reconciled: [] };
});
const previousSources = new Map(previousComparison.records.map(row => [row.id, row]));
const reconciled = merged.comparisons.filter(row => previousComparison.gtadbRevision !== revision &&
  row.primarySourceId && previousSources.get(row.id)?.status === "secondary-only")
  .map(row => ({ id: row.id, name: row.name, from: previousSources.get(row.id).coordinates,
    to: row.primaryCoordinates, primarySourceId: row.primarySourceId, gtadbRevision: revision }));
await writeJson(comparisonFile, {
  gtadbRevision: revision, gtabaseUpdated: supplemental.updated, counts: comparisonCounts,
  reconciled: [...(previousComparison.reconciled ?? []), ...reconciled],
  records: merged.comparisons, photoFailures,
});
await writeJson(path.join(publicRoot, "data/gta6/marker-aliases.json"), merged.aliases);
const locations = catalog.filter(entry => entry.landmark.gameCoordinates).map(entry => ({ ...entry,
  label: entry.category.slice(6), subtype: entry.landmark.tags.join(" "),
  regionId: "leonida", region: entry.landmark.inGameAddress.split(",").slice(1).join(",").trim() || "Leonida",
  referenceCoordinates: entry.landmark.gameCoordinates,
}));
await writeJson(path.join(cache, "curation-report.json"), { ...curated.report, visibleRecords: catalog.length,
  placed: locations.length, unplaced: catalog.length - locations.length, audit: curated.audit });
const metadata = {
  schemaVersion: 1, displayName: "Leonida", bounds,
  initialBounds: { minX: -10500, minY: -10500, maxX: 3500, maxY: 8000 },
  rasterMasks: [
    { id: "printed-legend", bounds: { minX: 3904, minY: -11040, maxX: 10048, maxY: 9088 }, color: "#2c68a3" },
    { id: "printed-scale", bounds: { minX: -128, minY: 7648, maxX: 3392, maxY: 8320 }, color: "#2c68a3" },
  ],
  tileSize: 256, detailLevels: [0, 1, 2, 3, 4, 5], tileCoverage: [[], [], [], [], [], []],
  hideBaseTiles: true, backgroundColor: "#2c66a5", regions: [], locations,
  terrainLayers,
  terrainStyles: [
    { id: "community", labelKey: "map.styles.community", layerId: "leonida" },
    { id: "day", labelKey: "map.styles.day", layerId: "day", backgroundColor: "#2f90b0", hideRasterMasks: true },
  ],
};
await writeJson(path.join(publicRoot, "maps/leonida/metadata.json"), metadata);
await writeJson(path.join(publicRoot, "data/gta6/landmarks.json"), { version: 1, records: catalog });
await writeJson(path.join(publicRoot, "data/gta6/unplaced-landmarks.json"), { version: 1, records: catalog.filter(entry => !entry.landmark.gameCoordinates) });
await writeJson(path.join(publicRoot, "data/map-search/index.json"), { version: 1, locations: locations.map(point => ({ mapId: "leonida", mapName: "Leonida", point, count: 1,
  names: [point.name, point.landmark.id, point.landmark.inGameAddress, point.landmark.realWorldAddress, ...point.landmark.tags] })), items: [] });
await writeJson(path.join(publicRoot, "data/gta6/asset-manifest.json"), { revision, assets });
const notice = (await request(`${rawRoot}/LICENSE-DATA`)).toString() + "\nAdaptation: GTA 6 Interactive Map. Coordinates converted to a downward-positive Y axis; records grouped by place type; filenames normalized. Original photographs and map tile files are unchanged. Printed legend and scale decorations are covered in the app rendering.\n";
await fs.mkdir(path.join(publicRoot, "licenses"), { recursive: true });
await fs.writeFile(path.join(publicRoot, "licenses/gta6-map-data.txt"), notice);
let next = 0, completed = 0, downloaded = 0, bytes = 0;
const started = Date.now();
const progress = setInterval(() => console.log(JSON.stringify({ completed, total: assets.length, downloaded, megabytes: Math.round(bytes / 1048576), seconds: Math.round((Date.now() - started) / 1000) })), 10000);
const failures = [];
const tileCheckout = process.env.GTA6_TILE_SOURCE_CHECKOUT ? path.resolve(process.env.GTA6_TILE_SOURCE_CHECKOUT) : null;
await Promise.all(Array.from({ length: tileCheckout ? 24 : 12 }, async () => {
  while (next < assets.length) {
    const asset = assets[next++];
    const destination = path.resolve(publicRoot, asset.path);
    if (!destination.startsWith(publicRoot + path.sep)) throw new Error("Invalid output path");
    try {
      const existing = await fs.readFile(destination).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (existing && hash(existing) === asset.sha) { completed++; continue; }
      if (asset.path.endsWith(".svg")) throw new Error("Regenerate marker symbols with npm run import:media");
      const data = tileCheckout && asset.upstream.startsWith("maps/tiles/6/day/")
        ? await fs.readFile(path.join(tileCheckout, asset.upstream))
        : await request(asset.upstream.startsWith("https://") ? asset.upstream : `${rawRoot}/${asset.upstream}`);
      if (hash(data) !== asset.sha || data.length !== asset.size) throw new Error(`Integrity mismatch: ${asset.path}`);
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, data);
      downloaded++; completed++; bytes += data.length;
    } catch (error) { failures.push({ path: asset.path, error: String(error) }); }
  }
}));
clearInterval(progress);
const report = { revision, tileSet, records: catalog.length, placed: locations.length, unplaced: catalog.length - locations.length,
  curation: curated.report, sourceComparison: comparisonCounts, photoFailures,
  tiles: tiles.length, dayTiles: dayTiles.length, photos: assets.filter(asset => asset.path.includes("/photos/")).length, completed, failures };
await writeJson(path.join(cache, "import-report.json"), report);
console.log(JSON.stringify(report));
if (failures.length) process.exitCode = 1;
