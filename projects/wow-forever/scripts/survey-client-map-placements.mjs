/** Survey positioned client records on every locally tileable named map. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const identities = await readJson("data/client-research/wdt-map-identities.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const registrations = new Map(catalog.identified.map((item) => [item.name, item]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const unpack = (value, count) => {
  const bytes = Buffer.alloc(count * 4);
  for (let index = 0; index < count; index++) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return Array.from({ length: count }, (_, index) => bytes.readFloatLE(index * 4));
};
try {
  const build = storage.getProductInfo().buildNumber;
  if (identities.source.build !== build) throw new Error("Map identity inventory and client builds differ.");
  const tables = new Map(["AreaPOI", "GameObjects"].map((name) => {
    const registration = registrations.get(name);
    if (!registration) throw new Error(`Missing ${name} registration.`);
    const bytes = storage.readFile(fileName(registration.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout changed.`);
    }
    return [name, { reader, source: { name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } }];
  }));
  const candidates = identities.records.flatMap(({ wdtFileDataId, tileCount, grid, maps }) =>
    tileCount > 0 ? maps.map(({ mapId, name }) => ({ mapId, name, wdtFileDataId,
      tileCount, grid, areaPois: [], gameObjects: [] })) : []);
  const byMap = new Map(candidates.map((map) => [map.mapId, map]));
  if (byMap.size !== candidates.length) {
    throw new Error("A client Map ID is associated with more than one local terrain record.");
  }
  const project = (map, position) => ({
    x: (32 - position[1] / (1600 / 3) - map.grid.minX) * 512,
    y: (32 - position[0] / (1600 / 3) - map.grid.minY) * 512,
  });
  const areaPoi = tables.get("AreaPOI").reader;
  for (const poiId of areaPoi.getAllIDs()) {
    const map = byMap.get(areaPoi.getRowRelationship(poiId));
    if (!map) continue;
    const row = areaPoi.getRowData(poiId);
    if (!Array.isArray(row)) continue;
    const worldPosition = unpack(row[3].data, 2);
    map.areaPois.push({ poiId, name: row[0]?.string ?? "", worldPosition,
      iconId: row[8]?.data ?? null, uiCategory: row[20]?.data ?? null,
      uiPriority: row[21]?.data ?? null, mapPosition: project(map, worldPosition) });
  }
  const gameObjects = tables.get("GameObjects").reader;
  for (const objectId of gameObjects.getAllIDs()) {
    const row = gameObjects.getRowData(objectId);
    const map = byMap.get(row?.[4]?.data);
    if (!map) continue;
    const worldPosition = unpack(row[1].data, 3);
    map.gameObjects.push({ objectId, name: row[0]?.string ?? "", worldPosition,
      displayId: row[5]?.data ?? null, mapPosition: project(map, worldPosition) });
  }
  const report = { source: { product: storage.getProductInfo().codeName, build,
    tables: [...tables.values()].map(({ source }) => source),
    mapIdentity: identities.source },
  rule: "A positioned client POI or object on a named map is a candidate. Its label, icon, object model, native tile, and player-facing meaning require separate review.",
  maps: candidates.sort((left, right) =>
    right.areaPois.length + right.gameObjects.length - left.areaPois.length - left.gameObjects.length) };
  await writeFile(join(root, "data/client-research/map-placement-survey.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${candidates.length} named maps with local native tiles; ${candidates.filter((map) =>
    map.areaPois.length || map.gameObjects.length).length} have positioned client records.`);
  console.log(candidates.slice(0, 25).map(({ mapId, name, tileCount, areaPois, gameObjects }) =>
    `${mapId} ${name} (${tileCount} tiles): ${areaPois.length} POIs, ${gameObjects.length} objects`).join("\n"));
} finally { storage.close(); }
