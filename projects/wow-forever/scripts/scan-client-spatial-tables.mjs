/** Discover spatial client tables by record structure, regardless of table name. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/all-table-registrations.json"), "utf8"));
const archive = JSON.parse(await readFile(join(root,
  "data/client-research/archive-flags.json"), "utf8"));
const archivedWdc5Count = archive.groups.filter(({ samples }) =>
  samples?.some(({ magicText }) => magicText === "WDC5"))
  .reduce((sum, { local }) => sum + local, 0);
if (archivedWdc5Count !== catalog.records.length) {
  throw new Error(`Registered tables (${catalog.records.length}) do not cover all local WDC5 files (${archivedWdc5Count}).`);
}
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const floatBuffer = Buffer.allocUnsafe(4);
function asFloat(value) {
  if (typeof value !== "number" || !Number.isInteger(value)
    || value < 0 || value > 0xffff_ffff) return null;
  floatBuffer.writeUInt32LE(value, 0);
  return floatBuffer.readFloatLE(0);
}
function plausible(values) {
  return values.length === 3 && values.every((value) =>
    value !== null && Number.isFinite(value) && Math.abs(value) < 20_000)
    && values.filter((value) => Math.abs(value) > 50).length >= 2
    && Math.max(...values) - Math.min(...values) > 5;
}
function tuplesOf(row) {
  const hits = [];
  for (let i = 0; i < row.length; i += 1) {
    const data = row[i]?.data;
    if (typeof data === "bigint" && data >= 0n && data < (1n << 96n)) {
      const values = [0n, 32n, 64n].map((shift) =>
        asFloat(Number((data >> shift) & 0xffff_ffffn)));
      if (plausible(values)) hits.push({ signature: `packed:${i}`, values });
    }
    if (Array.isArray(data)) {
      for (let j = 0; j + 3 <= Math.min(data.length, 16); j += 1) {
        const values = data.slice(j, j + 3).map(asFloat);
        if (plausible(values)) hits.push({ signature: `array:${i}:${j}`, values });
      }
    }
    if (i + 3 <= row.length && [row[i], row[i + 1], row[i + 2]]
      .every((field) => typeof field?.data === "number")) {
      const values = [row[i].data, row[i + 1].data, row[i + 2].data]
        .map(asFloat);
      if (plausible(values)) hits.push({ signature: `fields:${i}`, values });
    }
  }
  return hits;
}

const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build) throw new Error("Installed game build changed.");
  const results = [];
  let totalRows = 0;
  let totalEncryptedRows = 0;
  for (const registration of catalog.records) {
    if (!registration.localAvailable) continue;
    const bytes = storage.readFile(fileName(registration.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`Layout mismatch for ${registration.name}.`);
    }
    const ids = reader.getAllIDs();
    totalRows += ids.length;
    totalEncryptedRows += omittedSections.reduce((sum, section) =>
      sum + section.recordCount, 0);
    const signatures = new Map();
    for (const id of ids) {
      const row = reader.getRowData(id);
      if (!Array.isArray(row)) continue;
      const map2991FieldIndices = row.flatMap((field, index) =>
        field?.data === 2991 ? [index] : []);
      for (const { signature, values } of tuplesOf(row)) {
        const hit = signatures.get(signature) ?? { signature, rows: 0,
          map2991Rows: 0, examples: [], distinctPositions: new Set() };
        hit.rows += 1;
        if (map2991FieldIndices.length) hit.map2991Rows += 1;
        if (hit.examples.length < 4) hit.examples.push({ id, values,
          map2991FieldIndices });
        if (hit.distinctPositions.size < 1000) {
          hit.distinctPositions.add(values.map((value) => Math.round(value)).join(","));
        }
        signatures.set(signature, hit);
      }
    }
    const candidates = [...signatures.values()]
      .filter((hit) => hit.rows >= 3 && hit.distinctPositions.size >= 3)
      .map(({ distinctPositions, ...hit }) => ({ ...hit,
        distinctPositions: distinctPositions.size }))
      .sort((a, b) => b.map2991Rows - a.map2991Rows || b.rows - a.rows);
    if (candidates.length) results.push({ table: registration.name,
      fileDataId: registration.fileDataId, readableRows: ids.length,
      omittedEncryptedRows: omittedSections.reduce((sum, section) =>
        sum + section.recordCount, 0), signatures: candidates.slice(0, 12) });
  }
  results.sort((a, b) =>
    Math.max(...b.signatures.map((hit) => hit.map2991Rows))
      - Math.max(...a.signatures.map((hit) => hit.map2991Rows))
    || Math.max(...b.signatures.map((hit) => hit.rows))
      - Math.max(...a.signatures.map((hit) => hit.rows)));
  const report = { source: { product: storage.getProductInfo().codeName, build },
    method: "All readable rows of every locally registered WDC5 table were scanned for packed, array, and adjacent float32 coordinate triples; table names were not used to select records.",
    caveat: "Numeric coordinate signatures require manual schema and source-join verification before any NPC pin can be published.",
    tableCount: catalog.records.length, readableRows: totalRows,
    omittedEncryptedRows: totalEncryptedRows, candidateTables: results };
  await writeFile(join(root, "data/client-research/client-spatial-table-scan.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Scanned ${totalRows} rows from ${catalog.records.length} tables; ${results.length} tables have coordinate-like signatures.`);
  console.log(results.slice(0, 35).map(({ table, signatures }) =>
    `${table}: ${signatures.map(({ signature, rows, map2991Rows }) =>
      `${signature} ${rows} hits (${map2991Rows} with Map 2991)`).join(", ")}`)
    .join("\n"));
} finally {
  storage.close();
}
