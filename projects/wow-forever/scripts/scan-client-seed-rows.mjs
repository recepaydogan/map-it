/** Find exact user-seed and named-actor strings in readable client DB2 rows. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const examples = await readJson("docs/marker-research-examples.json");
const catalog = await readJson("data/client-research/db2-table-names.json");
const inventory = await readJson("data/client-research/local-db2-index.json");
const normalize = (value) => value.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
const actorFields = ["battlemaster", "trainer", "merchant", "innkeeper",
  "transmogrifier", "stableMaster", "banker", "vendor", "auctioneer"];
const targets = examples.examples.flatMap((example) => [
  { seedOrder: example.order, seedName: example.name, kind: "seed-name", term: example.name },
  ...(example.searchActorNames ?? []).map((term) => ({
    seedOrder: example.order, seedName: example.name, kind: "named-actor-search-clue", term })),
  ...actorFields.flatMap((field) => typeof example.details?.[field] === "string"
    ? [{ seedOrder: example.order, seedName: example.name, kind: "named-actor",
      term: example.details[field].replace(/\s+\([^)]*\)$/, "") }] : []),
]);
const targetsByNormalized = new Map();
for (const target of targets) {
  const key = normalize(target.term);
  const matches = targetsByNormalized.get(key) ?? [];
  matches.push(target);
  targetsByNormalized.set(key, matches);
}
const distinctiveTerms = [
  { seedOrder: 1, term: "battered" },
  { seedOrder: 2, term: "al'aketh" },
  { seedOrder: 3, term: "peons" },
  { seedOrder: 6, term: "elfarran" },
  { seedOrder: 7, term: "brek stonehoof" },
  { seedOrder: 9, term: "kuruk" },
  { seedOrder: 12, term: "innkeeper pala" },
  { seedOrder: 13, term: "holt thunderhorn" },
  { seedOrder: 14, term: "un'thuwa" },
  { seedOrder: 16, term: "mon'ye" },
  { seedOrder: 20, term: "bulrug" },
  { seedOrder: 21, term: "atepa" },
  { seedOrder: 22, term: "rarc" },
  { seedOrder: 23, term: "stampi" },
].map((target) => ({ ...target,
  pattern: new RegExp(`(^|[^a-z])${target.term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z])`, "i") }));
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const inventoryById = new Map(inventory.inventory.map((record) => [record.fileDataId, record]));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (inventory.source.build !== storage.getProductInfo().buildNumber) {
    throw new Error("The DB2 inventory belongs to another client build.");
  }
  const matches = [];
  const distinctiveMatches = [];
  const recordString = (table, rowId, fieldIndex, sourceString, relationship,
    sparseByteOffset = null) => {
    const normalized = normalize(sourceString);
    const source = { table: table.name, fileDataId: table.fileDataId,
      rowId, fieldIndex, sparseByteOffset, sourceString, relationship };
    for (const target of targetsByNormalized.get(normalized) ?? []) {
      matches.push({ seedOrder: target.seedOrder, seedName: target.seedName,
        kind: target.kind, term: target.term, ...source });
    }
    for (const target of distinctiveTerms) {
      if (target.pattern.test(sourceString)) {
        distinctiveMatches.push({ seedOrder: target.seedOrder,
          term: target.term, ...source });
      }
    }
  };
  let rowsInspected = 0;
  let encryptedRows = 0;
  for (const table of catalog.identified) {
    const bytes = storage.readFile(fileName(table.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== table.layoutHash
      || !inventoryById.has(table.fileDataId)) {
      throw new Error(`Client table ${table.name} changed since the inventory.`);
    }
    encryptedRows += omittedSections.reduce((sum, section) => sum + section.recordCount, 0);
    for (const id of reader.getAllIDs()) {
      const row = reader.getRowData(id);
      if (!Array.isArray(row) && !(row?.type === "sparse" && Buffer.isBuffer(row.data))) continue;
      rowsInspected += 1;
      const relationship = reader.getRowRelationship(id) ?? null;
      if (Array.isArray(row)) {
        for (const [fieldIndex, field] of row.entries()) {
          if (typeof field.string !== "string" || !field.string.trim()) continue;
          recordString(table, id, fieldIndex, field.string, relationship);
        }
      } else {
        const contents = row.data.toString("latin1");
        for (const match of contents.matchAll(/[\x20-\x7e]{4,}/g)) {
          recordString(table, id, null, match[0], relationship, match.index);
        }
      }
    }
  }
  const output = join(root, "data/client-research/seed-row-matches.json");
  await writeFile(output, `${JSON.stringify({ source: {
    product: storage.getProductInfo().codeName,
    build: storage.getProductInfo().buildNumber,
    db2TableCount: catalog.identified.length,
  }, exactMatchRule: "A decoded DB2 string field or a printable string run in a sparse DB2 record matches a complete example or named-actor phrase after case and punctuation normalization. Sparse strings retain their byte offset and row ID.",
  rowsInspected, encryptedRowsOmitted: encryptedRows, matches,
  distinctiveMatches }, null, 2)}\n`);
  console.log(`Scanned ${rowsInspected} decoded rows in ${catalog.identified.length} tables; ${matches.length} exact and ${distinctiveMatches.length} distinctive substring matches, ${encryptedRows} encrypted rows omitted.`);
} finally {
  storage.close();
}
