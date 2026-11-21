/** Inspect rows in a locally installed client table without publishing map data. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const [tableName, term, limitText = "10"] = process.argv.slice(2);
if (!tableName || !term) {
  throw new Error("Usage: node scripts/inspect-local-client-table.mjs <table> <term> [limit]");
}
const limit = Number(limitText);
if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("Invalid row limit.");
const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const record = catalog.identified.find(({ name }) => name === tableName);
if (!record) throw new Error(`Table ${tableName} is not locally available.`);
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const fileName = `FILE${record.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
  const { reader, omittedSections } = readLocalWdc5(storage.readFile(fileName));
  let matches = 0;
  for (const id of reader.getAllIDs()) {
    const row = reader.getRowData(id);
    if (term.startsWith("#") && id !== Number(term.slice(1))) continue;
    if (term.startsWith("@") && reader.getRowRelationship(id) !== Number(term.slice(1))) continue;
    if (term !== "*" && !term.startsWith("#") && !term.startsWith("@") && !JSON.stringify(row, (_, value) =>
      typeof value === "bigint" ? value.toString() : value)
      .toLocaleLowerCase().includes(term.toLocaleLowerCase())) continue;
    matches += 1;
    if (matches <= limit) console.log(JSON.stringify({ id,
      relationship: reader.getRowRelationship(id) ?? null, row }, (_, value) =>
      typeof value === "bigint" ? value.toString() : value));
  }
  console.log(JSON.stringify({ table: tableName, matchedRows: matches,
    printedRows: Math.min(matches, limit), omittedSections }));
} finally {
  storage.close();
}
