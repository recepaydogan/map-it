/** Group positioned client world POIs by their native icon and UI fields. */
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
if (!record || !areaRecord) throw new Error("Missing client AreaPOI or AreaTable registration.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (atlas.source?.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The atlas and local client differ in build.");
  }
  const fileName = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const bytes = storage.readFile(fileName);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  const areaFileName = `FILE${areaRecord.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const areaBytes = storage.readFile(areaFileName);
  const { reader: areas, omittedSections: areaOmittedSections } = readLocalWdc5(areaBytes);
  if (areas.layoutHash.toString(16).padStart(8, "0") !== areaRecord.layoutHash) {
    throw new Error("AreaTable layout changed in the local client.");
  }
  const project = createClientWorldProjector(atlas);
  const groups = new Map();
  for (const id of reader.getAllIDs()) {
    const row = reader.getRowData(id);
    const mapId = reader.getRowRelationship(id);
    if (!Array.isArray(row) || !row[0]?.string || ![0, 1].includes(mapId)) continue;
    const positionBytes = Buffer.alloc(8);
    positionBytes.writeBigUInt64LE(row[3].data & 0xffff_ffff_ffff_ffffn);
    const worldPosition = [positionBytes.readFloatLE(0), positionBytes.readFloatLE(4)];
    const atlasPosition = project(mapId, worldPosition);
    if (!atlasPosition || atlasPosition.x < atlas.bounds.minX
      || atlasPosition.x > atlas.bounds.maxX || atlasPosition.y < atlas.bounds.minY
      || atlasPosition.y > atlas.bounds.maxY) continue;
    const iconId = row[8].data;
    const uiCategory = row[20].data;
    const uiPriority = row[21].data;
    const key = `${iconId}:${uiCategory}:${uiPriority}`;
    const group = groups.get(key) ?? { iconId, uiCategory, uiPriority, records: [] };
    const areaId = row[14].data;
    const area = areas.getRowData(areaId);
    const parentAreaId = area?.[3]?.data ?? null;
    const parentArea = parentAreaId ? areas.getRowData(parentAreaId) : null;
    group.records.push({ poiId: id, name: row[0].string, mapId,
      worldPosition, atlasPosition, areaId,
      areaName: area?.[1]?.string ?? null,
      parentAreaId, parentAreaName: parentArea?.[1]?.string ?? null });
    groups.set(key, group);
  }
  const output = [...groups.values()].sort((a, b) => b.records.length - a.records.length);
  await writeFile(join(root, "data/client-research/area-poi-category-profile.json"),
    `${JSON.stringify({ source: {
      product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber,
      table: "AreaPOI", fileDataId: record.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections,
      areaTable: { fileDataId: areaRecord.fileDataId,
        sha256: createHash("sha256").update(areaBytes).digest("hex"),
        omittedSections: areaOmittedSections },
    }, rule: "All named AreaPOIs on the two projected world maps, grouped by client icon and UI fields. Numeric groups are not assigned player-facing categories without corroboration.",
    groups: output }, null, 2)}\n`);
  console.log(`Profiled ${output.reduce((sum, group) => sum + group.records.length, 0)} world-map POIs in ${output.length} icon/UI groups.`);
} finally {
  storage.close();
}
