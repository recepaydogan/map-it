/** Capture installed-client tooltip text in one DB2 read per locale for review. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { matchLinkedSpellTemplate } from "./lib/match-client-spell-resolved.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const locales = ["enUS", "deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const fields = ["r", "d", "a"];
const records = new Map();
for (let shard = 0; shard < 64; shard += 1) {
  const details = JSON.parse(await readFile(join(root,
    `public/data/spells/foreverdb/${shard}.json`), "utf8"));
  for (const detail of Object.values(details)) {
    if (fields.some((field) => detail[field])) records.set(detail.id, {
      id: detail.id, source: Object.fromEntries(fields.filter((field) => detail[field])
        .map((field) => [field, detail[field]])), missing: {}, client: {}, sourceMatch: {},
    });
  }
}
for (const locale of locales.slice(1)) {
  const pack = JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/spell-tooltip-${locale}.json`), "utf8"));
  for (const record of records.values()) {
    const missing = fields.filter((field) => record.source[field] &&
      !pack.entries[record.id]?.[field]);
    if (missing.length) record.missing[locale] = missing;
  }
}
for (const [id, record] of records) {
  if (!Object.keys(record.missing).length) records.delete(id);
}
const catalog = JSON.parse(await readFile(join(root,
  "data/client-research/db2-table-names.json"), "utf8"));
const registration = catalog.identified.find(({ name }) => name === "Spell");
if (!registration) throw new Error("Missing installed client Spell table registration");
const filename = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const readTooltip = (reader, id) => {
  const row = reader.getRowData(id);
  if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) return undefined;
  const values = [];
  let start = 0;
  for (let field = 0; field < fields.length; field += 1) {
    const end = row.data.indexOf(0, start);
    if (end < 0) return undefined;
    values.push(row.data.subarray(start, end).toString("utf8"));
    start = end + 1;
  }
  return Object.fromEntries(fields.map((field, index) => [field, values[index]]));
};
for (const locale of locales) {
  const storage = casc.Storage.openEx(installDir, {
    codeName: "wow_classic_beta", region: "us",
    localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
  });
  try {
    const reader = readLocalWdc5(storage.readFile(filename)).reader;
    let found = 0;
    for (const record of records.values()) {
      const tooltip = readTooltip(reader, record.id);
      if (!tooltip) continue;
      const wanted = locale === "enUS" ? Object.keys(record.source) : record.missing[locale];
      if (!wanted?.length) continue;
      const values = Object.fromEntries(wanted.filter((field) => tooltip[field])
        .map((field) => [field, tooltip[field]]));
      if (Object.keys(values).length) {
        record.client[locale] = values;
        found += 1;
      }
      if (locale === "enUS") {
        for (const field of wanted) {
          record.sourceMatch[field] = Boolean(tooltip[field] &&
            matchLinkedSpellTemplate(tooltip[field], record.source[field]) !== undefined);
        }
      }
    }
    console.log(`${locale}: ${found} spell tooltips captured`);
  } finally {
    storage.close();
  }
}
const output = [...records.values()].sort((a, b) => a.id - b.id);
await writeFile(join(root, "data/site-research/client-spell-tooltip-captures.jsonl"),
  `${output.map((record) => JSON.stringify(record)).join("\n")}\n`);
console.log(`Saved ${output.length} spell records for client fallback review.`);
for (const field of fields) console.log(`${field}: ${output.filter((record) =>
  record.sourceMatch[field]).length} installed-client English source matches`);
