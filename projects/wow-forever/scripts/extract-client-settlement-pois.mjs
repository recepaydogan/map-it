/** Inventory settlement-icon AreaPOIs on the two atlas world maps. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { createClientWorldProjector } from "./lib/project-client-world-position.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await readJson("data/client-research/db2-table-names.json");
const atlas = await readJson("public/maps/world-atlas/metadata.json");
const record = catalog.identified.find(({ name }) => name === "AreaPOI");
const areaRecord = catalog.identified.find(({ name }) => name === "AreaTable");
if (!record) throw new Error("The client does not register AreaPOI.");
if (!areaRecord) throw new Error("The client does not register AreaTable.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (atlas.source?.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The atlas and client belong to different builds.");
  }
  const fileName = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(fileName);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  const areaFileName = `FILE${areaRecord.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const areaBytes = storage.readFile(areaFileName);
  const { reader: areas, omittedSections: omittedAreaSections } = readLocalWdc5(areaBytes);
  const normalize = (value) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const areaRowsByNameAndMap = new Map();
  for (const areaId of areas.getAllIDs()) {
    const area = areas.getRowData(areaId);
    if (!Array.isArray(area) || !area[1]?.string) continue;
    const key = `${area[2]?.data}:${normalize(area[1].string)}`;
    const matches = areaRowsByNameAndMap.get(key) ?? [];
    matches.push({ areaId, parentAreaId: area[3]?.data ?? 0 });
    areaRowsByNameAndMap.set(key, matches);
  }
  const project = createClientWorldProjector(atlas);
  const records = [];
  for (const id of reader.getAllIDs()) {
    const row = reader.getRowData(id);
    const mapId = reader.getRowRelationship(id);
    if (!Array.isArray(row) || !row[0]?.string || ![0, 1].includes(mapId)
      || !((row[8]?.data === 29 && row[21]?.data === 5)
        || (row[8]?.data === 5 && [4, 6].includes(row[21]?.data)))) continue;
    const positionBytes = Buffer.alloc(8);
    positionBytes.writeBigUInt64LE(row[3].data);
    const worldPosition = [positionBytes.readFloatLE(0), positionBytes.readFloatLE(4)];
    const atlasPosition = project(mapId, worldPosition);
    if (!atlasPosition || atlasPosition.x < atlas.bounds.minX
      || atlasPosition.x > atlas.bounds.maxX || atlasPosition.y < atlas.bounds.minY
      || atlasPosition.y > atlas.bounds.maxY) continue;
    const matchingAreas = areaRowsByNameAndMap.get(`${mapId}:${normalize(row[0].string)}`) ?? [];
    const parentIds = [...new Set(matchingAreas.map(({ parentAreaId }) => parentAreaId)
      .filter((parentAreaId) => parentAreaId > 0))];
    const parentAreaId = parentIds.length === 1 ? parentIds[0] : null;
    const regionName = parentAreaId ? areas.getRowData(parentAreaId)?.[1]?.string ?? null : null;
    records.push({ poiId: id, name: row[0].string,
      category: row[8].data === 29 ? "city" : "town",
      mapId, worldPosition, atlasPosition,
      areaIds: matchingAreas.map(({ areaId }) => areaId),
      parentAreaId, regionName,
      iconId: row[8].data, uiCategory: row[20].data,
      uiPriority: row[21].data });
  }
  await writeFile(join(root, "data/client-research/settlement-poi-candidates.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber,
      table: "AreaPOI", fileDataId: record.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      omittedSections,
      areaTable: { fileDataId: areaRecord.fileDataId,
        sha256: createHash("sha256").update(areaBytes).digest("hex"),
        omittedSections: omittedAreaSections } },
    selectionRule: "Named world-map AreaPOIs with the client major-city icon ID 29 and priority 5, or town icon ID 5 and priority 4/6. UI categories vary for several valid city/town records and are retained for audit.",
    note: "Candidates require further name and region validation before publishing.",
    records }, null, 2)}\n`);
  console.log(`Identified ${records.length} city/town AreaPOI candidates (${records.filter(({ category }) => category === "city").length} cities, ${records.filter(({ category }) => category === "town").length} towns).`);
} finally {
  storage.close();
}
