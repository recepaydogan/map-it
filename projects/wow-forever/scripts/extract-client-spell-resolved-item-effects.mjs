/** Reuse resolved item site prose only when its linked client Spell template matches. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as casc from "@jamiephan/casclib";
import { readLocalWdc5 } from "./lib/read-local-wdc5.mjs";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from
  "./lib/match-client-spell-resolved.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await read("public/data/items/catalog.json");
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
const numberSignature = (text) => (text.match(/\d+/g) ?? []).sort().join("|");
const itemIdsByText = new Map();
const existingGerman = process.argv.includes("--report-unmatched") ?
  await read("public/data/locales/wow-forever/item-effects-deDE.json") : undefined;
const unmatched = [];
const catalogItemIds = new Set(catalog.items.map((item) => item.id));
for (const item of catalog.items) for (const effect of item.siteEffects ?? []) {
  const ids = itemIdsByText.get(effect.text) ?? new Set();
  ids.add(item.id);
  itemIdsByText.set(effect.text, ids);
}

const candidates = new Map();
const crateHeader = { spellId: 1308117, field: 1,
  english: "Fill the crate with any bundle from the following list:", translations: {} };
const fishingWellFedSource = { spellId: 1249508, field: 1,
  englishFragment: "Fishing Skill", translations: {} };
const english = open("enUS");
try {
  if (english.getProductInfo().buildNumber !== provenance.build) {
    throw new Error("Installed client build differs from locale packs");
  }
  const readTable = (name) => {
    const registration = byName.get(name);
    const file = `FILE${registration.fileDataId.toString(16).toUpperCase().padStart(8, "0")}.dat`;
    const reader = readLocalWdc5(english.readFile(file)).reader;
    if (reader.layoutHash.toString(16).padStart(8, "0") !== registration.layoutHash) {
      throw new Error(`${name} layout differs from verified registration`);
    }
    return reader;
  };
  const itemLinks = readTable("ItemXItemEffect");
  const itemEffects = readTable("ItemEffect");
  const spellIdsByItem = new Map();
  for (const linkId of itemLinks.getAllIDs()) {
    const itemId = String(itemLinks.getRowRelationship(linkId));
    if (!catalogItemIds.has(itemId)) continue;
    const effectId = itemLinks.getRowData(linkId)?.[0]?.data;
    const spellId = itemEffects.getRowData(effectId)?.[6]?.data;
    if (!Number.isSafeInteger(spellId)) continue;
    const ids = spellIdsByItem.get(itemId) ?? new Set();
    ids.add(spellId);
    spellIdsByItem.set(itemId, ids);
  }
  const spells = readTable("Spell");
  if (fields(spells.getRowData(crateHeader.spellId))[crateHeader.field] !== crateHeader.english) {
    throw new Error("Client crate instruction differs from reviewed English text");
  }
  const englishFishingDescription = fields(spells.getRowData(fishingWellFedSource.spellId))
    [fishingWellFedSource.field];
  if (!englishFishingDescription?.includes(fishingWellFedSource.englishFragment)) {
    throw new Error("Client fishing well-fed phrase differs from reviewed English text");
  }
  for (const [text, itemIds] of itemIdsByText) {
    const matches = [];
    let complete = true;
    for (const itemId of itemIds) {
      const itemMatches = [];
      for (const spellId of spellIdsByItem.get(itemId) ?? []) {
        fields(spells.getRowData(spellId)).forEach((clientEnglish, field) => {
          if (field < 1 || !clientEnglish) return;
          const values = matchLinkedSpellTemplate(clientEnglish, text);
          if (values) itemMatches.push({ itemId, spellId, field, clientEnglish, values });
        });
      }
      if (!itemMatches.length) { complete = false; break; }
      matches.push(...itemMatches);
    }
    if (complete) candidates.set(text, { matches, translations: {} });
    else if (existingGerman && !existingGerman.translations[text]) {
      const words = (value) => new Set(value.toLowerCase().match(/[a-z]{4,}/g) ?? []);
      const sourceWords = words(text);
      const nearby = [...itemIds].flatMap((itemId) => [...spellIdsByItem.get(itemId) ?? []]
        .flatMap((spellId) => fields(spells.getRowData(spellId)).slice(1)
          .filter(Boolean).map((clientText) => ({ itemId, spellId, clientText,
            score: [...words(clientText)].filter((word) => sourceWords.has(word)).length /
              Math.max(1, Math.min(sourceWords.size, words(clientText).size)) }))));
      unmatched.push({ text, best: nearby.sort((a, b) => b.score - a.score)[0] });
    }
  }
} finally { english.close(); }

for (const locale of locales) {
  const storage = open(locale);
  try {
    if (storage.getProductInfo().buildNumber !== provenance.build) {
      throw new Error(`${locale}: installed client build differs from locale packs`);
    }
    const reader = readLocalWdc5(storage.readFile(spellFile)).reader;
    if (reader.layoutHash.toString(16).padStart(8, "0") !== byName.get("Spell").layoutHash) {
      throw new Error(`${locale}: Spell layout differs from verified registration`);
    }
    const localizedCrateHeader = fields(reader.getRowData(crateHeader.spellId))[crateHeader.field];
    if (!localizedCrateHeader || localizedCrateHeader === crateHeader.english) {
      throw new Error(`${locale}: crate instruction missing from client`);
    }
    crateHeader.translations[locale] = localizedCrateHeader;
    fishingWellFedSource.translations[locale] =
      fields(reader.getRowData(fishingWellFedSource.spellId))[fishingWellFedSource.field];
    if (!fishingWellFedSource.translations[locale]) {
      throw new Error(`${locale}: fishing well-fed phrase missing from client`);
    }
    for (const [text, record] of candidates) {
      const localized = new Set();
      let complete = true;
      for (const match of record.matches) {
        const template = fields(reader.getRowData(match.spellId))[match.field]?.trim();
        if (!template || template === match.clientEnglish.trim()) { complete = false; break; }
        const translated = renderResolvedSpellTemplate(template, match.values, locale);
        if (!translated || translated === text ||
          numberSignature(translated) !== numberSignature(text)) {
          complete = false;
          break;
        }
        localized.add(translated);
      }
      if (complete && localized.size === 1) record.translations[locale] = [...localized][0];
    }
  } finally { storage.close(); }
  console.log(`${locale}: ${[...candidates.values()].filter((record) =>
    record.translations[locale]).length} linked Spell effects matched`);
}

const effects = Object.fromEntries([...candidates].filter(([, record]) =>
  Object.keys(record.translations).length > 0));
await writeFile(join(root,
  "data/item-effect-localization/client-spell-resolved-effect-matches.json"),
JSON.stringify({ version: 1, product: provenance.product, build: provenance.build,
  spellFileId, locales, crateHeader, fishingWellFedSource, effects }, null, 2) + "\n");
console.log(`${Object.keys(effects).length} linked Spell effects matched in at least one locale`);
if (existingGerman) {
  await writeFile(join(root,
    "data/item-effect-localization/unmatched-client-spell-effects.json"),
  JSON.stringify({ version: 1, product: provenance.product, build: provenance.build,
    locale: "deDE", records: unmatched }, null, 2) + "\n");
  console.log(`${unmatched.length} German-unresolved effects lack a strict linked Spell match`);
}
