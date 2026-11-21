/** Inventory client transport animation groups without assigning service names. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/db2-table-names.json"), "utf8"));
const paths = JSON.parse(await readFile(join(root,
  "data/client-research/transport-path-audit.json"), "utf8"));
const registration = catalog.identified.find(({ name }) =>
  name === "TransportAnimation");
if (!registration) throw new Error("TransportAnimation is not registered locally.");
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft",
{ codeName: "wow_classic_beta", region: "us",
  localeMask: CASC_LOCALE_ENUS, online: false });
const fileName = (id) =>
  `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const position = (value) => {
  if (typeof value !== "bigint") throw new Error("Unexpected transport position.");
  const bytes = Buffer.alloc(12);
  for (let index = 0; index < 3; index += 1) {
    bytes.writeUInt32LE(Number((value >> BigInt(index * 32)) & 0xffff_ffffn),
      index * 4);
  }
  return [0, 4, 8].map((offset) => bytes.readFloatLE(offset));
};
try {
  if (storage.getProductInfo().buildNumber !== paths.source.build) {
    throw new Error("Transport animation and taxi path builds differ.");
  }
  const bytes = storage.readFile(fileName(registration.fileDataId));
  const { reader, omittedSections } = readLocalWdc5(bytes);
  if (reader.layoutHash.toString(16).padStart(8, "0")
    !== registration.layoutHash) {
    throw new Error("Local TransportAnimation layout changed.");
  }
  const groups = new Map();
  for (const rowId of reader.getAllIDs()) {
    const row = reader.getRowData(rowId);
    const relationshipId = reader.getRowRelationship(rowId);
    if (!Array.isArray(row) || row.length !== 3
      || !Number.isInteger(relationshipId)
      || !Number.isInteger(row[2]?.data)) {
      throw new Error(`Transport animation row ${rowId} is incomplete.`);
    }
    const records = groups.get(relationshipId) ?? [];
    records.push({ rowId, position: position(row[0].data),
      field1Raw: row[1].data, timeIndexRaw: row[2].data });
    groups.set(relationshipId, records);
  }
  const records = [...groups].map(([relationshipId, rows]) => {
    const axes = [0, 1, 2].map((axis) => rows.map(({ position: pos }) =>
      pos[axis]));
    return { relationshipId, rowCount: rows.length,
      timeIndexRaw: { min: Math.min(...rows.map(({ timeIndexRaw }) =>
        timeIndexRaw)), max: Math.max(...rows.map(({ timeIndexRaw }) =>
        timeIndexRaw)) },
      positionBoundsRaw: axes.map((axis) => ({ min: Math.min(...axis),
        max: Math.max(...axis) })),
      field1Values: [...new Set(rows.map(({ field1Raw }) => field1Raw))],
      rowIds: rows.map(({ rowId }) => rowId) };
  }).sort((left, right) => left.relationshipId - right.relationshipId);
  const report = { source: { product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    table: "TransportAnimation", fileDataId: registration.fileDataId,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    omittedSections },
  rule: "TransportAnimation relationship groups contain animation points and raw time indices. They lack a verified join to named placed service objects or TaxiPath IDs, so their positions cannot be placed on the world map and their times are not public schedules.",
  groupCount: records.length, rowCount: reader.getAllIDs().length,
  records };
  await writeFile(join(root,
    "data/client-research/transport-animation-audit.json"),
  `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Audited ${report.rowCount} transport animation rows in ${report.groupCount} unlocated groups.`);
} finally { storage.close(); }
