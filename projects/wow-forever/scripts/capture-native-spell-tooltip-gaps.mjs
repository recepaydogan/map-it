/** Capture current Blizzard Spell rows only for unresolved tooltip IDs. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = async (name) => JSON.parse(await readFile(path.join(root, name), "utf8"));
const dir = "data/spell-tooltip-localization/native-70790";
const cache = path.join(root,
  "data/site-research/wowhead-check-2026-11-04/localization/casc-cache");
const expectedBuild = 70790;
const locales = ["enUS", "deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const details = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const packs = await Promise.all(locales.slice(1).map((locale) =>
  read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`)));
const fields = ["r", "d", "a", "old"];
const ids = Object.entries(details).filter(([id, detail]) =>
  fields.some((field) => detail[field] &&
    !(field === "old" && detail.old === detail.d) &&
    packs.some((pack) => !pack.entries[id]?.[field]))).map(([id]) => Number(id));
const catalog = await read("data/client-research/db2-table-names.json");
const filenames = Object.fromEntries(["Spell", "SpellName"].map((name) => {
  const registration = catalog.identified.find((table) => table.name === name);
  if (!registration) throw new Error(`Missing client table: ${name}`);
  return [name, `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`];
}));
const strings = (row) => {
  if (Array.isArray(row)) return row.map((cell) => cell.string ?? "");
  if (row?.type !== "sparse" || !Buffer.isBuffer(row.data)) return [];
  const values = [];
  let start = 0;
  for (let i = 0; i < 3; i++) {
    const end = row.data.indexOf(0, start);
    if (end < 0) return [];
    values.push(row.data.subarray(start, end).toString("utf8"));
    start = end + 1;
  }
  return values;
};
await mkdir(path.join(root, dir), { recursive: true });
for (const locale of locales) {
  const filename = path.join(root, dir, `${locale}.json`);
  const existing = await readFile(filename, "utf8").then(JSON.parse).catch((error) => {
    if (error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing?.build === expectedBuild && existing.locale === locale &&
    ids.every((id) => Object.hasOwn(existing.spells, id))) {
    console.log(`${locale}: cached ${ids.length} tooltip gap IDs`);
    continue;
  }
  const storage = casc.Storage.openEx(cache, {
    codeName: "wowf", region: "eu",
    localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: true,
  });
  try {
    const build = storage.getProductInfo().buildNumber;
    if (build !== expectedBuild) throw new Error(`${locale}: client build changed to ${build}`);
    const spell = readLocalWdc5(storage.readFile(filenames.Spell)).reader;
    const spellName = readLocalWdc5(storage.readFile(filenames.SpellName)).reader;
    const rows = Object.fromEntries(ids.map((id) => [id, {
      name: strings(spellName.getRowData(id))[0] ?? "",
      fields: strings(spell.getRowData(id)),
    }]));
    await writeFile(filename, `${JSON.stringify({ version: 1,
      source: "Blizzard CASC wowf EU", build, locale, spells: rows })}\n`);
    console.log(`${locale}: captured ${ids.length} tooltip gap IDs`);
  } finally { storage.close(); }
}
