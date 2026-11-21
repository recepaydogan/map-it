/** Check readable NPC/service tables for names and stable joins to world placements. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const indexed = new Map(catalog.identified.map((entry) => [entry.name, entry]));
const names = ["Creature", "CreatureXDisplayInfo", "CollectableSourceVendor",
  "CollectableSourceVendorSparse", "GossipNPCOption", "GossipNPCOptionDisplayInfo"];
const exampleNames = new Set(["brek stonehoof", "kuruk", "innkeeper pala",
  "holt thunderhorn", "un'thuwa", "mon'ye", "atepa", "rarc",
  "auctioneer stampi", "elfarran"]);
const fileName = (id) => `FILE${id.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const summarize = (row) => (Array.isArray(row) ? row : []).map((field, index) => ({ index,
  ...(typeof field?.string === "string" ? { string: field.string.slice(0, 100) } : {}),
  ...(field?.data !== undefined ? { data: typeof field.data === "bigint"
    ? field.data.toString() : field.data } : {}),
}));
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  const build = storage.getProductInfo().buildNumber;
  if (build !== catalog.source.build) throw new Error("The table catalog belongs to another client build.");
  const tables = [];
  for (const name of names) {
    const registration = indexed.get(name);
    if (!registration) throw new Error(`No local ${name} registration.`);
    const bytes = storage.readFile(fileName(registration.fileDataId));
    const { reader, omittedSections } = readLocalWdc5(bytes);
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout changed in the local client.`);
    }
    const ids = reader.getAllIDs();
    const sample = ids.slice(0, 3).map((id) => {
      const row = reader.getRowData(id);
      return { id, relationshipId: reader.getRowRelationship(id) ?? null,
        fields: summarize(row),
        ...(row?.type === "sparse" && Buffer.isBuffer(row.data)
          ? { sparseBytes: row.data.length,
            printableRuns: [...row.data.toString("latin1").matchAll(/[\x20-\x7e]{4,}/g)]
              .slice(0, 8).map(([value]) => value.slice(0, 100)) } : {}) };
    });
    let decodedStringRows = 0;
    let sparsePrintableRows = 0;
    let sparseRows = 0;
    const seedMatches = [];
    for (const id of ids) {
      const row = reader.getRowData(id);
      const strings = Array.isArray(row) ? row.flatMap((field) =>
        typeof field?.string === "string" && field.string.trim()
          ? [field.string] : [])
        : row?.type === "sparse" && Buffer.isBuffer(row.data)
          ? [...row.data.toString("latin1").matchAll(/[\x20-\x7e]{4,}/g)]
            .map(([value]) => value) : [];
      if (row?.type === "sparse") {
        sparseRows += 1;
        if (strings.length) sparsePrintableRows += 1;
      } else if (strings.length) decodedStringRows += 1;
      if (strings.some((value) => exampleNames.has(value.toLowerCase().trim()))) {
        seedMatches.push({ id, relationshipId: reader.getRowRelationship(id) ?? null, strings });
      }
    }
    tables.push({ name, fileDataId: registration.fileDataId,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      rowCount: ids.length, decodedStringRows, sparseRows, sparsePrintableRows,
      omittedSections, sample, seedMatches });
  }
  await writeFile(join(root, "data/client-research/npc-service-table-trace.json"),
    `${JSON.stringify({ source: { product: storage.getProductInfo().codeName, build },
      rule: "Raw numeric fields and names are inventory clues only; a service NPC needs a verified world occurrence and source join before publishing.",
      tables }, null, 2)}\n`);
  console.log(tables.map(({ name, rowCount, decodedStringRows,
    sparsePrintableRows, seedMatches }) =>
    `${name}: ${rowCount} rows, ${decodedStringRows} decoded string rows, ${sparsePrintableRows} sparse rows with printable bytes, ${seedMatches.length} exact example-name matches`).join("; "));
} finally {
  storage.close();
}
