/** Collapse native world objective state variants into one pin per position. */
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const profile = await readJson("data/client-research/area-poi-category-profile.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
if (profile.source.product !== atlas.source.product || profile.source.build !== atlas.source.build) {
  throw new Error("World objective POIs and terrain belong to different client builds.");
}

const rows = profile.groups.filter(({ iconId }) => iconId === 135)
  .flatMap(({ records, uiCategory, uiPriority }) => records.map((record) =>
    ({ ...record, uiCategory, uiPriority })));
const clusters = [];
for (const row of rows.sort((left, right) => left.poiId - right.poiId)) {
  let cluster = clusters.find((candidate) => candidate[0].mapId === row.mapId
    && candidate[0].name === row.name
    && candidate.every((member) => Math.hypot(
      member.worldPosition[0] - row.worldPosition[0],
      member.worldPosition[1] - row.worldPosition[1]) <= 20));
  if (!cluster) { cluster = []; clusters.push(cluster); }
  cluster.push(row);
}
if (rows.length !== 47 || clusters.length !== 17) {
  throw new Error(`World objective state grouping changed: ${rows.length} rows, ${clusters.length} positions.`);
}
const tileCache = new Map();
const markers = [];
const locations = [];
for (const cluster of clusters) {
  const row = cluster[0];
  const nameKey = `map.publishedWorldObjectives.${row.poiId}`;
  if (english.map.publishedWorldObjectives?.[row.poiId] !== row.name) {
    throw new Error(`Missing exact client name for world objective ${row.poiId}.`);
  }
  const layer = atlas.terrainLayers.find(({ id }) => id === `map-${row.mapId}`);
  if (!layer || cluster.some((member) => member.mapId !== row.mapId || member.name !== row.name)) {
    throw new Error(`World objective ${row.poiId} lacks a matching native terrain layer.`);
  }
  const { x, y } = row.atlasPosition;
  if (x < atlas.bounds.minX || x > atlas.bounds.maxX || y < atlas.bounds.minY || y > atlas.bounds.maxY) {
    throw new Error(`World objective ${row.poiId} is outside the atlas.`);
  }
  const sourceX = (x - layer.originX) / layer.scaleX;
  const sourceY = (y - layer.originY) / layer.scaleY;
  const tileX = Math.floor(sourceX / layer.tileSize);
  const tileY = Math.floor(sourceY / layer.tileSize);
  const tileKey = `${tileX},${tileY}`;
  if (!layer.tileCoverage[0].includes(tileKey)) {
    throw new Error(`World objective ${row.poiId} lacks a native terrain tile.`);
  }
  const tilePath = resolve(root, "public/maps/world-atlas", layer.basePath,
    `tiles/0/tile${tileX}x${tileY}.webp`);
  if (!tileCache.has(tilePath)) {
    tileCache.set(tilePath, await sharp(tilePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
  }
  const { data, info } = tileCache.get(tilePath);
  const pixelX = Math.floor(sourceX - tileX * layer.tileSize);
  const pixelY = Math.floor(sourceY - tileY * layer.tileSize);
  const alpha = data[(pixelY * info.width + pixelX) * info.channels + 3];
  if (alpha === 0) throw new Error(`World objective ${row.poiId} is on transparent terrain.`);
  const locationId = `client-world-objective-poi-${row.poiId}`;
  const areas = [...new Set(cluster.filter(({ areaName }) => areaName)
    .map(({ areaId, areaName }) => `${areaId}:${areaName}`))];
  if (areas.length > 1) throw new Error(`World objective ${row.poiId} has conflicting source areas.`);
  const [areaId, areaName] = areas[0]?.split(":") ?? [];
  if (areaId && english.map.publishedAreaNames?.[areaId] !== areaName) {
    throw new Error(`Missing exact client area for world objective ${row.poiId}.`);
  }
  locations.push({ id: locationId, name: "", nameKey,
    category: "world-objective", label: "", subtype: "client-area-poi",
    regionId: areaId ?? "", region: "",
    ...(areaId ? { regionKey: `map.publishedAreaNames.${areaId}` } : {}), x, y });
  markers.push({ locationId, name: row.name, mapId: row.mapId,
    representativePoiId: row.poiId, sourcePoiIds: cluster.map(({ poiId }) => poiId),
    sourceWorldPosition: row.worldPosition, atlasPosition: row.atlasPosition,
    areaId: areaId ? Number(areaId) : null, areaName: areaName ?? null,
    nativeTile: tileKey, nativePixelAlpha: alpha });
}
await writeFile(join(root, "public/maps/world-atlas/locations-world-objectives.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-world-objective-evidence.json"),
  `${JSON.stringify({ source: profile.source,
    selectionRule: "Exact-name icon-135 AreaPOI state variants on the two world maps are clustered only when every pair lies within 20 world units. The lowest POI ID supplies the marker position.",
    caveat: "These are named client map locations. The data does not establish current control, an interaction, reward, or service NPC.",
    markers }, null, 2)}\n`);
console.log(`Published ${locations.length} world objective locations from ${rows.length} native POI rows.`);
