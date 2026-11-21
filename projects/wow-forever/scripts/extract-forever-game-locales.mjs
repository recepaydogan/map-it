/** Extract matching game strings from locally installed Forever client DB2 tables. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { decodeClientItemSparse } from "./lib/decode-client-item-sparse.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = join(root, "public/data/locales/wow-forever");
const catalog = JSON.parse(await readFile(join(root, "data/client-research/db2-table-names.json"), "utf8"));
const tables = [
  "ItemSparse", "SpellName", "AreaTable", "ChrClasses", "ChrRaces", "SkillLine",
  "Achievement", "Creature", "CurrencyTypes", "DungeonEncounter", "Faction",
  "ItemClass", "ItemNameDescription", "ItemSet", "ItemSubClass", "LFGDungeons",
  "Map", "Mount", "AuctionHouse",
  "GameObjects",
  "AreaPOI",
  "TaxiNodes",
  "WMOAreaTable", "SpellFocusObject",
  "LockType",
];
const locales = ["enUS", "deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const product = "wow_classic_beta";

function filename(name) {
  const table = catalog.identified.find((entry) => entry.name === name);
  if (!table) throw new Error(`Unknown client table ${name}`);
  return `FILE${table.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
}

function open(locale) {
  const localeMask = casc[`CASC_LOCALE_${locale.toUpperCase()}`];
  if (!localeMask) throw new Error(`Unknown CASC locale ${locale}`);
  return casc.Storage.openEx(installDir, { codeName: product, region: "us", localeMask, online: false });
}

function rowCells(name, row) {
  if (name !== "ItemSparse") return row;
  const item = decodeClientItemSparse(row.data);
  return [item.description, item.display3, item.display2, item.display1, item.name]
    .map((string) => ({ string }));
}

function strings(name, reader) {
  const rows = new Map();
  for (const id of reader.getAllIDs()) {
    const row = reader.getRowData(id);
    if (row) rows.set(id, rowCells(name, row));
  }
  return rows;
}

const english = open("enUS");
const build = english.getProductInfo().buildNumber;
const source = { version: 1, keys: [], values: [] };
const references = [];
try {
  for (const name of tables) {
    const reader = readLocalWdc5(english.readFile(filename(name))).reader;
    for (const [id, row] of strings(name, reader)) {
      row.forEach((cell, index) => {
        if (typeof cell.string !== "string" || !cell.string.trim()) return;
        source.keys.push(`${name}:${id}:${index}`);
        source.values.push(cell.string);
        references.push({ name, id, index });
      });
    }
    console.log(`Indexed ${name}: ${source.keys.length} total strings`);
  }
} finally {
  english.close();
}

await mkdir(output, { recursive: true });
await writeFile(join(output, "source.json"), JSON.stringify(source));
const counts = {};
for (const locale of locales.slice(1)) {
  const storage = open(locale);
  const translated = { version: 1, values: Array(source.keys.length).fill(null) };
  let matched = 0;
  try {
    for (const name of tables) {
      const rows = strings(name, readLocalWdc5(storage.readFile(filename(name))).reader);
      references.forEach((reference, index) => {
        if (reference.name !== name) return;
        const value = rows.get(reference.id)?.[reference.index]?.string;
        if (typeof value !== "string" || !value.trim()) return;
        translated.values[index] = value;
        matched += 1;
      });
    }
  } finally {
    storage.close();
  }
  counts[locale] = matched;
  await writeFile(join(output, `${locale}.json`), JSON.stringify(translated));
  console.log(`${locale}: ${matched}/${source.keys.length} strings`);
}
await writeFile(join(output, "provenance.json"), JSON.stringify({
  product, build, tables, locales, sourceStrings: source.keys.length, counts,
}, null, 2) + "\n");
// Keep reviewed equivalents and the three same-item Spanish entries after extraction.
await import("./fill-client-locale-duplicate-gaps.mjs");
await import("./apply-wowhead-game-name-locales.mjs");
await import("./build-wowhead-item-catalog-name-locales.mjs");
