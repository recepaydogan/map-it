/** Publish two positioned Hyjal signposts from seven native sign records. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const trace = await readJson("data/client-research/hyjal-map-poi-trace.json");
const models = await readJson("data/client-research/service-object-models.json");
const terrain = await readJson("public/maps/wdt-7245741/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const gameObjectSource = trace.source.tables.find(({ name }) => name === "GameObjects");
const pointer = models.records.find(({ displayId, modelNameHints }) =>
  displayId === 388 && modelNameHints.some((hint) => hint.includes("SignPostPointer")));
if (trace.source.product !== terrain.source.product
  || trace.source.build !== terrain.source.build || models.source.build !== terrain.source.build
  || trace.source.mapId !== 2995 || trace.source.wdtFileDataId !== 7245741
  || trace.source.wdtSha256 !== terrain.source.wdtSha256
  || trace.source.nativeTileCount !== terrain.source.tileCount
  || gameObjectSource?.sha256 !== models.source.gameObjects.sha256
  || !pointer || trace.pois.length || trace.objects.length !== 7) {
  throw new Error("Hyjal Crater signpost sources or native terrain changed.");
}
const clusters = [];
for (const object of [...trace.objects].sort((left, right) => left.objectId - right.objectId)) {
  if (object.displayId !== 388 || !object.name || !object.onExtractedTerrain) {
    throw new Error(`Hyjal object ${object.objectId} is not a placed directional sign.`);
  }
  let cluster = clusters.find((items) => items.every((item) => Math.hypot(
    item.worldPosition[0] - object.worldPosition[0],
    item.worldPosition[1] - object.worldPosition[1]) < 1));
  if (!cluster) { cluster = []; clusters.push(cluster); }
  cluster.push(object);
}
if (clusters.length !== 2 || clusters.map((cluster) => cluster.length).sort().join(",") !== "3,4") {
  throw new Error("Hyjal signpost placements no longer form two verified points.");
}
const records = [];
const locations = [];
for (const cluster of clusters) {
  const first = cluster[0];
  const key = String(first.objectId);
  const names = [...new Set(cluster.map(({ name }) => name))];
  const description = english.map.hyjalSigns?.[key]?.description;
  if (!description || names.some((name) => !description.includes(name))) {
    throw new Error(`Hyjal sign ${key} destination labels are missing from English text.`);
  }
  const x = cluster.reduce((sum, object) => sum + object.mapPosition.x, 0) / cluster.length;
  const y = cluster.reduce((sum, object) => sum + object.mapPosition.y, 0) / cluster.length;
  const tileX = Math.floor(x / terrain.tileSize);
  const tileY = Math.floor(y / terrain.tileSize);
  const tileKey = `${tileX},${tileY}`;
  if (!terrain.tileCoverage[0].includes(tileKey)) throw new Error(`Hyjal sign ${key} lacks native terrain.`);
  const pixel = await sharp(join(root, "public/maps/wdt-7245741/tiles/0",
    `tile${tileX}x${tileY}.webp`)).ensureAlpha().extract({
    left: Math.floor(x - tileX * terrain.tileSize),
    top: Math.floor(y - tileY * terrain.tileSize), width: 1, height: 1,
  }).raw().toBuffer();
  if (pixel[3] === 0) throw new Error(`Hyjal sign ${key} lies on transparent terrain.`);
  const locationId = `client-hyjal-signpost-${key}`;
  locations.push({ id: locationId, name: "", nameKey: "map.directionalSigns.name",
    category: "signpost", label: "", subtype: "client-direction-sign",
    regionId: "", region: "", regionKey: "map.battlegroundMaps.hyjalCrater",
    descriptionKey: `map.hyjalSigns.${key}.description`, x, y });
  records.push({ locationId, objectIds: cluster.map(({ objectId }) => objectId),
    postedNames: names, displayId: 388, modelFileDataId: pointer.modelFileDataId,
    mapPosition: { x, y }, nativeTile: tileKey, nativePixelAlpha: pixel[3] });
}
await writeFile(join(root, "public/maps/wdt-7245741/locations-signs.json"),
  `${JSON.stringify({ locations }, null, 2)}\n`);
await writeFile(join(root, "data/client-research/published-hyjal-sign-evidence.json"),
  `${JSON.stringify({ source: { product: trace.source.product, build: trace.source.build,
    mapId: trace.source.mapId, wdtFileDataId: trace.source.wdtFileDataId,
    wdtSha256: trace.source.wdtSha256, gameObjects: gameObjectSource,
    displayInfo: models.source.displayInfo },
    selectionRule: "Seven named GameObjects on Map 2995 share signpost-pointer DisplayID 388 and group into two positions within one world unit.",
    caveat: "Posted names are sign text; they do not locate those destinations or prove an active travel service.",
    markers: records }, null, 2)}\n`);
console.log(`Published ${records.length} Hyjal Crater signposts from ${trace.objects.length} native objects.`);
