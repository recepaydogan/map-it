/** Resolve numeric Spell variables only through the same client's item-to-spell links. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { matchNumericSpellTemplate, numberSignature, renderNumericSpellTemplate,
  variableSignature } from "./lib/match-client-spell-variable.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await read("public/data/items/catalog.json");
const catalogItemIds = new Set(catalog.items.map((item) => item.id));
const provenance = await read("public/data/locales/wow-forever/provenance.json");
const registrations = await read("data/client-research/db2-table-names.json");
const byName = new Map(registrations.identified.map((entry) => [entry.name, entry]));
const spellFileId = byName.get("Spell")?.fileDataId;
if (!spellFileId || !byName.has("ItemXItemEffect") || !byName.has("ItemEffect")) {
  throw new Error("Client item-effect tables are unidentified");
}
const spellFile = `FILE${spellFileId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const installDir = process.env.CASC_INSTALL_DIR ?? "C:/Program Files (x86)/World of Warcraft";
const open = (locale) => casc.Storage.openEx(installDir, {
  codeName: provenance.product, region: "us",
  localeMask: casc[`CASC_LOCALE_${locale.toUpperCase()}`], online: false,
});
const fields = (row) => row?.data?.toString("utf8").split("\0") ?? [];
const spellsByItem = new Map();
const itemsByText = new Map();
for (const item of catalog.items) for (const effect of item.siteEffects ?? []) {
  const ids = itemsByText.get(effect.text) ?? new Set();
  ids.add(item.id);
  itemsByText.set(effect.text, ids);
}

const english = open("enUS");
const candidates = new Map();
try {
  if (english.getProductInfo().buildNumber !== provenance.build) {
    throw new Error("Installed client build differs from locale packs");
  }
  const readTable = (name) => {
    const registration = byName.get(name);
    const file = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const reader = readLocalWdc5(english.readFile(file)).reader;
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout differs from the verified registration`);
    }
    return reader;
  };
  const itemLinks = readTable("ItemXItemEffect");
  const itemEffects = readTable("ItemEffect");
  for (const linkId of itemLinks.getAllIDs()) {
    const itemId = String(itemLinks.getRowRelationship(linkId));
    const effectId = itemLinks.getRowData(linkId)?.[0]?.data;
    if (!Number.isSafeInteger(effectId) || !catalogItemIds.has(itemId)) continue;
    const spellId = itemEffects.getRowData(effectId)?.[6]?.data;
    if (!Number.isSafeInteger(spellId)) continue;
    const ids = spellsByItem.get(itemId) ?? new Set();
    ids.add(spellId);
    spellsByItem.set(itemId, ids);
  }
  const reader = readTable("Spell");
  for (const [text, itemIds] of itemsByText) {
    const matches = [];
    let complete = true;
    for (const itemId of itemIds) {
      const spellIds = spellsByItem.get(itemId);
      if (!spellIds?.size) { complete = false; break; }
      const itemMatches = [];
      for (const spellId of spellIds) {
        fields(reader.getRowData(spellId)).forEach((clientEnglish, field) => {
          if (field < 1 || !clientEnglish) return;
          const values = matchNumericSpellTemplate(clientEnglish, text);
          if (!values) return;
          itemMatches.push({ itemId, spellId, field, clientEnglish, values });
        });
      }
      if (!itemMatches.length) { complete = false; break; }
      matches.push(...itemMatches);
    }
    if (complete) candidates.set(text, { matches, translations: {} });
  }
} finally { english.close(); }

for (const locale of locales) {
  const storage = open(locale);
  try {
    if (storage.getProductInfo().buildNumber !== provenance.build) {
      throw new Error(`${locale}: installed client build differs from locale packs`);
    }
    const reader = readLocalWdc5(storage.readFile(spellFile)).reader;
    for (const [englishText, record] of candidates) {
      const localized = new Set();
      let complete = true;
      for (const match of record.matches) {
        const template = fields(reader.getRowData(match.spellId))[match.field]?.trim();
        if (!template || variableSignature(template) !==
          variableSignature(match.clientEnglish)) { complete = false; break; }
        const translated = renderNumericSpellTemplate(template, match.values);
        if (!translated || translated === englishText ||
          numberSignature(translated) !== numberSignature(englishText)) {
          complete = false; break;
        }
        localized.add(translated);
      }
      if (complete && localized.size === 1) record.translations[locale] = [...localized][0];
    }
  } finally { storage.close(); }
  console.log(`${locale}: ${[...candidates.values()].filter((record) =>
    record.translations[locale]).length} numeric Spell effects matched`);
}

const effects = Object.fromEntries([...candidates].filter(([, record]) =>
  Object.keys(record.translations).length > 0));
await writeFile(join(root,
  "data/item-effect-localization/client-spell-variable-effect-matches.json"),
JSON.stringify({ version: 1, product: provenance.product, build: provenance.build,
  spellFileId, locales, effects }, null, 2) + "\n");
console.log(`${Object.keys(effects).length} numeric item effects matched in at least one locale`);
