/** Trace positioned transport-related signs without inferring active services. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import sharp from "sharp";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const survey = await readJson("data/client-research/map-placement-survey.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const settlements = await readJson("data/client-research/settlement-poi-candidates.json");
const table = catalog.identified.find(({ name }) => name === "GameObjectDisplayInfo");
if (!table) throw new Error("Missing GameObjectDisplayInfo registration.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
try {
  const build = storage.getProductInfo().buildNumber;
  if (survey.source.build !== build || settlements.source.build !== build
    || atlas.source.build !== build) {
    throw new Error("Transport sign sources belong to different client builds.");
  }
  const bytes = storage.readFile(fileName(table.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed.");
  }
  const candidates = survey.maps.filter(({ mapId }) => [0, 1].includes(mapId))
    .flatMap(({ mapId, gameObjects }) => gameObjects
      .filter(({ name }) => /zeppelin|round trips/i.test(name))
      .map((object) => ({ ...object, mapId })));
  const project = createClientWorldProjector(atlas);
  const signs = [];
  for (const object of candidates) {
    const display = reader.getRowData(object.displayId);
    const modelFileDataId = display?.[1]?.data;
    if (!Number.isInteger(modelFileDataId) || modelFileDataId <= 0) {
      throw new Error(`Missing model for transport object ${object.objectId}.`);
    }
    const model = storage.readFile(fileName(modelFileDataId));
    const modelNameHints = [...new Set((model.toString("latin1")
      .match(/[A-Za-z][A-Za-z0-9_/-]{8,}/g) ?? [])
      .filter((value) => /sign|zeppelin|boat|dock|port/i.test(value)))].slice(0, 20);
    const nearbySettlements = settlements.records.filter(({ mapId }) => mapId === object.mapId)
      .map(({ poiId, name, worldPosition }) => ({ poiId, name,
        worldDistance: Math.hypot(worldPosition[0] - object.worldPosition[0],
          worldPosition[1] - object.worldPosition[1]) }))
      .sort((a, b) => a.worldDistance - b.worldDistance).slice(0, 3);
    const atlasPosition = project(object.mapId, object.worldPosition);
    const terrain = atlas.terrainLayers.find(({ id }) => id === `map-${object.mapId}`);
    if (!atlasPosition || !terrain) throw new Error(`No terrain for ${object.objectId}.`);
    const sourceX = (atlasPosition.x - terrain.originX) / terrain.scaleX;
    const sourceY = (atlasPosition.y - terrain.originY) / terrain.scaleY;
    const tileX = Math.floor(sourceX / terrain.tileSize);
    const tileY = Math.floor(sourceY / terrain.tileSize);
    const nativeTile = `${tileX},${tileY}`;
    if (!terrain.tileCoverage[0].includes(nativeTile)) {
      throw new Error(`Transport sign ${object.objectId} has no native tile.`);
    }
    const tilePath = resolve(root, "public/maps/world-atlas", terrain.basePath,
      `tiles/0/tile${tileX}x${tileY}.webp`);
    const { data, info } = await sharp(tilePath).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    const pixelX = Math.floor(sourceX - tileX * terrain.tileSize);
    const pixelY = Math.floor(sourceY - tileY * terrain.tileSize);
    const nativePixelAlpha = data[(pixelY * info.width + pixelX) * info.channels + 3];
    signs.push({ ...object, atlasPosition, nativeTile, nativePixelAlpha,
      modelFileDataId,
      modelSignature: model.subarray(0, 4).toString("ascii"), modelNameHints,
      nearbySettlements });
  }
  await writeFile(join(root, "data/client-research/transport-sign-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      gameObjects: survey.source.tables.find(({ name }) => name === "GameObjects"),
      displayInfo: { fileDataId: table.fileDataId,
        sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } },
    caveat: "A placed transport sign does not prove an active route, schedule, or boarding point.",
    signs }, null, 2)}\n`);
  console.log(`Traced ${signs.length} placed transport-related objects.`);
} finally {
  storage.close();
}
