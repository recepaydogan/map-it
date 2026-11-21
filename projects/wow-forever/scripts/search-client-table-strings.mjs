/** Search every readable local client table for supplied actor or place names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const terms = [...new Set(process.argv.slice(2).map((term) => term.trim())
  .filter(Boolean))];
if (!terms.length) throw new Error("Supply one or more actor/place names.");
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/all-table-registrations.json"), "utf8"));
const queries = terms.map((term) => ({ term,
  pattern: new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu") }));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR
  ?? "C:/Program Files (x86)/World of Warcraft", {
  codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS,
  online: false,
});
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build) throw new Error("Installed game build changed.");
  const matches = [];
  let scannedRows = 0;
  let encryptedRows = 0;
  for (const table of catalog.records) {
    if (!table.localAvailable) continue;
    const { reader, omittedSections } = readLocalWdc5(storage.readFile(
      fileName(table.fileDataId)));
    if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash) {
      throw new Error(`Layout mismatch for ${table.name}.`);
    }
    encryptedRows += omittedSections.reduce((sum, section) =>
      sum + section.recordCount, 0);
    for (const id of reader.getAllIDs()) {
      const row = reader.getRowData(id);
      scannedRows += 1;
      const values = Array.isArray(row)
        ? row.flatMap(({ string }, index) => typeof string === "string" && string
          ? [{ fieldIndex: index, text: string }] : [])
        : row?.type === "sparse" && Buffer.isBuffer(row.data)
          ? [...row.data.toString("latin1").matchAll(/[\x20-\x7e]{4,}/g)]
            .map((match) => ({ byteOffset: match.index, text: match[0] }))
          : [];
      for (const value of values) {
        const found = queries.filter(({ pattern }) => pattern.test(value.text));
        if (!found.length) continue;
        matches.push({ table: table.name, fileDataId: table.fileDataId,
          rowId: id, relationshipId: reader.getRowRelationship(id) ?? null,
          ...value, terms: found.map(({ term }) => term) });
      }
    }
  }
  const report = { source: { product: storage.getProductInfo().codeName, build },
    terms, scannedRows, encryptedRows, matches };
  await writeFile(join(root, "data/client-research/targeted-client-table-string-search.json"),
    `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Scanned ${scannedRows} readable rows; ${matches.length} matches, ${encryptedRows} encrypted rows unavailable.`);
  for (const match of matches.slice(0, 40)) {
    console.log(`${match.table} #${match.rowId}: ${match.text.slice(0, 140)}`);
  }
} finally {
  storage.close();
}
