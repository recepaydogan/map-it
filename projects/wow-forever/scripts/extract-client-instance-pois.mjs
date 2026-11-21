/** Match named world-map POIs to client instance maps and parent areas. */
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
const byName = new Map(catalog.identified.map((record) => [record.name, record]));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const normalize = (value) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const unpackXY = (value) => {
  if (typeof value !== "bigint") throw new Error("Expected packed AreaPOI position.");
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return [bytes.readFloatLE(0), bytes.readFloatLE(4)];
};
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
const readTable = (name) => {
  const record = byName.get(name);
  if (!record) throw new Error(`Missing ${name} client table registration.`);
  const bytes = storage.readFile(fileName(record.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0") !== record.layoutHash) {
    throw new Error(`${name} layout differs from the local executable.`);
  }
  return { reader, source: { name, fileDataId: record.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"), omittedSections } };
};
try {
  if (atlas.source?.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The atlas and installed client belong to different builds.");
  }
  const poi = readTable("AreaPOI");
  const maps = readTable("Map");
  const areas = readTable("AreaTable");
  const project = createClientWorldProjector(atlas);
  const instanceMapsByName = new Map();
  for (const id of maps.reader.getAllIDs()) {
    const row = maps.reader.getRowData(id);
    if (!Array.isArray(row) || row[7]?.data === 0 || !row[1]?.string) continue;
    const key = normalize(row[1].string);
    const matches = instanceMapsByName.get(key) ?? [];
    matches.push({ id, name: row[1].string, mapType: row[7].data });
    instanceMapsByName.set(key, matches);
  }
  const records = [];
  for (const id of poi.reader.getAllIDs()) {
    const row = poi.reader.getRowData(id);
    if (!Array.isArray(row) || !row[0]?.string) continue;
    const matchingMaps = instanceMapsByName.get(normalize(row[0].string));
    if (!matchingMaps?.length) continue;
    const worldMapId = poi.reader.getRowRelationship(id);
    const worldPosition = unpackXY(row[3].data);
    const atlasPosition = project(worldMapId, worldPosition);
    const areaId = row[14].data;
    const area = areas.reader.getRowData(areaId);
    const parentAreaId = area?.[3]?.data ?? null;
    const parentArea = parentAreaId ? areas.reader.getRowData(parentAreaId) : null;
    records.push({ poiId: id, name: row[0].string, worldMapId,
      worldPosition, atlasPosition, areaId,
      areaName: area?.[1]?.string ?? null,
      parentAreaId, parentAreaName: parentArea?.[1]?.string ?? null,
      matchingMaps });
  }
  const output = join(root, "data/client-research/instance-poi-candidates.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    tables: [poi, maps, areas].map(({ source }) => source),
  }, rule: "An AreaPOI on a projected world map has the same normalized name as a non-world Map record.",
  note: "An AreaPOI locates the game's marker; it does not by itself prove the exact dungeon doorway or level range.",
  records }, null, 2)}\n`);
  console.log(`Matched ${records.length} named world POIs to client instance maps.`);
} finally {
  storage.close();
}
