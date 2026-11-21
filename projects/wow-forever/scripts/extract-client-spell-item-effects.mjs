/** Reuse exact item-effect prose from the same installed Forever client's Spell table. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const output = join(root, "data/item-effect-localization/client-spell-effect-matches.json");
const catalog = await read("public/data/items/catalog.json");
const provenance = await read("public/data/locales/wow-forever/provenance.json");
const reviewed = await read("data/item-effect-localization/reviewed-effects.json");
const names = await read("data/client-research/db2-table-names.json");
const spellFileId = names.identified.find((entry) => entry.name === "Spell")?.fileDataId;
if (!spellFileId) throw new Error("Client Spell table is unidentified");
const spellFile = `FILE${spellFileId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const wanted = new Set(catalog.items.flatMap((item) =>
  (item.siteEffects ?? []).map((effect) => effect.text)));
const open = (locale) => casc.Storage.openEx(installDir, {
  codeName: provenance.product, region: "us",
  localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
});
const fields = (row) => row?.data?.toString("utf8").split("\0") ?? [];
const numbers = (text) => (text.match(/\d+/g) ?? []).sort().join("|");
const variables = (text) => (text.match(/\$\{[^}]+\}|\$[A-Za-z]\d*/g) ?? [])
  .sort().join("|");
const normalizeFormatting = (text) => text.toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}$]+/gu, "");
const refsByEnglish = new Map();
const refsByFormatting = new Map();
const clientEnglishByText = new Map();
const english = open("enUS");
try {
  if (english.getProductInfo().buildNumber !== provenance.build) {
    throw new Error("Installed client build differs from the extracted locale packs");
  }
  const reader = readLocalWdc5(english.readFile(spellFile)).reader;
  for (const id of reader.getAllIDs()) {
    fields(reader.getRowData(id)).forEach((value, field) => {
      if (!wanted.has(value) || Object.hasOwn(reviewed.effects, value)) return;
      const refs = refsByEnglish.get(value) ?? [];
      refs.push({ id, field });
      refsByEnglish.set(value, refs);
    });
    fields(reader.getRowData(id)).forEach((value, field) => {
      if (field < 1 || !value) return;
      const normalized = normalizeFormatting(value);
      if (normalized.length < 20) return;
      const refs = refsByFormatting.get(normalized) ?? [];
      refs.push({ id, field, english: value });
      refsByFormatting.set(normalized, refs);
    });
  }
} finally { english.close(); }

for (const text of wanted) {
  if (refsByEnglish.has(text) || Object.hasOwn(reviewed.effects, text)) continue;
  const normalized = normalizeFormatting(text);
  if (normalized.length < 20) continue;
  const refs = refsByFormatting.get(normalized);
  if (!refs?.length) continue;
  refsByEnglish.set(text, refs.map(({ id, field }) => ({ id, field })));
  clientEnglishByText.set(text, [...new Set(refs.map(({ english }) => english))]);
}

const translations = new Map([...refsByEnglish].map(([text, refs]) =>
  [text, { spellRefs: refs, clientEnglish: clientEnglishByText.get(text) ?? [text],
    translations: {} }]));
for (const locale of locales) {
  const storage = open(locale);
  try {
    if (storage.getProductInfo().buildNumber !== provenance.build) {
      throw new Error(`${locale}: installed client build differs from locale packs`);
    }
    const reader = readLocalWdc5(storage.readFile(spellFile)).reader;
    for (const [englishText, record] of translations) {
      const localized = new Set(record.spellRefs.map(({ id, field }) =>
        fields(reader.getRowData(id))[field]?.trim()).filter(Boolean));
      if (localized.size !== 1) continue;
      const text = [...localized][0];
      if (text === englishText || numbers(text) !== numbers(englishText) ||
        variables(text) !== variables(englishText)) continue;
      record.translations[locale] = text;
    }
  } finally { storage.close(); }
  console.log(`${locale}: ${[...translations.values()].filter((record) =>
    record.translations[locale]).length} client Spell texts matched`);
}

const effects = Object.fromEntries([...translations].filter(([, record]) =>
  Object.keys(record.translations).length > 0));
await writeFile(output, JSON.stringify({ version: 1, product: provenance.product,
  build: provenance.build, spellFileId, locales, effects }, null, 2) + "\n");
console.log(`${Object.keys(effects).length} item effects matched in at least one locale; ` +
  `${Object.values(effects).filter((record) => locales.every((locale) =>
    record.translations[locale])).length} in every locale`);
