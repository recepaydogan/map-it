import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";
import { loadWowheadClassDescriptions, sameClassDescriptionText } from
  "./lib/wowhead-class-description-captures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = await read("public/data/classes/catalog.json");
const reviewed = await read("data/class-catalog-localization/reviewed-prose.json");
const clientSource = await read("public/data/locales/wow-forever/source.json");
const clientKeyIndices = new Map(clientSource.keys.map((key, index) => [key, index]));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const gameLocaleCodes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const descriptions = new Set(catalog.classes.flatMap((entry) => [
  ...entry.trees.flatMap((tree) => tree.new.map((talent) => talent.description)),
  ...entry.abilities.new.map((ability) => ability.description),
]).filter(Boolean));
const catalogSpells = catalog.classes.flatMap((entry) => [
  ...entry.trees.flatMap((tree) => tree.new), ...entry.abilities.new,
]).filter((spell) => spell.description);
const spellVariables = (text) => (text.match(/\$[A-Za-z0-9]+/g) ?? []).sort().join("|");
const numericValues = (text) => {
  const numbers = (text.replace(/\{\{CLIENT:[^}]+\}\}/g, "")
    .match(/\d+(?:[.,]\d+)?/g) ?? []).map((value) => value.replace(",", "."))
    .filter((value) => value !== "1");
  return [...new Set(numbers)].sort().join("|");
};
if (reviewed.version !== 1 || !reviewed.translations) throw new Error("Invalid class catalog prose review");

// Keep reviewed translations already in the catalog. Rebuilding from the
// currently available captures alone would discard valid Forever prose.
const packs = Object.fromEntries(await Promise.all(languages.map(async (language) => {
  const existing = await read(`public/data/classes/locales/${language}.json`);
  if (existing.version !== 1 || !existing.translations ||
    Object.entries(existing.translations).some(([source, value]) =>
      typeof value !== "string" || !value.trim() || value === source)) {
    throw new Error(`${language}: invalid existing class catalog locale`);
  }
  return [language, { version: 1, translations: Object.fromEntries(
    Object.entries(existing.translations).filter(([source]) => descriptions.has(source))) }];
})));
const clientPacks = Object.fromEntries(await Promise.all(languages.map(async (language) =>
  [language, await read(`public/data/locales/wow-forever/${gameLocaleCodes[language]}.json`)])));
const spellIndex = await read("public/data/spells/foreverdb/index.json");
const spellDetails = Object.assign({}, ...await Promise.all(Array.from({ length: 64 },
  (_, shard) => read(`public/data/spells/foreverdb/${shard}.json`))));
const spellPacks = Object.fromEntries(await Promise.all(languages.map(async (language) =>
  [language, await read(`public/data/locales/wow-forever/spell-tooltip-${gameLocaleCodes[language]}.json`)])));
const wowhead = await loadWowheadClassDescriptions(root);
const wowheadLocales = { de: "de", es: "es", "es-MX": "mx", fr: "fr", ko: "ko",
  "pt-BR": "pt", "zh-Hans": "cn", "zh-Hant": "tw" };
const spellIdsByName = new Map();
for (const row of spellIndex) {
  const ids = spellIdsByName.get(row[1]) ?? [];
  ids.push(String(row[0]));
  spellIdsByName.set(row[1], ids);
}
let inactiveReviewed = 0;
for (const [source, translations] of Object.entries(reviewed.translations)) {
  // Keep old review entries in the source file for a future catalog revision.
  if (!descriptions.has(source)) {
    inactiveReviewed += 1;
    continue;
  }
  if (Object.keys(translations).sort().join("|") !== [...languages].sort().join("|")) {
    throw new Error(`Incomplete language set for class catalog prose: ${source}`);
  }
  for (const language of languages) {
    if (packs[language].translations[source]) continue;
    const authored = translations[language];
    if (typeof authored !== "string" || !authored.trim()) {
      throw new Error(`Untranslated class catalog prose: ${language}/${source}`);
    }
    const value = authored.replace(/\{\{CLIENT:([A-Za-z]+:\d+:\d+)\|([^}]+)\}\}/g,
      (_, key, english) => {
        const index = clientKeyIndices.get(key);
        const localized = clientPacks[language].values[index];
        if (index === undefined || clientSource.values[index] !== english ||
          !source.includes(english) || !localized) {
          throw new Error(`Unavailable class catalog client term: ${language}/${key}`);
        }
        return localized;
      });
    if (value === source || /\{\{CLIENT:/.test(value) ||
      spellVariables(value) !== spellVariables(source) ||
      numericValues(authored) !== numericValues(source)) {
      throw new Error(`Untranslated class catalog prose: ${language}/${source}`);
    }
    packs[language].translations[source] = value;
  }
}

let spellMatched = 0;
for (const spell of catalogSpells) {
  const source = spell.description;
  if (languages.every((language) => packs[language].translations[source])) continue;
  const ids = (spellIdsByName.get(spell.name) ?? []).filter((id) =>
    spellDetails[id]?.d === source);
  if (!ids.length) continue;
  const translated = Object.fromEntries(languages.map((language) => {
    const values = [...new Set(ids.map((id) => spellPacks[language].entries[id]?.d)
      .filter(Boolean))];
    return [language, values.length === 1 ? values[0] : undefined];
  }));
  if (languages.some((language) => !translated[language] || translated[language] === source ||
    /\$[A-Za-z0-9{]/.test(translated[language]) ||
    spellVariables(translated[language]) !== spellVariables(source) ||
    numericValues(translated[language]) !== numericValues(source))) continue;
  for (const language of languages) {
    if (!packs[language].translations[source]) packs[language].translations[source] = translated[language];
  }
  spellMatched += 1;
}
console.log(`${spellMatched} exact-ID spell descriptions reused; ${inactiveReviewed} inactive reviews retained`);
let wowheadMatched = 0;
for (const spell of catalogSpells) {
  const source = spell.description;
  const ids = (spellIdsByName.get(spell.name) ?? []).filter((id) =>
    spellDetails[id]?.d === source && wowhead.get(`${id}:en`)?.name === spell.name &&
    sameClassDescriptionText(wowhead.get(`${id}:en`)?.text ?? "", source));
  if (ids.length !== 1) continue;
  const id = ids[0];
  for (const language of languages) {
    if (packs[language].translations[source]) continue;
    const text = wowhead.get(`${id}:${wowheadLocales[language]}`)?.text;
    if (!text || sameClassDescriptionText(text, source) || /\$[A-Za-z0-9{]/.test(text) ||
      numbers(text) !== numbers(source) ||
      hasEastAsianEnglishCarryover(text, gameLocaleCodes[language])) continue;
    packs[language].translations[source] = text;
    wowheadMatched++;
  }
}
console.log(`${wowheadMatched} source-matched Wowhead class description translations reused`);
if (process.argv.includes("--report-gaps")) {
  const seen = new Set();
  for (const spell of catalogSpells) {
    const source = spell.description;
    if (seen.has(source) || packs[languages[0]].translations[source]) continue;
    seen.add(source);
    const ids = (spellIdsByName.get(spell.name) ?? []).filter((id) =>
      spellDetails[id]?.d === source);
    const issues = languages.flatMap((language) => {
      if (packs[language].translations[source]) return [];
      const values = [...new Set(ids.map((id) => spellPacks[language].entries[id]?.d)
        .filter(Boolean))];
      if (!values.length) return [`${language}:missing`];
      if (values.length > 1) return [`${language}:ambiguous`];
      if (spellVariables(values[0]) !== spellVariables(source) ||
        numericValues(values[0]) !== numericValues(source)) return [`${language}:mismatch`];
      return [];
    });
    console.log(`${spell.name}: ${ids.join(",") || "no ID"}; ${issues.join(",") || "unusable"}`);
  }
}

const directory = join(root, "public/data/classes/locales");
const check = process.argv.includes("--check");
if (!check) await mkdir(directory, { recursive: true });
for (const language of languages) {
  const path = join(directory, `${language}.json`);
  const content = JSON.stringify(packs[language], null, 2) + "\n";
  if (check) {
    if (content !== await readFile(path, "utf8")) throw new Error(`${language}: class catalog locale is stale`);
  } else await writeFile(path, content);
  console.log(`${language}: ${Object.keys(packs[language].translations).length}/${descriptions.size} distinct descriptions`);
}
