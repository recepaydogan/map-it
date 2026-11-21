/** Trace positioned client records on complete native battleground terrains. */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const identities = await readJson("data/client-research/wdt-map-identities.json");
const battlegrounds = await readJson("data/client-research/battlemaster-map-links.json");
const byName = new Map(catalog.identified.map((entry) => [entry.name, entry]));
const targets = [
  { name: "Warsong Gulch", mapId: 489, wdtFileDataId: 790291, slug: "warsong" },
  { name: "Arathi Basin", mapId: 529, wdtFileDataId: 790377, slug: "arathi" },
  { name: "Darkspear Islands", mapId: 2997, wdtFileDataId: 7251908, slug: "darkspear" },
  { name: "Hyjal Crater", mapId: 2995, wdtFileDataId: 7245741, slug: "hyjal" },
];
const verified = await Promise.all(targets.map(async (target) => {
  const terrain = await readJson(`public/maps/wdt-${target.wdtFileDataId}/metadata.json`);
  const mapIdentity = identities.records.find(({ wdtFileDataId }) =>
    wdtFileDataId === target.wdtFileDataId);
  const mapLink = battlegrounds.links.find(({ battlegroundName, mapId }) =>
    battlegroundName === target.name && mapId === target.mapId);
  if (catalog.source.build !== terrain.source.build
    || identities.source.build !== terrain.source.build
    || battlegrounds.source.build !== terrain.source.build
    || terrain.source.wdtFileDataId !== target.wdtFileDataId
    || mapIdentity?.maps.length !== 1 || mapIdentity.maps[0].mapId !== target.mapId
    || mapIdentity.maps[0].name !== target.name
    || terrain.source.tileCount !== mapIdentity.tileCount
    || terrain.source.missingFileDataIds.length || !mapLink) {
    throw new Error(`${target.name} terrain and BattlemasterList use inconsistent client records.`);
  }
  if (terrain.tileCoverage[0].length !== mapIdentity.tileCount
    || terrain.tileCoverage[0].some((tile) => {
      const [x, y] = tile.split(",");
      return !existsSync(join(root, `public/maps/wdt-${target.wdtFileDataId}/tiles/0`,
        `tile${x}x${y}.webp`));
    })) {
    throw new Error(`${target.name} native tile extraction is incomplete.`);
  }
  return { ...target, terrain, mapLink };
}));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const registration = byName.get(name);
  if (!registration) throw new Error(`No ${name} registration.`);
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error(`${name} layout changed in the local client.`);
  }
  return { reader, source: { name, fileDataId: registration.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
};
const unpack = (value, count) => {
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
const project = ([worldX, worldY], terrain) => ({
  x: (32 - worldY / (1600 / 3) - terrain.source.grid.minX) * terrain.tileSize,
  y: (32 - worldX / (1600 / 3) - terrain.source.grid.minY) * terrain.tileSize,
});
try {
  if (verified.some(({ terrain }) =>
    storage.getProductInfo().buildNumber !== terrain.source.build)) {
    throw new Error("The installed client build changed.");
  }
  const areaPoi = readTable("AreaPOI");
  const gameObjects = readTable("GameObjects");
  for (const { name, mapId, slug, terrain, mapLink } of verified) {
  const pois = areaPoi.reader.getAllIDs().flatMap((id) => {
    const row = areaPoi.reader.getRowData(id);
    if (!Array.isArray(row) || areaPoi.reader.getRowRelationship(id) !== mapId) return [];
    const worldPosition = unpack(row[3].data, 2);
    const mapPosition = project(worldPosition, terrain);
    const tile = `${Math.floor(mapPosition.x / terrain.tileSize)},${Math.floor(mapPosition.y / terrain.tileSize)}`;
    return [{ poiId: id, name: row[0]?.string ?? "", worldPosition,
      iconId: row[8]?.data ?? null, uiCategory: row[20]?.data ?? null,
      uiPriority: row[21]?.data ?? null, mapPosition,
      onExtractedTerrain: terrain.tileCoverage[0].includes(tile) }];
  });
  const objects = gameObjects.reader.getAllIDs().flatMap((id) => {
    const row = gameObjects.reader.getRowData(id);
    if (!Array.isArray(row) || row[4]?.data !== mapId) return [];
    const worldPosition = unpack(row[1].data, 3);
    const mapPosition = project(worldPosition, terrain);
    const tile = `${Math.floor(mapPosition.x / terrain.tileSize)},${Math.floor(mapPosition.y / terrain.tileSize)}`;
    return [{ objectId: id, name: row[0]?.string ?? "", worldPosition,
      displayId: row[5]?.data ?? null, mapPosition,
      onExtractedTerrain: terrain.tileCoverage[0].includes(tile) }];
  });
  await writeFile(join(root, `data/client-research/${slug}-map-poi-trace.json`),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: terrain.source.build, mapId,
      wdtFileDataId: terrain.source.wdtFileDataId,
      wdtSha256: terrain.source.wdtSha256,
      nativeTileCount: terrain.source.tileCount,
      battlemasterListXMapId: mapLink.id,
      tables: [areaPoi.source, gameObjects.source] },
    rule: "Battleground map records are projected through the WDT grid; names and icons must be reviewed before assigning marker categories or claiming a battlemaster position.",
    pois, objects }, null, 2)}\n`);
  console.log(`${name}: ${pois.length} AreaPOIs, ${objects.length} placed GameObjects.`);
  }
} finally {
  storage.close();
}
