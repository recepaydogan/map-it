/** Inspect local Map 47 sources for a Razorfen Kraul graveyard position. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const names = ["Map", "AreaPOI", "AreaTable", "GameObjects", "WaypointSafeLocs"];
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const registration = byName.get(name);
  if (!registration) throw new Error(`Missing local ${name} table registration.`);
  const bytes = storage.readFile(`FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`);
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
    throw new Error(`${name} layout changed since the local table inventory.`);
  }
  return { reader, source: { name, fileDataId: registration.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    readableRowCount: reader.getAllIDs().length, omittedSections } };
};
const unpackXY = (value) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value & 0xffff_ffff_ffff_ffffn);
  return [bytes.readFloatLE(0), bytes.readFloatLE(4)];
};
const unpackXYZ = (value) => {
  const bytes = Buffer.alloc(12);
  for (let index = 0; index < 3; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn), index * 4);
  }
  return [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
};
try {
  const tables = new Map(names.map((name) => [name, readTable(name)]));
  const mapRow = tables.get("Map").reader.getRowData(47);
  if (!Array.isArray(mapRow) || mapRow[1]?.string !== "Razorfen Kraul") {
    throw new Error("Map 47 is not the expected Razorfen Kraul client record.");
  }
  const poiReader = tables.get("AreaPOI").reader;
  const poiRows = poiReader.getAllIDs().flatMap((id) => {
    const row = poiReader.getRowData(id);
    const mapId = poiReader.getRowRelationship(id);
    if (!Array.isArray(row) || (mapId !== 47 && row[8]?.data !== 132
      && !/razorfen|graveyard/i.test(row[0]?.string ?? ""))) return [];
    return [{ poiId: id, name: row[0]?.string ?? "", mapId,
      worldPosition: unpackXY(row[3].data), areaId: row[14].data,
      iconId: row[8].data }];
  });
  const objectReader = tables.get("GameObjects").reader;
  const objectRows = objectReader.getAllIDs().flatMap((id) => {
    const row = objectReader.getRowData(id);
    if (!Array.isArray(row) || (row[4].data !== 47
      && !/razorfen|graveyard/i.test(row[0]?.string ?? ""))) return [];
    return [{ objectId: id, name: row[0]?.string ?? "",
      mapId: row[4].data, worldPosition: unpackXYZ(row[1].data),
      displayId: row[5].data }];
  });
  const areaReader = tables.get("AreaTable").reader;
  const areaRows = areaReader.getAllIDs().flatMap((id) => {
    const row = areaReader.getRowData(id);
    return Array.isArray(row) && /razorfen|graveyard/i.test(row[1]?.string ?? "")
      ? [{ areaId: id, name: row[1].string, parentAreaId: row[3].data }] : [];
  });
  await writeFile(join(root, "data/client-research/razorfen-graveyard-client-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName,
      build: storage.getProductInfo().buildNumber,
      tables: [...tables.values()].map(({ source }) => source),
      worldSafeLocsRegistered: byName.has("WorldSafeLocs") },
    map: { mapId: 47, name: mapRow[1].string, wdtFileDataId: mapRow[21]?.data },
    map47AreaPoiCount: poiRows.filter(({ mapId }) => mapId === 47).length,
    areaPoiRows: poiRows, placedObjectRows: objectRows,
    namedAreaRows: areaRows,
    conclusionRule: "A Razorfen graveyard pin requires a placed graveyard or safe-location position joined to Map 47 or its world area. AreaPOI icon 132 is shared by other battleground objectives; an icon, dungeon Map, or area name alone does not establish a graveyard." }, null, 2)}\n`);
  console.log(`Map 47: ${poiRows.filter(({ mapId }) => mapId === 47).length} POIs, ${objectRows.length} placed-object clues; ${poiRows.filter(({ name }) => name.endsWith(" Graveyard")).length} named graveyard POIs on other maps.`);
} finally {
  storage.close();
}
