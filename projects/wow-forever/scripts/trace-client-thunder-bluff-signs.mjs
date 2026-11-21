/** Identify every placed Thunder Bluff sign in the local Tauren sign model family. */
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
const cityEvidence = await readJson("data/client-research/published-marker-evidence.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const displayTable = catalog.identified.find(({ name }) => name === "GameObjectDisplayInfo");
const city = cityEvidence.markers.find(({ name }) => name === "Thunder Bluff");
const world = survey.maps.find(({ mapId }) => mapId === 1);
const terrain = atlas.terrainLayers.find(({ id }) => id === "map-1");
if (!displayTable || !city?.atlasBounds || !world || !terrain) {
  throw new Error("Thunder Bluff sign research lacks its source records.");
}
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== survey.source.build || build !== cityEvidence.source.build
    || build !== atlas.source.build || build !== catalog.source.build) {
    throw new Error("Thunder Bluff sign sources belong to different builds.");
  }
  const bytes = storage.readFile(fileName(displayTable.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== displayTable.layoutHash) {
    throw new Error("GameObjectDisplayInfo layout changed.");
  }
  const project = createClientWorldProjector(atlas);
  const signs = [];
  const models = new Map();
  const tileCache = new Map();
  for (const object of world.gameObjects) {
    if (object.displayId < 686 || object.displayId > 695) continue;
    const atlasPosition = project(1, object.worldPosition);
    if (!atlasPosition || atlasPosition.x < city.atlasBounds.minX
      || atlasPosition.x > city.atlasBounds.maxX
      || atlasPosition.y < city.atlasBounds.minY
      || atlasPosition.y > city.atlasBounds.maxY) continue;
    const sourceX = (atlasPosition.x - terrain.originX) / terrain.scaleX;
    const sourceY = (atlasPosition.y - terrain.originY) / terrain.scaleY;
    const tileX = Math.floor(sourceX / terrain.tileSize);
    const tileY = Math.floor(sourceY / terrain.tileSize);
    const tileKey = `${tileX},${tileY}`;
    if (!terrain.tileCoverage[0].includes(tileKey)) {
      throw new Error(`Thunder Bluff sign ${object.objectId} lacks a native tile.`);
    }
    const tilePath = resolve(root, "public/maps/world-atlas", terrain.basePath,
      `tiles/0/tile${tileX}x${tileY}.webp`);
    if (!tileCache.has(tilePath)) tileCache.set(tilePath,
      await sharp(tilePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true }));
    const { data, info } = tileCache.get(tilePath);
    const pixelX = Math.floor(sourceX - tileX * terrain.tileSize);
    const pixelY = Math.floor(sourceY - tileY * terrain.tileSize);
    const nativePixelAlpha = data[(pixelY * info.width + pixelX) * info.channels + 3];
    let model = models.get(object.displayId);
    if (!model) {
      const row = reader.getRowData(object.displayId);
      const modelFileDataId = row?.[1]?.data;
      if (!Number.isInteger(modelFileDataId) || modelFileDataId <= 0) {
        throw new Error(`Sign DisplayID ${object.displayId} lacks a model FileDataID.`);
      }
      const modelBytes = storage.readFile(fileName(modelFileDataId));
      const modelNameHints = [...new Set(modelBytes.toString("latin1")
        .match(/TaurenSign_[A-Za-z0-9_]+/g) ?? [])];
      if (modelBytes.toString("ascii", 0, 4) !== "MD21"
        || !modelNameHints.length) {
        throw new Error(`DisplayID ${object.displayId} is not a Tauren sign model.`);
      }
      model = { displayId: object.displayId, modelFileDataId,
        modelSha256: createHash("sha256").update(modelBytes).digest("hex"),
        modelNameHints };
      models.set(object.displayId, model);
    }
    signs.push({ objectId: object.objectId, name: object.name,
      worldPosition: object.worldPosition, atlasPosition,
      displayId: object.displayId, modelFileDataId: model.modelFileDataId,
      modelNameHints: model.modelNameHints, nativeTile: tileKey,
      nativePixelAlpha });
  }
  signs.sort((a, b) => a.objectId - b.objectId);
  if (signs.length < 3 || ![50492, 148424, 148425].every((id) =>
    signs.some(({ objectId }) => objectId === id))) {
    throw new Error("Known Thunder Bluff bank and goods signs are missing.");
  }
  await writeFile(join(root, "data/client-research/thunder-bluff-sign-family.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      gameObjects: survey.source.tables.find(({ name }) => name === "GameObjects"),
      displayInfo: { fileDataId: displayTable.fileDataId,
        sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections },
      cityPoiId: city.sourceIds.areaPoiId, cityLocationId: city.locationId },
    rule: "Placed Map 1 GameObjects inside the Thunder Bluff city overlay use verified MD21 TaurenSign models. A sign name is wayfinding evidence, not a service NPC or inventory.",
    models: [...models.values()].sort((a, b) => a.displayId - b.displayId),
    signs }, null, 2)}\n`);
  console.log(`Identified ${signs.length} Thunder Bluff signs across ${models.size} native models.`);
} finally {
  storage.close();
}
