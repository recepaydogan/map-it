/** Find untranslated app strings that exactly match unextracted client DB2 text. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Storage, CASC_LOCALE_ENUS } from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await read("data/client-research/db2-table-names.json");
const provenance = await read("public/data/locales/wow-forever/provenance.json");
const source = await read("public/data/locales/wow-forever/source.json");
const english = await read("src/i18n/locales/en.json");
const german = await read("src/i18n/locales/de.json");
const requested = process.argv.slice(2);
const tableNames = requested[0] === "--all"
  ? catalog.identified.filter((table) => table.localeFlags === 514 && table.rowCount > 0 &&
    !provenance.tables.includes(table.name)).map((table) => table.name)
  : requested.length ? requested : [
  "GlobalStrings", "WMOAreaTable", "ItemSearchName", "QuestSort",
  "TradeSkillCategory", "BattlePetSpecies", "CharTitles", "CreatureFamily",
  "CreatureType", "UiMap", "SpellFocusObject",
];
const missingByValue = new Map();
function collect(original, translated, prefix = "") {
  for (const [key, value] of Object.entries(original)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string" && translated?.[key] === undefined) {
      const paths = missingByValue.get(value) ?? [];
      paths.push(path);
      missingByValue.set(value, paths);
    } else if (value && typeof value === "object") collect(value, translated?.[key], path);
  }
}
collect(english, german);
const knownClientValues = new Set(source.values);
const storage = Storage.openEx(process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft",
  { codeName: "wow_classic_beta", region: "us", localeMask: CASC_LOCALE_ENUS, online: false });
try {
  if (storage.getProductInfo().buildNumber !== provenance.build) {
    throw new Error("Installed client build differs from the extracted locale packs");
  }
  for (const name of tableNames) {
    const table = catalog.identified.find((entry) => entry.name === name);
    if (!table) throw new Error(`Unknown DB2 table ${name}`);
    const filename = `FILE${table.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const reader = readLocalWdc5(storage.readFile(filename)).reader;
    let strings = 0;
    const matches = new Map();
    for (const id of reader.getAllIDs()) {
      const row = reader.getRowData(id);
      if (!Array.isArray(row)) continue;
      for (const [column, cell] of row.entries()) {
        const value = cell?.string;
        if (typeof value !== "string" || !value.trim()) continue;
        strings += 1;
        if (!missingByValue.has(value)) continue;
        const rows = matches.get(value) ?? [];
        rows.push(`${name}:${id}:${column}`);
        matches.set(value, rows);
      }
    }
    const fresh = [...matches].filter(([value]) => !knownClientValues.has(value));
    if (!matches.size && requested[0] === "--all") continue;
    console.log(`${name}: ${strings} strings, ${matches.size} matching missing names, ${fresh.length} new names`);
    for (const [value, keys] of fresh.slice(0, 12)) {
      console.log(`  ${keys[0]} ${JSON.stringify(value)} ${missingByValue.get(value)[0]}`);
    }
  }
} finally {
  storage.close();
}
