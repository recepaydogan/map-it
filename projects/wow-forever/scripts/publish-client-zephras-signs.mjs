/** Publish native pictogram signposts placed on the verified Zephras inset. */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import BLPFile from "js-blp";
import sharp from "sharp";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const identity = await readJson("data/client-research/zephras-client-identity.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const english = await readJson("src/i18n/locales/en.json");
const indexed = new Map(catalog.identified.map((record) => [record.name, record]));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const mapId = 2991;
const inset = atlas.terrainLayers.find(({ source }) => source?.mapId === mapId);
if (!inset || inset.source.placement !== "overview-inset"
  || inset.source.wdtFileDataId !== identity.targetWdtFileDataId
  || !identity.wdtIdMatches.some(({ table, rowId, value }) =>
    table === "Map" && rowId === mapId && value === inset.source.wdtFileDataId)) {
  throw new Error("Zephras inset lacks a verified client Map/WDT identity.");
}
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (catalog.source.build !== build || atlas.source.build !== build
    || identity.source.build !== build) {
    throw new Error("Zephras signs and source tables belong to different builds.");
  }
  const readTable = (name) => {
    const record = indexed.get(name);
    if (!record) throw new Error(`Missing ${name} table registration.`);
    const bytes = storage.readFile(fileName(record.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
      throw new Error(`${name} layout differs from the local executable.`);
    }
    return { reader, source: { name, fileDataId: record.fileDataId,
      sha256: sha256(bytes), omittedSections } };
  };
  const objects = readTable("GameObjects");
  const displays = readTable("GameObjectDisplayInfo");
  const project = createClientWorldProjector(atlas);
  const iconDirectory = join(root, "public/maps/client-icons/zephras-signs");
  await mkdir(iconDirectory, { recursive: true });
  const byDisplay = new Map();
  const evidence = [];
  const locations = [];
  let commonBoardTextureId = null;
  const getModelArtwork = async (displayId) => {
    if (byDisplay.has(displayId)) return byDisplay.get(displayId);
    const display = displays.reader.getRowData(displayId);
    if (!Array.isArray(display)) throw new Error(`Missing display ${displayId}.`);
    const modelFileDataId = display[1]?.data;
    if (!Number.isSafeInteger(modelFileDataId) || modelFileDataId <= 0) {
      throw new Error(`Display ${displayId} lacks a model file.`);
    }
    const model = storage.readFile(fileName(modelFileDataId));
    const textureIds = [];
    let offset = 0;
    while (offset + 8 <= model.length) {
      const signature = model.subarray(offset, offset + 4).toString("ascii");
      const size = model.readUInt32LE(offset + 4);
      if (size > model.length - offset - 8) throw new Error(`Invalid model chunk in ${modelFileDataId}.`);
      if (signature === "TXID") {
        if (size % 4 !== 0) throw new Error(`Invalid TXID chunk in ${modelFileDataId}.`);
        for (let position = offset + 8; position < offset + 8 + size; position += 4) {
          textureIds.push(model.readUInt32LE(position));
        }
      }
      offset += size + 8;
    }
    if (offset !== model.length || textureIds.length !== 2) {
      throw new Error(`Display ${displayId} is not a two-texture Zephras sign model.`);
    }
    const [boardTextureId, iconFileDataId] = textureIds;
    if (commonBoardTextureId === null) commonBoardTextureId = boardTextureId;
    if (boardTextureId !== commonBoardTextureId) {
      throw new Error(`Display ${displayId} uses a different signboard texture.`);
    }
    const iconBytes = storage.readFile(fileName(iconFileDataId));
    const blp = new BLPFile(iconBytes);
    if (blp.width !== 128 || blp.height !== 128) {
      throw new Error(`Unexpected sign pictogram dimensions for ${iconFileDataId}.`);
    }
    const path = `maps/client-icons/zephras-signs/${iconFileDataId}.png`;
    await sharp(blp.getPixels(0).readBuffer(),
      { raw: { width: blp.width, height: blp.height, channels: 4 } })
      .png().toFile(join(root, "public", path));
    const artwork = { displayId, modelFileDataId, modelSha256: sha256(model),
      boardTextureId, iconFileDataId, iconSha256: sha256(iconBytes), iconPath: path };
    byDisplay.set(displayId, artwork);
    return artwork;
  };
  for (const objectId of objects.reader.getAllIDs()) {
    const row = objects.reader.getRowData(objectId);
    if (!Array.isArray(row) || row[4]?.data !== mapId) continue;
    const name = row[0]?.string;
    if (!name) throw new Error(`Unnamed Zephras object ${objectId}; inspect before publication.`);
    const nameSlug = name.toLowerCase().replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (english.map?.zephrasSigns?.[nameSlug] !== name) {
      throw new Error(`Missing Zephras sign name ${name} in en.json.`);
    }
    const positionBytes = Buffer.alloc(12);
    for (let index = 0; index < 3; index += 1) {
      positionBytes.writeUInt32LE(Number((row[1].data >> BigInt(index * 32))
        & 0xffff_ffffn), index * 4);
    }
    const worldPosition = [0, 4, 8].map((offset) => positionBytes.readFloatLE(offset));
    const atlasPosition = project(mapId, worldPosition);
    const tileX = Math.floor((atlasPosition.x - inset.originX) / inset.scaleX / inset.tileSize);
    const tileY = Math.floor((atlasPosition.y - inset.originY) / inset.scaleY / inset.tileSize);
    if (!inset.tileCoverage[0].includes(`${tileX},${tileY}`)) {
      throw new Error(`Zephras sign ${objectId} projects outside native terrain.`);
    }
    const artwork = await getModelArtwork(row[5].data);
    const locationId = `client-zephras-sign-${objectId}`;
    const nameKey = `map.zephrasSigns.${nameSlug}`;
    locations.push({ id: locationId, name: "", nameKey,
      category: name === "Bank and Auction House" ? "bank-sign" : "signpost",
      label: "", subtype: "native-signpost",
      regionId: "", region: "", regionKey: "map.zephrasIsle",
      iconPath: artwork.iconPath, x: atlasPosition.x, y: atlasPosition.y });
    evidence.push({ locationId, objectId, name, mapId, worldPosition, atlasPosition,
      nativeTile: [tileX, tileY], ...artwork });
  }
  if (!evidence.length) throw new Error("No placed Zephras signposts were found.");
  await writeFile(join(root, "public/maps/world-atlas/locations-zephras-signs.json"),
    `${JSON.stringify({ locations }, null, 2)}\n`);
  await writeFile(join(root, "data/client-research/published-zephras-sign-evidence.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build,
      tables: [objects.source, displays.source], mapId,
      wdtFileDataId: inset.source.wdtFileDataId,
      baseSignboardTextureFileDataId: commonBoardTextureId },
    rule: "Named GameObjects on client Map 2991 use the same two-texture signboard model family. Their exact world positions are projected through the verified Zephras WDT grid onto covered native tiles; each second model texture is the sign's own pictogram.",
    caveat: "These are placed wayfinding signs, not verified NPCs, inventories, available services, or transport schedules.",
    markers: evidence }, null, 2)}\n`);
  console.log(`Published ${locations.length} Zephras signposts with ${byDisplay.size} native pictograms.`);
} finally {
  storage.close();
}
