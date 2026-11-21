/** Add source-matched Wowhead item and spell names to the app game dictionaries. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = "public/data/locales/wow-forever";
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const source = await read(`${directory}/source.json`);
const provenance = await read(`${directory}/provenance.json`);
const packs = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, await read(`${directory}/${locale}.json`)])));
const items = await read("data/site-research/wowhead-item-name-candidates.json");
const spells = await read("data/site-research/wowhead-spell-name-candidates.json");
if (source.version !== 1 || !Array.isArray(source.keys) ||
  source.keys.length !== source.values.length || items.version !== 1 ||
  spells.version !== 1 || locales.some((locale) =>
    packs[locale].version !== 1 || packs[locale].values.length !== source.keys.length)) {
  throw new Error("Invalid game locale source or Wowhead candidates");
}
const index = new Map(source.keys.map((key, position) => [key, position]));
const counts = { itemKeysAdded: 0, itemNamesApplied: 0,
  itemEnglishFallbacks: 0, spellNamesApplied: 0 };
for (const item of items.candidates) {
  const key = `ItemSparse:${item.id}:4`;
  let position = index.get(key);
  if (position === undefined) {
    position = source.keys.length;
    index.set(key, position);
    source.keys.push(key);
    source.values.push(item.source);
    for (const locale of locales) packs[locale].values.push(null);
    counts.itemKeysAdded++;
  } else if (source.values[position].trim() !== item.source.trim()) {
    throw new Error(`${key}: Wowhead item source differs from app source`);
  }
  for (const [locale, value] of Object.entries(item.translations)) {
    if (!locales.includes(locale) || !value?.trim()) throw new Error(`${key}: invalid locale`);
    const prior = packs[locale].values[position];
    if (prior && prior !== source.values[position] && prior !== value) continue;
    if (prior !== value) {
      packs[locale].values[position] = value;
      counts.itemNamesApplied++;
    }
  }
  for (const locale of locales) {
    if (packs[locale].values[position]) continue;
    packs[locale].values[position] = source.values[position];
    counts.itemEnglishFallbacks++;
  }
}
for (const spell of spells.candidates) {
  if (!spell.sourceMatches) continue;
  const key = `SpellName:${spell.id}:0`;
  const position = index.get(key);
  if (position === undefined || source.values[position] !== spell.source) continue;
  for (const [locale, record] of Object.entries(spell.names)) {
    if (record.status !== "translated") continue;
    if (!locales.includes(locale) || !record.value?.trim()) {
      throw new Error(`${key}: invalid spell name locale`);
    }
    const prior = packs[locale].values[position];
    if (prior && prior !== spell.source && prior !== record.value) continue;
    if (prior !== record.value) {
      packs[locale].values[position] = record.value;
      counts.spellNamesApplied++;
    }
  }
}
await writeFile(join(root, `${directory}/source.json`), JSON.stringify(source));
for (const locale of locales) {
  await writeFile(join(root, `${directory}/${locale}.json`),
    JSON.stringify(packs[locale]));
}
provenance.clientSourceStrings ??= provenance.sourceStrings;
provenance.sourceStrings = source.keys.length;
provenance.wowheadNameSupplement = {
  itemCandidateFile: "data/site-research/wowhead-item-name-candidates.json",
  spellCandidateFile: "data/site-research/wowhead-spell-name-candidates.json",
  itemKeys: items.candidates.length,
  itemLocaleTranslations: items.counts.translated,
  spellLocaleTranslations: spells.counts.translated,
};
await writeFile(join(root, `${directory}/provenance.json`),
  `${JSON.stringify(provenance, null, 2)}\n`);
console.log(JSON.stringify(counts));
