/** Find installed-client item names for Wowhead's untranslated locale replies. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await read("public/data/items/catalog.json");
const report = await read("data/site-research/wowhead-item-name-candidates.json");
const source = await read("public/data/locales/wow-forever/source.json");
const provenance = await read("public/data/locales/wow-forever/provenance.json");
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const packs = Object.fromEntries(await Promise.all(Object.entries(locales).map(
  async ([locale, gameLocale]) => [locale, await read(
    `public/data/locales/wow-forever/${gameLocale}.json`)])));
const reviewed = new Map(report.candidates.map((record) => [record.id, record]));
const mismatched = new Set(report.mismatches.map((record) => record.id));
const sameName = (left, right) =>
  left.normalize("NFKC").toLocaleLowerCase("en-US") ===
  right.normalize("NFKC").toLocaleLowerCase("en-US");
const target = new Map();
for (const item of catalog.items) {
  const id = Number(item.id);
  if (mismatched.has(id)) continue;
  const index = sourceIndex.get(`ItemSparse:${item.id}:4`);
  const missing = Object.entries(packs).filter(([locale, pack]) =>
    (index === undefined || !pack.values[index] ||
      pack.values[index] === source.values[index]) &&
    !reviewed.get(id)?.translations[locales[locale]])
    .map(([locale]) => locale);
  if (missing.length) target.set(id, { source: item.name, missing });
}
const table = "FILE00136E40.dat"; // ItemSearchName, FileDataID 1273408.
const names = {};
for (const locale of ["enUS", ...Object.values(locales)]) {
  const storage = casc.Storage.openEx(process.env.CASC_INSTALL_DIR ??
    "C:/Program Files (x86)/World of Warcraft", {
    codeName: "wow_classic_beta", region: "us",
    localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
  });
  try {
    if (storage.getProductInfo().buildNumber !== provenance.build) {
      throw new Error(`${locale}: installed client differs from locale pack build`);
    }
    const reader = readLocalWdc5(storage.readFile(table)).reader;
    names[locale] = new Map([...target].map(([id]) =>
      [id, reader.getRowData(id)?.[0]?.string]));
  } finally {
    storage.close();
  }
}
const result = { version: 1, clientBuild: provenance.build, table: "ItemSearchName",
  candidates: [], counts: { targetIds: target.size, sourceMatchedIds: 0,
    missingLocaleFields: [...target.values()].reduce((sum, item) =>
      sum + item.missing.length, 0), translated: 0 } };
for (const [id, item] of target) {
  const english = names.enUS.get(id);
  if (!english || !sameName(english, item.source)) continue;
  result.counts.sourceMatchedIds++;
  const translations = {};
  for (const locale of item.missing) {
    const value = names[locales[locale]].get(id);
    if (!value || sameName(value, english)) continue;
    translations[locales[locale]] = value;
    result.counts.translated++;
  }
  if (Object.keys(translations).length) result.candidates.push({
    id, source: item.source, translations,
    evidence: `installed-client:${provenance.build}:ItemSearchName:${id}:0`,
  });
}
await writeFile(join(root, "data/site-research/client-item-search-name-candidates.json"),
  `${JSON.stringify(result, null, 2)}\n`);
console.log(`${result.candidates.length} item IDs with client fallback candidates; ` +
  `${JSON.stringify(result.counts)}.`);
