/** Build reviewed translations for item effect prose absent from client locale tables. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchNumericSpellTemplate, numberSignature } from
  "./lib/match-client-spell-variable.mjs";
import { matchLinkedSpellTemplate } from "./lib/match-client-spell-resolved.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const reviewed = await read("data/item-effect-localization/reviewed-effects.json");
const wowhead = await read("data/site-research/wowhead-item-effect-candidates.json");
const clientSpellMatches = await read("data/item-effect-localization/client-spell-effect-matches.json");
const clientSpellVariableMatches = await read(
  "data/item-effect-localization/client-spell-variable-effect-matches.json");
const clientSpellResolvedMatches = await read(
  "data/item-effect-localization/client-spell-resolved-effect-matches.json");
const clientProvenance = await read("public/data/locales/wow-forever/provenance.json");
const catalog = await read("public/data/items/catalog.json");
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const clientSource = await read("public/data/locales/wow-forever/source.json");
const clientLocales = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, await read(`public/data/locales/wow-forever/${locale}.json`)])));
const appLocaleNames = { deDE: "de", esES: "es", esMX: "es-MX", frFR: "fr", koKR: "ko",
  ptBR: "pt-BR", zhCN: "zh-Hans", zhTW: "zh-Hant" };
const appLocales = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, await read(`src/i18n/locales/${appLocaleNames[locale]}.json`)])));
const englishApp = await read("src/i18n/locales/en.json");
const check = process.argv.includes("--check");
if (reviewed.version !== 1 || !reviewed.context || !reviewed.effects ||
  !Array.isArray(catalog.items)) throw new Error("Invalid item effect translation source");
if (clientSpellMatches.version !== 1 ||
  clientSpellMatches.locales?.sort().join() !== [...locales].sort().join() ||
  !clientSpellMatches.effects || clientSpellMatches.build !== clientProvenance.build ||
  clientSpellMatches.product !== clientProvenance.product) {
  throw new Error("Invalid client Spell effect matches");
}
if (clientSpellVariableMatches.version !== 1 ||
  clientSpellVariableMatches.locales?.sort().join() !== [...locales].sort().join() ||
  !clientSpellVariableMatches.effects ||
  clientSpellVariableMatches.build !== clientProvenance.build ||
  clientSpellVariableMatches.product !== clientProvenance.product) {
  throw new Error("Invalid numeric client Spell effect matches");
}
if (clientSpellResolvedMatches.version !== 1 ||
  clientSpellResolvedMatches.locales?.sort().join() !== [...locales].sort().join() ||
  !clientSpellResolvedMatches.effects ||
  clientSpellResolvedMatches.build !== clientProvenance.build ||
  clientSpellResolvedMatches.product !== clientProvenance.product) {
  throw new Error("Invalid resolved client Spell effect matches");
}
if (reviewed.crateBundle?.headerSpellId !== clientSpellResolvedMatches.crateHeader?.spellId ||
  reviewed.crateBundle?.headerEnglish !== clientSpellResolvedMatches.crateHeader?.english ||
  Object.keys(clientSpellResolvedMatches.crateHeader.translations ?? {}).sort().join() !==
    [...locales].sort().join()) {
  throw new Error("Invalid client crate instruction translations");
}

const occurrences = new Map();
const effectItemNames = new Map();
const effectItemIds = new Map();
for (const item of catalog.items) for (const effect of item.siteEffects ?? []) {
  if (typeof effect.text !== "string" || !effect.text) {
    throw new Error(`${item.id}: invalid item effect text`);
  }
  occurrences.set(effect.text, (occurrences.get(effect.text) ?? 0) + 1);
  const names = effectItemNames.get(effect.text) ?? [];
  names.push(item.name);
  effectItemNames.set(effect.text, names);
  const ids = effectItemIds.get(effect.text) ?? new Set();
  ids.add(item.id);
  effectItemIds.set(effect.text, ids);
}
for (const [english, record] of Object.entries(reviewed.invariantEffects ?? {})) {
  const ids = [...(effectItemIds.get(english) ?? [])].map(Number).sort((a, b) => a - b);
  if (!english || /\p{L}/u.test(english) ||
    occurrences.get(english) !== record.occurrences ||
    !Array.isArray(record.itemIds) ||
    record.itemIds.slice().sort((a, b) => a - b).join() !== ids.join() ||
    typeof record.reason !== "string" || !record.reason.trim()) {
    throw new Error(`Invalid non-linguistic item effect: ${english}`);
  }
}
const tokens = (text) => (text.match(/\{\{[^}]+\}\}|\$[A-Za-z]\d*|\$\d+[A-Za-z]|%\d*\$?[sd]/g) ?? [])
  .sort().join("|");
const numbers = (text) => (text.match(/\d+/g) ?? []).sort().join("|");
const variables = (text) => (text.match(/\$\{[^}]+\}|\$[A-Za-z]\d*/g) ?? [])
  .sort().join("|");
const normalizeFormatting = (text) => text.toLocaleLowerCase("en-US")
  .replace(/[^\p{L}\p{N}$]+/gu, "");
for (const [english, record] of Object.entries(clientSpellMatches.effects)) {
  if (!occurrences.has(english)) continue;
  if (!Array.isArray(record.spellRefs) || !record.spellRefs.length ||
    record.spellRefs.some(({ id, field }) => !Number.isInteger(id) || id < 1 ||
      !Number.isInteger(field) || field < 0) ||
    !Array.isArray(record.clientEnglish) || !record.clientEnglish.length ||
    record.clientEnglish.some((text) => typeof text !== "string" ||
      normalizeFormatting(text) !== normalizeFormatting(english)) ||
    !Object.keys(record.translations ?? {}).length ||
    Object.keys(record.translations).some((locale) => !locales.includes(locale))) {
    throw new Error(`Invalid client Spell effect identity: ${english}`);
  }
  for (const [locale, translated] of Object.entries(record.translations)) {
    if (typeof translated !== "string" || !translated.trim() ||
      translated === english || numbers(translated) !== numbers(english) ||
      variables(translated) !== variables(english)) {
      throw new Error(`${locale}: invalid client Spell effect translation: ${english}`);
    }
  }
}
for (const [english, record] of Object.entries(clientSpellVariableMatches.effects)) {
  const ids = effectItemIds.get(english);
  if (!ids) continue;
  if (!Array.isArray(record.matches) || !record.matches.length ||
    !record.translations || !Object.keys(record.translations).length ||
    Object.keys(record.translations).some((locale) => !locales.includes(locale))) {
    throw new Error(`Invalid numeric client Spell identity: ${english}`);
  }
  const matchedIds = new Set();
  for (const match of record.matches) {
    if (!ids.has(match.itemId) || !Number.isInteger(match.spellId) ||
      match.spellId < 1 || !Number.isInteger(match.field) || match.field < 1 ||
      typeof match.clientEnglish !== "string" || !match.values ||
      JSON.stringify(matchNumericSpellTemplate(match.clientEnglish, english)) !==
        JSON.stringify(match.values)) {
      throw new Error(`Invalid numeric client Spell reference: ${english}`);
    }
    matchedIds.add(match.itemId);
  }
  if (matchedIds.size !== ids.size) {
    throw new Error(`Incomplete numeric client Spell item coverage: ${english}`);
  }
  for (const [locale, translated] of Object.entries(record.translations)) {
    if (typeof translated !== "string" || !translated.trim() ||
      translated === english || numberSignature(translated) !== numberSignature(english)) {
      throw new Error(`${locale}: invalid numeric client Spell translation: ${english}`);
    }
  }
}
for (const [english, record] of Object.entries(clientSpellResolvedMatches.effects)) {
  const ids = effectItemIds.get(english);
  if (!ids) continue;
  if (!Array.isArray(record.matches) || !record.matches.length ||
    !record.translations || !Object.keys(record.translations).length ||
    Object.keys(record.translations).some((locale) => !locales.includes(locale))) {
    throw new Error(`Invalid resolved client Spell identity: ${english}`);
  }
  const matchedIds = new Set();
  for (const match of record.matches) {
    if (!ids.has(match.itemId) || !Number.isInteger(match.spellId) ||
      match.spellId < 1 || !Number.isInteger(match.field) || match.field < 1 ||
      typeof match.clientEnglish !== "string" || !match.values ||
      JSON.stringify(matchLinkedSpellTemplate(match.clientEnglish, english)) !==
        JSON.stringify(match.values)) {
      throw new Error(`Invalid resolved client Spell reference: ${english}`);
    }
    matchedIds.add(match.itemId);
  }
  if (matchedIds.size !== ids.size) {
    throw new Error(`Incomplete resolved client Spell item coverage: ${english}`);
  }
  for (const [locale, translated] of Object.entries(record.translations)) {
    if (typeof translated !== "string" || !translated.trim() ||
      translated === english || numberSignature(translated) !== numberSignature(english) ||
      /\$[A-Za-z0-9{]/.test(translated)) {
      throw new Error(`${locale}: invalid resolved client Spell translation: ${english}`);
    }
  }
}
const restorationPatterns = {
  food: /^Restores (\d+) health over (\d+) sec\. Must remain seated while eating\.$/,
  drink: /^Restores (\d+) mana over (\d+) sec\. Must remain seated while drinking\.$/,
};
const restorationTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
if (Object.keys(reviewed.restorationTemplates ?? {}).sort().join() !==
  Object.keys(restorationPatterns).sort().join()) {
  throw new Error("Invalid restoration template set");
}
for (const [kind, pattern] of Object.entries(restorationPatterns)) {
  const record = reviewed.restorationTemplates[kind];
  const matches = [...occurrences].filter(([english]) => pattern.test(english));
  if (matches.length !== record.uniqueTexts ||
    matches.reduce((total, [, count]) => total + count, 0) !== record.occurrences ||
    Object.keys(record.translations ?? {}).sort().join() !== [...locales].sort().join()) {
    throw new Error(`Unverified ${kind} restoration effects`);
  }
  for (const locale of locales) {
    const template = record.translations[locale];
    if (typeof template !== "string" || !template.trim() ||
      (template.match(/\{amount\}/g) ?? []).length !== 1 ||
      (template.match(/\{seconds\}/g) ?? []).length !== 1 ||
      /\{[^}]+\}/.test(template.replace("{amount}", "").replace("{seconds}", ""))) {
      throw new Error(`${locale}: invalid ${kind} restoration template`);
    }
    for (const [english] of matches) {
      const [, amount, seconds] = pattern.exec(english);
      const translated = template.replace("{amount}", amount).replace("{seconds}", seconds);
      if (translated === english) throw new Error(`${locale}: unchanged ${kind} effect`);
      restorationTranslations[locale][english] = translated;
    }
  }
}
const wellFed = reviewed.wellFedTemplate;
const wellFedPattern = /^Restores (\d+) health over (\d+) sec\. Must remain seated while eating\. If you spend at least (\d+) seconds eating you will become well fed and gain (\d+) (.+) for (\d+) min\.$/;
const wellFedMatches = [...occurrences].filter(([english]) => {
  const match = wellFedPattern.exec(english);
  return match && wellFed?.statKeys?.[match[5]];
});
if (!wellFed || wellFed.buffEnglish !== "Well Fed" ||
  clientSource.keys.indexOf(wellFed.buffKey) < 0 ||
  clientSource.values[clientSource.keys.indexOf(wellFed.buffKey)] !== wellFed.buffEnglish ||
  wellFedMatches.length !== wellFed.uniqueTexts ||
  wellFedMatches.reduce((total, [, count]) => total + count, 0) !== wellFed.occurrences ||
  Object.keys(wellFed.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified well-fed item effects");
}
const wellFedTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
const wellFedTokens = ["health", "seconds", "eatSeconds", "wellFed", "statAmount", "statName", "minutes"];
const statConjunctions = { deDE: " und ", esES: " y ", esMX: " y ",
  frFR: " et ", koKR: "과 ", ptBR: " e ", zhCN: "和", zhTW: "與" };
for (const locale of locales) {
  const template = wellFed.translations[locale];
  if (typeof template !== "string" ||
    (template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      wellFedTokens.map((token) => `{${token}}`).sort().join()) {
    throw new Error(`${locale}: invalid well-fed template`);
  }
  const buff = clientLocales[locale].values[clientSource.keys.indexOf(wellFed.buffKey)];
  if (!buff || buff === wellFed.buffEnglish) throw new Error(`${locale}: missing native Well Fed name`);
  for (const [english] of wellFedMatches) {
    const [, health, seconds, eatSeconds, statAmount, englishStat, minutes] = wellFedPattern.exec(english);
    const statKey = wellFed.statKeys[englishStat];
    const statKeys = Array.isArray(statKey) ? statKey : [statKey];
    const englishNames = englishStat.split(" and ");
    if (statKeys.length !== englishNames.length || statKeys.some((key, index) =>
      englishApp.database.clientItem.stat[key] !== englishNames[index])) {
      throw new Error(`Invalid stat identity: ${englishStat}`);
    }
    const statNames = statKeys.map((key) => appLocales[locale].database.clientItem.stat[key]);
    if (statNames.some((name, index) => !name || name === englishNames[index])) {
      throw new Error(`${locale}: missing native stat name: ${englishStat}`);
    }
    const statName = statNames.join(statConjunctions[locale]);
    const values = { health, seconds, eatSeconds, statAmount, statName, wellFed: buff, minutes };
    wellFedTranslations[locale][english] = template.replace(/\{([^}]+)\}/g, (_, key) => values[key]);
  }
}
const dualStatWellFed = reviewed.dualStatWellFed;
const dualStatWellFedPattern = /^Restores (\d+) health over (\d+) sec\. Must remain seated while eating\. If you spend at least (\d+) sec eating you will become Well Fed and gain (\d+) (Agility|Strength) and (\d+) Stamina for (\d+) min\.$/;
const dualStatWellFedMatches = catalog.items.flatMap((item) =>
  (item.siteEffects ?? []).filter((effect) => dualStatWellFedPattern.test(effect.text))
    .map((effect) => [item, effect.text]));
if (!dualStatWellFed || dualStatWellFed.uniqueTexts !== 2 ||
  dualStatWellFed.occurrences !== 2 || dualStatWellFedMatches.length !== 2 ||
  dualStatWellFedMatches.map(([item]) => Number(item.id)).sort().join() !==
    [...dualStatWellFed.itemIds].sort().join() ||
  Object.keys(dualStatWellFed.translations ?? {}).sort().join() !== [...locales].sort().join() ||
  JSON.stringify(dualStatWellFed.statKeys) !== JSON.stringify({ Agility: "3", Strength: "4", Stamina: "7" })) {
  throw new Error("Unverified dual-stat well-fed effects");
}
const dualStatWellFedTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const [item, english] of dualStatWellFedMatches) {
  if (!["Filet o' Flank", "Prowler Steak"].includes(item.name)) {
    throw new Error(`Unexpected dual-stat food item: ${item.id}`);
  }
  const [, health, seconds, eatSeconds, primaryAmount, primaryEnglish,
    secondaryAmount, minutes] = dualStatWellFedPattern.exec(english);
  for (const locale of locales) {
    const template = dualStatWellFed.translations[locale];
    const fields = ["health", "seconds", "eatSeconds", "primaryAmount", "primaryStat",
      "secondaryAmount", "secondaryStat", "wellFed", "minutes"];
    if ((template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      fields.map((field) => `{${field}}`).sort().join()) {
      throw new Error(`${locale}: invalid dual-stat well-fed template`);
    }
    const primaryStat = appLocales[locale].database.clientItem.stat[
      dualStatWellFed.statKeys[primaryEnglish]];
    const secondaryStat = appLocales[locale].database.clientItem.stat[
      dualStatWellFed.statKeys.Stamina];
    const buff = clientLocales[locale].values[clientSource.keys.indexOf(wellFed.buffKey)];
    if (!primaryStat || primaryStat === primaryEnglish || !secondaryStat ||
      secondaryStat === "Stamina" || !buff || buff === "Well Fed") {
      throw new Error(`${locale}: missing native dual-stat food term`);
    }
    const values = { health, seconds, eatSeconds, primaryAmount, primaryStat,
      secondaryAmount, secondaryStat, wellFed: buff, minutes };
    const translated = template.replace(/\{([^}]+)\}/g, (_, field) => values[field]);
    if (numberSignature(translated) !== numberSignature(english)) {
      throw new Error(`${locale}: dual-stat food quantities changed`);
    }
    dualStatWellFedTranslations[locale][english] = translated;
  }
}
const manaWellFed = reviewed.manaWellFedTemplate;
const manaWellFedPattern = /^Restores (\d+) mana over (\d+) sec\. Must remain seated while drinking\. If you spend at least (\d+) seconds eating you will become well fed and gain (\d+) (Spirit|Healing Power) for (\d+) min\.$/;
const manaWellFedMatches = [...occurrences].filter(([english]) => manaWellFedPattern.test(english));
if (!manaWellFed || manaWellFedMatches.length !== manaWellFed.uniqueTexts ||
  manaWellFedMatches.reduce((total, [, count]) => total + count, 0) !==
    manaWellFed.occurrences ||
  Object.keys(manaWellFed.translations ?? {}).sort().join() !== [...locales].sort().join() ||
  Object.keys(manaWellFed.statKeys ?? {}).sort().join() !==
    ["Healing Power", "Spirit"].sort().join()) {
  throw new Error("Unverified mana well-fed item effects");
}
const manaWellFedTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
const manaWellFedTokens = ["mana", "seconds", "drinkSeconds", "wellFed",
  "statAmount", "statName", "minutes"];
for (const locale of locales) {
  const template = manaWellFed.translations[locale];
  if (typeof template !== "string" ||
    (template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      manaWellFedTokens.map((token) => `{${token}}`).sort().join()) {
    throw new Error(`${locale}: invalid mana well-fed template`);
  }
  const buff = clientLocales[locale].values[clientSource.keys.indexOf(wellFed.buffKey)];
  if (!buff || buff === wellFed.buffEnglish) {
    throw new Error(`${locale}: missing native Well Fed name`);
  }
  for (const [english] of manaWellFedMatches) {
    const [, mana, seconds, drinkSeconds, statAmount, englishStat, minutes] =
      manaWellFedPattern.exec(english);
    const statKey = manaWellFed.statKeys[englishStat];
    if (englishApp.database.clientItem.stat[statKey] !== englishStat) {
      throw new Error(`Invalid mana well-fed stat identity: ${englishStat}`);
    }
    const statName = appLocales[locale].database.clientItem.stat[statKey];
    if (!statName || statName === englishStat) {
      throw new Error(`${locale}: mana well-fed stat untranslated: ${englishStat}`);
    }
    if (clientSpellMatches.effects[english]?.translations[locale] ||
      clientSpellVariableMatches.effects[english]?.translations[locale] ||
      clientSpellResolvedMatches.effects[english]?.translations[locale]) continue;
    const values = { mana, seconds, drinkSeconds, statAmount, statName,
      wellFed: buff, minutes };
    manaWellFedTranslations[locale][english] = template.replace(/\{([^}]+)\}/g,
      (_, key) => values[key]);
  }
}
const fishingWellFed = reviewed.fishingWellFedTemplate;
const fishingWellFedPattern = /^Restores (\d+) health over (\d+) sec\. Must remain seated while eating\. If you spend at least (\d+) seconds eating you will become well fed and gain (\d+) Fishing Skill for (\d+) min\.$/;
const fishingWellFedMatches = [...occurrences].filter(([english]) =>
  fishingWellFedPattern.test(english));
if (!fishingWellFed || fishingWellFedMatches.length !== fishingWellFed.uniqueTexts ||
  fishingWellFedMatches.reduce((total, [, count]) => total + count, 0) !==
    fishingWellFed.occurrences ||
  fishingWellFed.sourceSpellId !==
    clientSpellResolvedMatches.fishingWellFedSource?.spellId ||
  Object.keys(fishingWellFed.terms ?? {}).sort().join() !== [...locales].sort().join() ||
  Object.keys(fishingWellFed.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified fishing well-fed item effects");
}
const fishingWellFedTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
const fishingWellFedTokens = ["health", "seconds", "eatSeconds", "wellFed",
  "statAmount", "fishingTerm", "minutes"];
for (const locale of locales) {
  const template = fishingWellFed.translations[locale];
  const fishingTerm = fishingWellFed.terms[locale];
  if (typeof template !== "string" ||
    (template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      fishingWellFedTokens.map((token) => `{${token}}`).sort().join() ||
    !clientSpellResolvedMatches.fishingWellFedSource.translations[locale]?.includes(fishingTerm)) {
    throw new Error(`${locale}: invalid client fishing well-fed term`);
  }
  const buff = clientLocales[locale].values[clientSource.keys.indexOf(wellFed.buffKey)];
  if (!buff || buff === wellFed.buffEnglish) {
    throw new Error(`${locale}: missing native Well Fed name`);
  }
  for (const [english] of fishingWellFedMatches) {
    const [, health, seconds, eatSeconds, statAmount, minutes] =
      fishingWellFedPattern.exec(english);
    if (clientSpellMatches.effects[english]?.translations[locale] ||
      clientSpellVariableMatches.effects[english]?.translations[locale] ||
      clientSpellResolvedMatches.effects[english]?.translations[locale]) continue;
    const values = { health, seconds, eatSeconds, statAmount,
      fishingTerm, wellFed: buff, minutes };
    fishingWellFedTranslations[locale][english] = template.replace(/\{([^}]+)\}/g,
      (_, key) => values[key]);
  }
}
const spellRank = reviewed.spellRankTemplate;
const spellRankPattern = /^Teaches (.+) \(Rank (\d+)\)\.$/;
const spellNameIndexes = new Map();
for (const [index, key] of clientSource.keys.entries()) {
  if (!key.startsWith("SpellName:")) continue;
  const name = clientSource.values[index];
  const indexes = spellNameIndexes.get(name) ?? [];
  indexes.push(index);
  spellNameIndexes.set(name, indexes);
}
const nativeSpellName = (english, locale) => {
  const reviewedKey = spellRank.reviewedSpellKeys?.[english];
  if (reviewedKey) {
    const index = clientSource.keys.indexOf(reviewedKey);
    if (index < 0 || clientSource.values[index] !== english) {
      throw new Error(`Reviewed teaching spell identity changed: ${english}`);
    }
    const translated = clientLocales[locale].values[index];
    if (!translated || translated === english) {
      throw new Error(`${locale}: missing reviewed teaching spell name: ${english}`);
    }
    return translated;
  }
  const indexes = spellNameIndexes.get(english) ?? [];
  const names = new Set(indexes.map((index) => clientLocales[locale].values[index]).filter(Boolean));
  return names.size === 1 && !names.has(english) ? [...names][0] : undefined;
};
const spellRankMatches = [...occurrences].filter(([english]) => {
  const match = spellRankPattern.exec(english);
  return match && effectItemNames.get(english).every((name) =>
    name.toLowerCase().includes(match[1].toLowerCase())) &&
    locales.every((locale) => nativeSpellName(match[1], locale));
});
if (!spellRank || !spellRank.context ||
  spellRankMatches.length !== spellRank.uniqueTexts ||
  spellRankMatches.reduce((total, [, count]) => total + count, 0) !== spellRank.occurrences ||
  Object.keys(spellRank.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified spell teaching effects");
}
const spellRankTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const locale of locales) {
  const template = spellRank.translations[locale];
  if (typeof template !== "string" ||
    (template.match(/\{[^}]+\}/g) ?? []).sort().join() !== "{rank},{spell}") {
    throw new Error(`${locale}: invalid spell teaching template`);
  }
  for (const [english] of spellRankMatches) {
    const [, spell, rank] = spellRankPattern.exec(english);
    spellRankTranslations[locale][english] = template.replace("{spell}", nativeSpellName(spell, locale))
      .replace("{rank}", rank);
  }
}
const numericPatterns = {
  stealthDetection: { regex: /^Increases your effective stealth detection level by (\d+)\.$/,
    fields: ["level"] },
  rangedSpeed: { regex: /^Increases ranged attack speed by (\d+)%\.$/,
    fields: ["percent"] },
  manaRange: { regex: /^Restores (\d+) to (\d+) mana\.$/,
    fields: ["minimum", "maximum"] },
  instantLife: { regex: /^Instantly restores (\d+) life\.$/,
    fields: ["amount"] },
  healthRange: { regex: /^Restores (\d+) to (\d+) health\.$/,
    fields: ["minimum", "maximum"] },
  healOverTime: { regex: /^Heals (\d+) damage over (\d+) sec\.$/,
    fields: ["amount", "seconds"] },
  fireStun: { regex: /^Inflicts (\d+) to (\d+) Fire damage and stuns targets in a (\d+) yard radius for (\d+) sec\. Any damage will break the effect\.$/,
    fields: ["minimum", "maximum", "yards", "seconds"] },
  fireArea: { regex: /^Inflicts (\d+) to (\d+) Fire damage in a (\d+) yard radius\.$/,
    fields: ["minimum", "maximum", "yards"] },
  frostArea: { regex: /^Inflicts (\d+) to (\d+) Frost damage in a (\d+) yard radius\.$/,
    fields: ["minimum", "maximum", "yards"] },
  naturePoison: { regex: /^Poisons target for (\d+) Nature damage every (\d+) sec for (\d+) sec\.$/,
    fields: ["damage", "interval", "seconds"] },
  shadowBoltFixed: { regex: /^Sends a shadowy bolt at the enemy causing (\d+) Shadow damage\.$/,
    fields: ["damage"] },
  shadowBoltRange: { regex: /^Sends a shadowy bolt at the enemy causing (\d+) to (\d+) Shadow damage\.$/,
    fields: ["minimum", "maximum"] },
  physicalAbsorb: { regex: /^Absorbs (\d+) to (\d+) physical damage\. Lasts (\d+) sec\.$/,
    fields: ["minimum", "maximum", "seconds"] },
  combinedFood: { regex: /^Restores (\d+) health and (\d+) mana over (\d+) sec\. Must remain seated while eating\.$/,
    fields: ["health", "mana", "seconds"] },
  arathiFood: { regex: /^Restores (\d+) health and (\d+) mana over (\d+) sec\. Must remain seated while eating\. Usable only inside Arathi Basin\.$/,
    fields: ["health", "mana", "seconds"] },
  arathiHealing: { regex: /^Heals (\d+) damage over (\d+) sec\. Usable only inside Arathi Basin\.$/,
    fields: ["amount", "seconds"] },
  attackPowerDuration: { regex: /^Increases your Attack Power by (\d+) for (\d+) sec\.$/,
    fields: ["amount", "seconds"] },
  healingDoneDuration: { regex: /^Increases your healing done by up to (\d+) for (\d+) sec\.$/,
    fields: ["amount", "seconds"] },
  spellDamageDuration: { regex: /^Increases your Spell Damage by (\d+) for (\d+) sec\.$/,
    fields: ["amount", "seconds"] },
  attackSpeedDuration: { regex: /^Increases your attack speed by (\d+)% for (\d+) sec\.$/,
    fields: ["percent", "seconds"] },
  targetHealRange: { regex: /^Heal your target for (\d+) to (\d+)\.$/,
    fields: ["minimum", "maximum"] },
  armorHour: { regex: /^Increases armor by (\d+) for (\d+) hr\.$/,
    fields: ["amount", "hours"] },
  stealthLevel: { regex: /^Increases your effective stealth level by (\d+)\.$/,
    fields: ["level"] },
  targetArmor: { regex: /^Increases the target's Armor by (\d+) for (\d+) min\.$/,
    fields: ["amount", "minutes"] },
  targetBleed: { regex: /^Wounds the target causing them to bleed for (\d+) damage over (\d+) sec\.$/,
    fields: ["damage", "seconds"] },
  spellDamageLong: { regex: /^Increases spell damage by up to (\d+) for (\d+) min\.$/,
    fields: ["amount", "minutes"] },
  fireballOverTime: { regex: /^Hurls a fiery ball that causes (\d+) to (\d+) Fire damage and an additional (\d+) damage over (\d+) sec\.$/,
    fields: ["minimum", "maximum", "extra", "seconds"] },
  natureRetaliation: { regex: /^When struck in combat has a (\d+)% chance of inflicting (\d+) to (\d+) Nature damage to the attacker\.$/,
    fields: ["chance", "minimum", "maximum"] },
  seatedHealthManaPercent: { regex: /^Restores (\d+)% of your health and mana per second for (\d+) sec\. Must remain seated while eating\.$/,
    fields: ["percent", "seconds"] },
  seatedHealthPercent: { regex: /^Restores (\d+)% of your health per second for (\d+) sec\. Must remain seated while eating\.$/,
    fields: ["percent", "seconds"] },
  drinkHealingPower: { regex: /^Drink to increase healing done by spells and effects by up to (\d+)\. Lasts (\d+) min\.$/,
    fields: ["amount", "minutes"] },
  healthRegenerationHour: { regex: /^Regenerate (\d+) health every (\d+) sec for (\d+) hr\.$/,
    fields: ["health", "interval", "hours"] },
  manaPerInterval: { regex: /^Restores (\d+) Mana per (\d+) sec\.$/,
    fields: ["amount", "interval"] },
  healthPerInterval: { regex: /^Restores (\d+) Health per (\d+) sec\.$/,
    fields: ["amount", "interval"] },
  instantRage: { regex: /^Instantly increases your rage by (\d+)\.$/,
    fields: ["amount"] },
  manaHealthRange: { regex: /^Restores (\d+) to (\d+) mana and health\.$/,
    fields: ["minimum", "maximum"] },
  enemyAttackPowerDebuff: { regex: /^Reduces target enemy's attack power by (\d+) for (\d+) sec\.$/,
    fields: ["amount", "seconds"] },
  targetStun: { regex: /^Stuns target for (\d+) sec\.$/,
    fields: ["seconds"] },
  natureBlast: { regex: /^Blasts a target for (\d+) to (\d+) Nature damage\.$/,
    fields: ["minimum", "maximum"] },
  periodicHealth: { regex: /^Restores (\d+) health every (\d+) sec for (\d+) sec\.$/,
    fields: ["health", "interval", "seconds"] },
  drinkSpirit: { regex: /^Drink to increase your Spirit by (\d+)\. Lasts for (\d+) min\.$/,
    fields: ["amount", "minutes"] },
  terrainResistances: { regex: /^Increases all Resistances by (\d+)\. Gain an additional (\d+) to all Resistances in Forest and Grassland areas\.$/,
    fields: ["base", "extra"] },
  terrainMana: { regex: /^Restores (\d+) Mana per (\d+) sec\. Restores an additional (\d+) Mana per (\d+) sec in Forest and Grassland areas\.$/,
    fields: ["base", "interval", "extra", "extraInterval"] },
  drunkenStamina: { regex: /^Increases Stamina by (\d+) for (\d+) min and gets you drunk to boot!$/,
    fields: ["amount", "minutes"] },
  darkspearFood: { regex: /^Restores (\d+) health and (\d+) mana over (\d+) sec\. Must remain seated while eating\. Usable only inside Darkspear Islands\.$/,
    fields: ["health", "mana", "seconds"] },
  darkspearHealing: { regex: /^Heals (\d+) damage over (\d+) sec\. Usable only inside Darkspear Islands\.$/,
    fields: ["amount", "seconds"] },
  warsongFood: { regex: /^Restores (\d+) health and (\d+) mana over (\d+) sec\. Must remain seated while eating\. Usable only inside Warsong Gulch\.$/,
    fields: ["health", "mana", "seconds"] },
  warsongHealing: { regex: /^Heals (\d+) damage over (\d+) sec\. Usable only inside Warsong Gulch\.$/,
    fields: ["amount", "seconds"] },
};
if (Object.keys(reviewed.numericTemplates ?? {}).sort().join() !==
  Object.keys(numericPatterns).sort().join()) throw new Error("Invalid numeric effect template set");
const numericTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const [kind, { regex, fields }] of Object.entries(numericPatterns)) {
  const record = reviewed.numericTemplates[kind];
  const templates = record.templateGroup ? reviewed.regionEffectTemplates?.[record.templateGroup] :
    record.translations;
  const areaIndex = record.areaKey ? clientSource.keys.indexOf(record.areaKey) : -1;
  const statEnglish = record.statKey ? englishApp.database.clientItem.stat[record.statKey] : undefined;
  const matches = [...occurrences].filter(([english]) => regex.test(english));
  if (matches.length !== record.uniqueTexts ||
    matches.reduce((total, [, count]) => total + count, 0) !== record.occurrences ||
    (record.areaKey && (areaIndex < 0 ||
      clientSource.values[areaIndex] !== record.areaEnglish ||
      !matches.every(([english]) => english.includes(record.areaEnglish)))) ||
    (record.statKey && (statEnglish !== record.statEnglish ||
      !matches.every(([english]) => english.includes(record.statEnglish)))) ||
    Object.keys(templates ?? {}).sort().join() !== [...locales].sort().join()) {
    throw new Error(`Unverified ${kind} item effects`);
  }
  for (const locale of locales) {
    const template = templates[locale];
    const area = record.areaKey ? clientLocales[locale].values[areaIndex] : undefined;
    const stat = record.statKey ? appLocales[locale].database.clientItem.stat[record.statKey] : undefined;
    if (typeof template !== "string" ||
      (template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
        [...fields, ...(record.areaKey ? ["area"] : []), ...(record.statKey ? ["stat"] : [])]
          .map((field) => `{${field}}`).sort().join() ||
      (record.areaKey && (!area || area === record.areaEnglish)) ||
      (record.statKey && (!stat || stat === record.statEnglish))) {
      throw new Error(`${locale}: invalid ${kind} effect template`);
    }
    for (const [english] of matches) {
      const values = Object.fromEntries(fields.map((field, index) =>
        [field, regex.exec(english)[index + 1]]));
      if (area) values.area = area;
      if (stat) values.stat = stat;
      if (Object.hasOwn(reviewed.effects, english) ||
        restorationTranslations[locale][english] || wellFedTranslations[locale][english] ||
        spellRankTranslations[locale][english]) {
        throw new Error(`Overlapping item effect translation: ${english}`);
      }
      if (clientSpellMatches.effects[english]?.translations[locale] ||
        clientSpellVariableMatches.effects[english]?.translations[locale]) continue;
      numericTranslations[locale][english] = template.replace(/\{([^}]+)\}/g, (_, key) => values[key]);
    }
  }
}
const targetStatBuff = reviewed.targetStatBuff;
const targetStatPattern = /^Increases the target's (Agility|Strength|Intellect|Spirit|Stamina) by (\d+) for (\d+) min\.$/;
const targetStatMatches = [...occurrences].filter(([english]) => targetStatPattern.test(english));
const targetStatKeys = { Agility: "3", Strength: "4", Intellect: "5",
  Spirit: "6", Stamina: "7" };
const statArticles = {
  deDE: { Agility: "die ", Strength: "die ", Intellect: "die ", Spirit: "die ", Stamina: "die " },
  esES: { Agility: "la ", Strength: "la ", Intellect: "el ", Spirit: "el ", Stamina: "el " },
  esMX: { Agility: "la ", Strength: "la ", Intellect: "el ", Spirit: "el ", Stamina: "el " },
  frFR: { Agility: "l’", Strength: "la ", Intellect: "l’", Spirit: "l’", Stamina: "l’" },
  koKR: { Agility: "", Strength: "", Intellect: "", Spirit: "", Stamina: "" },
  ptBR: { Agility: "a ", Strength: "a ", Intellect: "o ", Spirit: "o ", Stamina: "o " },
  zhCN: { Agility: "", Strength: "", Intellect: "", Spirit: "", Stamina: "" },
  zhTW: { Agility: "", Strength: "", Intellect: "", Spirit: "", Stamina: "" },
};
const nativeStatName = (name, locale) => {
  const key = targetStatKeys[name];
  if (englishApp.database.clientItem.stat[key] !== name) {
    throw new Error(`Invalid stat identity: ${name}`);
  }
  const localizedName = appLocales[locale].database.clientItem.stat[key];
  if (!localizedName || localizedName === name) {
    throw new Error(`${locale}: stat untranslated: ${name}`);
  }
  return statArticles[locale][name] +
    (["esES", "esMX", "ptBR"].includes(locale) ? localizedName.toLocaleLowerCase() : localizedName);
};
if (!targetStatBuff || targetStatMatches.length !== targetStatBuff.uniqueTexts ||
  targetStatMatches.reduce((total, [, count]) => total + count, 0) !==
    targetStatBuff.occurrences ||
  Object.keys(targetStatBuff.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified target stat item effects");
}
const targetStatTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const locale of locales) {
  const template = targetStatBuff.translations[locale];
  if (typeof template !== "string" ||
    (template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      "{amount},{minutes},{stat}") {
    throw new Error(`${locale}: invalid target stat template`);
  }
  for (const [english] of targetStatMatches) {
    const [, name, amount, minutes] = targetStatPattern.exec(english);
    const stat = nativeStatName(name, locale);
    targetStatTranslations[locale][english] = template.replace(/\{([^}]+)\}/g,
      (_, field) => ({ stat, amount, minutes })[field]);
  }
}
const selfStatHour = reviewed.selfStatHour;
const selfStatHourPattern = /^Increases (Agility|Strength|Intellect|Spirit|Stamina) by (\d+) for (\d+) hr\.$/;
const selfStatHourMatches = [...occurrences].filter(([english]) => selfStatHourPattern.test(english));
if (!selfStatHour || selfStatHourMatches.length !== selfStatHour.uniqueTexts ||
  selfStatHourMatches.reduce((total, [, count]) => total + count, 0) !== selfStatHour.occurrences ||
  Object.keys(selfStatHour.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified self stat item effects");
}
const selfStatHourTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const locale of locales) {
  const template = selfStatHour.translations[locale];
  if (typeof template !== "string" ||
    (template.match(/\{[^}]+\}/g) ?? []).sort().join() !== "{amount},{hours},{stat}") {
    throw new Error(`${locale}: invalid self stat template`);
  }
  for (const [english] of selfStatHourMatches) {
    const [, name, amount, hours] = selfStatHourPattern.exec(english);
    const stat = nativeStatName(name, locale);
    if (clientSpellMatches.effects[english]?.translations[locale] ||
      clientSpellVariableMatches.effects[english]?.translations[locale]) continue;
    selfStatHourTranslations[locale][english] = template.replace(/\{([^}]+)\}/g,
      (_, field) => ({ stat, amount, hours })[field]);
  }
}
const crateHeader = reviewed.crateBundle.headerEnglish;
const crateMatches = [...occurrences].filter(([english]) =>
  english.startsWith(crateHeader + "\n"));
const cratePattern = /^- (\d+) (.+)$/;
const crateItemNames = new Set(crateMatches.flatMap(([english]) =>
  english.split("\n").slice(1).map((line) => cratePattern.exec(line)?.[2])));
const itemNameIndexes = new Map();
for (const [index, key] of clientSource.keys.entries()) {
  if (!/^ItemSparse:\d+:4$/.test(key)) continue;
  const name = clientSource.values[index];
  const indexes = itemNameIndexes.get(name) ?? [];
  indexes.push(index);
  itemNameIndexes.set(name, indexes);
}
if (crateMatches.length !== reviewed.crateBundle.uniqueTexts ||
  crateMatches.reduce((total, [, count]) => total + count, 0) !==
    reviewed.crateBundle.occurrences ||
  crateItemNames.has(undefined) || crateItemNames.size !== reviewed.crateBundle.itemNames) {
  throw new Error("Unverified crate bundle item effects");
}
const crateTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const locale of locales) {
  const header = clientSpellResolvedMatches.crateHeader.translations[locale];
  if (typeof header !== "string" || !header || header === crateHeader) {
    throw new Error(`${locale}: invalid client crate instruction`);
  }
  for (const [english] of crateMatches) {
    const lines = english.split("\n").slice(1).map((line) => {
      const [, quantity, name] = cratePattern.exec(line);
      const indexes = itemNameIndexes.get(name) ?? [];
      const localized = new Set(indexes.map((index) =>
        clientLocales[locale].values[index]).filter(Boolean));
      if (localized.size !== 1 || localized.has(name)) {
        throw new Error(`${locale}: ambiguous client crate material: ${name}`);
      }
      return `- ${quantity} × ${[...localized][0]}`;
    });
    const translated = [header, ...lines].join("\n");
    if (numberSignature(translated) !== numberSignature(english)) {
      throw new Error(`${locale}: crate quantities changed: ${english}`);
    }
    crateTranslations[locale][english] = translated;
  }
}
for (const [english, record] of Object.entries(reviewed.effects)) {
  if (occurrences.get(english) !== record.occurrences ||
    Object.keys(record.translations ?? {}).sort().join() !== [...locales].sort().join()) {
    throw new Error(`Unverified item effect identity: ${english}`);
  }
  for (const locale of locales) {
    const translated = record.translations[locale];
    if (typeof translated !== "string" || !translated.trim() ||
      translated === english || tokens(translated) !== tokens(english) ||
      numberSignature(translated) !== numberSignature(english)) {
      throw new Error(`${locale}: invalid item effect translation: ${english}`);
    }
    if (record.clientSpellKey) {
      const index = clientSource.keys.indexOf(record.clientSpellKey);
      const spellName = clientLocales[locale].values[index];
      if (index < 0 || !spellName || !translated.includes(spellName)) {
        throw new Error(`${locale}: item effect lacks native spell name: ${english}`);
      }
    }
  }
}

const essenceConversion = reviewed.essenceConversion;
const essenceFamilies = ["astral", "eternal", "magic", "mystic", "nether"];
if (!essenceConversion || essenceConversion.uniqueTexts !== 10 ||
  essenceConversion.occurrences !== 10 ||
  Object.keys(essenceConversion.itemIds ?? {}).sort().join() !== essenceFamilies.sort().join() ||
  Object.keys(essenceConversion.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified essence conversion item effects");
}
const essenceTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const family of essenceFamilies) {
  const ids = essenceConversion.itemIds[family];
  if (!Array.isArray(ids) || ids.length !== 2) throw new Error(`Invalid ${family} essence IDs`);
  const indexes = ids.map((id) => clientSource.keys.indexOf(`ItemSparse:${id}:4`));
  if (indexes.some((index) => index < 0) ||
    clientSource.values[indexes[0]] !== `Lesser ${family[0].toUpperCase()}${family.slice(1)} Essence` ||
    clientSource.values[indexes[1]] !== `Greater ${family[0].toUpperCase()}${family.slice(1)} Essence`) {
    throw new Error(`Client essence identity changed: ${family}`);
  }
  for (const direction of ["greater", "lesser"]) {
    const english = direction === "greater" ?
      `Turn a greater ${family} essence into three lesser ones.` :
      `Turn three lesser ${family} essences into a greater one.`;
    if (occurrences.get(english) !== 1) throw new Error(`Missing essence effect: ${english}`);
    for (const locale of locales) {
      const template = essenceConversion.translations[locale];
      const fields = (template.match(/\{[^}]+\}/g) ?? []).sort().join();
      if (fields !== ["{from}", "{fromCount}", "{to}", "{toCount}"].sort().join()) {
        throw new Error(`${locale}: invalid essence conversion template`);
      }
      const lesser = clientLocales[locale].values[indexes[0]];
      const greater = clientLocales[locale].values[indexes[1]];
      if (!lesser || !greater || lesser === clientSource.values[indexes[0]] ||
        greater === clientSource.values[indexes[1]]) {
        throw new Error(`${locale}: untranslated ${family} essence name`);
      }
      const values = direction === "greater" ?
        { from: greater, fromCount: "1", to: lesser, toCount: "3" } :
        { from: lesser, fromCount: "3", to: greater, toCount: "1" };
      essenceTranslations[locale][english] = template.replace(/\{([^}]+)\}/g,
        (_, field) => values[field]);
    }
  }
}
const cooldownReduction = reviewed.cooldownReduction;
if (!cooldownReduction || cooldownReduction.uniqueTexts !== 6 ||
  cooldownReduction.occurrences !== 6 ||
  Object.keys(cooldownReduction.spellKeys ?? {}).length !== 6 ||
  Object.keys(cooldownReduction.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified cooldown reduction item effects");
}
const cooldownTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const [english, spellKey] of Object.entries(cooldownReduction.spellKeys)) {
  const index = clientSource.keys.indexOf(spellKey);
  const seconds = /by (\d+(?:\.\d+)?) sec\.$/.exec(english)?.[1];
  if (occurrences.get(english) !== 1 || index < 0 || !seconds ||
    !english.includes(clientSource.values[index])) {
    throw new Error(`Cooldown effect identity changed: ${english}`);
  }
  for (const locale of locales) {
    const template = cooldownReduction.translations[locale];
    const spell = clientLocales[locale].values[index];
    if (!spell || spell === clientSource.values[index] ||
      (template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
        ["{seconds}", "{spell}"].sort().join()) {
      throw new Error(`${locale}: invalid cooldown effect translation: ${english}`);
    }
    if (clientSpellResolvedMatches.effects[english]?.translations[locale] ||
      clientSpellVariableMatches.effects[english]?.translations[locale] ||
      clientSpellMatches.effects[english]?.translations[locale]) continue;
    const localizedSeconds = ["deDE", "esES", "esMX", "frFR", "ptBR"].includes(locale) ?
      seconds.replace(".", ",") : seconds;
    cooldownTranslations[locale][english] = template.replace(/\{([^}]+)\}/g,
      (_, field) => ({ spell, seconds: localizedSeconds })[field]);
  }
}
const mindNumbingPoison = reviewed.mindNumbingPoison;
const mindNumbingPattern = /^Coats a weapon with poison that lasts for (\d+) minutes\.\nEach strike has a (\d+)% chance of poisoning the enemy, increasing their casting time by (\d+)% for (\d+) sec\. (\d+) charges\.$/;
const mindNumbingMatches = catalog.items.flatMap((item) =>
  (item.siteEffects ?? []).filter((effect) => mindNumbingPattern.test(effect.text))
    .map((effect) => [item, effect.text]));
if (!mindNumbingPoison || mindNumbingPoison.uniqueTexts !== 3 ||
  mindNumbingPoison.occurrences !== 3 || mindNumbingMatches.length !== 3 ||
  new Set(mindNumbingMatches.map(([, english]) => english)).size !== 3 ||
  mindNumbingMatches.map(([item]) => Number(item.id)).sort((a, b) => a - b).join() !==
    [...mindNumbingPoison.itemIds].sort((a, b) => a - b).join() ||
  Object.keys(mindNumbingPoison.translations ?? {}).sort().join() !== [...locales].sort().join()) {
  throw new Error("Unverified mind-numbing poison effects");
}
const mindNumbingTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const [item, english] of mindNumbingMatches) {
  if (!item.name.startsWith("Mind-numbing Poison")) {
    throw new Error(`Unexpected mind-numbing poison item: ${item.id}`);
  }
  const [, coatMinutes, chance, slow, duration, charges] = mindNumbingPattern.exec(english);
  for (const locale of locales) {
    const template = mindNumbingPoison.translations[locale];
    if ((template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      ["{coatMinutes}", "{chance}", "{slow}", "{duration}", "{charges}"].sort().join()) {
      throw new Error(`${locale}: invalid mind-numbing poison template`);
    }
    if (clientSpellResolvedMatches.effects[english]?.translations[locale] ||
      clientSpellVariableMatches.effects[english]?.translations[locale] ||
      clientSpellMatches.effects[english]?.translations[locale]) continue;
    const values = { coatMinutes, chance, slow, duration, charges };
    const translated = template.replace(/\{([^}]+)\}/g, (_, field) => values[field]);
    if (numberSignature(translated) !== numberSignature(english)) {
      throw new Error(`${locale}: poison quantities changed: ${english}`);
    }
    mindNumbingTranslations[locale][english] = translated;
  }
}
const abilityModifiers = reviewed.abilityModifiers;
if (!abilityModifiers || abilityModifiers.records?.length !== 2 ||
  new Set(abilityModifiers.records.map((record) => record.english)).size !== 2 ||
  Object.keys(abilityModifiers.translations ?? {}).sort().join() !==
    ["duration", "rageCost"].sort().join()) {
  throw new Error("Unverified ability modifier effects");
}
const abilityModifierTranslations = Object.fromEntries(locales.map((locale) => [locale, {}]));
for (const { english, itemId, spellKey, kind } of abilityModifiers.records) {
  const item = catalog.items.find((entry) => Number(entry.id) === itemId);
  const index = clientSource.keys.indexOf(spellKey);
  const amount = /by (\d+(?:\.\d+)?) (?:sec|mana|rage points)\.$/.exec(english)?.[1];
  const templates = abilityModifiers.translations[kind];
  if (occurrences.get(english) !== 1 || !item?.siteEffects?.some((effect) =>
    effect.text === english) || index < 0 || !english.includes(clientSource.values[index]) ||
    !amount || Object.keys(templates ?? {}).sort().join() !== [...locales].sort().join()) {
    throw new Error(`Ability modifier source changed: ${english}`);
  }
  for (const locale of locales) {
    if (clientSpellResolvedMatches.effects[english]?.translations[locale] ||
      clientSpellVariableMatches.effects[english]?.translations[locale] ||
      clientSpellMatches.effects[english]?.translations[locale]) continue;
    const template = templates[locale];
    const spell = clientLocales[locale].values[index];
    if (!spell || spell === clientSource.values[index] ||
      (template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
        ["{spell}", "{amount}"].sort().join()) {
      throw new Error(`${locale}: invalid ability modifier translation: ${english}`);
    }
    const localizedAmount = ["deDE", "esES", "esMX", "frFR", "ptBR"].includes(locale) ?
      amount.replace(".", ",") : amount;
    const translated = template.replace(/\{([^}]+)\}/g,
      (_, field) => ({ spell, amount: localizedAmount })[field]);
    if (numberSignature(translated) !== numberSignature(english)) {
      throw new Error(`${locale}: ability modifier amount changed: ${english}`);
    }
    abilityModifierTranslations[locale][english] = translated;
  }
}

const mergedTranslations = Object.fromEntries(locales.map((locale) => [locale, {
    ...Object.fromEntries(Object.entries(clientSpellResolvedMatches.effects)
      .filter(([, record]) => record.translations[locale])
      .map(([english, record]) => [english, record.translations[locale]])),
    ...Object.fromEntries(Object.entries(reviewed.effects)
      .map(([english, record]) => [english, record.translations[locale]])),
    ...Object.fromEntries(Object.entries(clientSpellVariableMatches.effects)
      .filter(([, record]) => record.translations[locale])
      .map(([english, record]) => [english, record.translations[locale]])),
    ...Object.fromEntries(Object.entries(clientSpellMatches.effects)
      .filter(([, record]) => record.translations[locale])
      .map(([english, record]) => [english, record.translations[locale]])),
    ...restorationTranslations[locale],
    ...wellFedTranslations[locale],
    ...dualStatWellFedTranslations[locale],
    ...manaWellFedTranslations[locale],
    ...fishingWellFedTranslations[locale],
    ...spellRankTranslations[locale],
    ...numericTranslations[locale],
    ...targetStatTranslations[locale],
    ...selfStatHourTranslations[locale],
    ...crateTranslations[locale],
    ...essenceTranslations[locale],
    ...cooldownTranslations[locale],
    ...abilityModifierTranslations[locale],
    ...mindNumbingTranslations[locale],
  }]));
for (const translations of Object.values(mergedTranslations)) {
  for (const english of Object.keys(reviewed.invariantEffects ?? {})) {
    translations[english] ??= english;
  }
}
const cardDeckCompletion = reviewed.cardDeckCompletion;
const deckRanks = ["Ace", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];
if (!cardDeckCompletion || cardDeckCompletion.uniqueTexts !== 8 ||
  cardDeckCompletion.occurrences !== 64 ||
  Object.keys(cardDeckCompletion.sets ?? {}).length !== 8 ||
  Object.keys(cardDeckCompletion.translations ?? {}).sort().join() !== "koKR,zhTW") {
  throw new Error("Unverified card deck effects");
}
for (const [set, ids] of Object.entries(cardDeckCompletion.sets)) {
  const english = `Combine the Ace through Eight of ${set} to complete the set.`;
  const names = catalog.items.filter((item) => item.siteEffects?.some((effect) =>
    effect.text === english)).map((item) => item.name).sort();
  if (occurrences.get(english) !== 8 || !Array.isArray(ids) || ids.length !== 3 ||
    names.join() !== deckRanks.map((rank) => `${rank} of ${set}`).sort().join()) {
    throw new Error(`Card deck source changed: ${set}`);
  }
  const indexes = ids.map((id) => clientSource.keys.indexOf(`ItemSparse:${id}:4`));
  if (indexes.some((index) => index < 0) ||
    clientSource.values[indexes[0]] !== `Ace of ${set}` ||
    clientSource.values[indexes[1]] !== `Eight of ${set}` ||
    clientSource.values[indexes[2]] !== `${set} Deck`) {
    throw new Error(`Client card deck identity changed: ${set}`);
  }
  for (const locale of ["koKR", "zhTW"]) {
    if (mergedTranslations[locale][english]) continue;
    const template = cardDeckCompletion.translations[locale];
    if ((template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      ["{ace}", "{eight}", "{deck}"].sort().join()) {
      throw new Error(`${locale}: invalid card deck template`);
    }
    const localized = indexes.map((index) => clientLocales[locale].values[index]);
    if (localized.some((name, index) => !name || name === clientSource.values[indexes[index]])) {
      throw new Error(`${locale}: untranslated card deck item: ${set}`);
    }
    const values = { ace: localized[0], eight: localized[1], deck: localized[2] };
    mergedTranslations[locale][english] = template.replace(/\{([^}]+)\}/g,
      (_, field) => values[field]);
  }
}
const giftCollection = reviewed.giftCollection;
if (!giftCollection || giftCollection.uniqueTexts !== 8 ||
  giftCollection.occurrences !== 24 || giftCollection.combinations?.length !== 8 ||
  new Set(giftCollection.combinations.map((record) => record.english)).size !== 8 ||
  Object.keys(giftCollection.translations ?? {}).sort().join() !== "zhCN,zhTW") {
  throw new Error("Unverified gift collection effects");
}
for (const record of giftCollection.combinations) {
  if (occurrences.get(record.english) !== 3 || record.parts?.length !== 3 ||
    !record.parts.every((id) => catalog.items.some((item) =>
      Number(item.id) === id && item.siteEffects?.some((effect) =>
        effect.text === record.english))) ||
    !catalog.items.some((item) => Number(item.id) === record.result)) {
    throw new Error(`Gift collection item identity changed: ${record.english}`);
  }
  const indexes = [...record.parts, record.result].map((id) =>
    clientSource.keys.indexOf(`ItemSparse:${id}:4`));
  if (indexes.some((index) => index < 0)) {
    throw new Error(`Missing native gift collection item: ${record.english}`);
  }
  for (const locale of ["zhCN", "zhTW"]) {
    if (mergedTranslations[locale][record.english]) continue;
    const template = giftCollection.translations[locale];
    if ((template.match(/\{[^}]+\}/g) ?? []).sort().join() !==
      ["{item1}", "{item2}", "{item3}", "{result}"].sort().join()) {
      throw new Error(`${locale}: invalid gift collection template`);
    }
    const names = indexes.map((index) => clientLocales[locale].values[index]);
    if (names.some((name, index) => !name || name === clientSource.values[indexes[index]])) {
      throw new Error(`${locale}: untranslated gift collection item: ${record.english}`);
    }
    const values = { item1: names[0], item2: names[1], item3: names[2], result: names[3] };
    mergedTranslations[locale][record.english] = template.replace(/\{([^}]+)\}/g,
      (_, field) => values[field]);
  }
}
for (const [english, record] of Object.entries(reviewed.partialEffects ?? {})) {
  const translatedLocales = Object.keys(record.translations ?? {});
  const numericEnglish = record.numericShorthand === "2H"
    ? english.replace(/\b2H\b/, "")
    : record.numericShorthand === "II" ? english.replace(/\bII\b/, "2")
    : record.numericShorthand === "Third" ? english.replace(/\bThird\b/, "3") : english;
  if (occurrences.get(english) !== record.occurrences || !translatedLocales.length ||
    translatedLocales.some((locale) => !locales.includes(locale)) ||
    !Array.isArray(record.itemIds) || record.itemIds.length !== record.occurrences ||
    !record.itemIds.every((id) => catalog.items.some((item) =>
      Number(item.id) === id && item.siteEffects?.some((effect) => effect.text === english))) ||
    (record.clientSpellKeys !== undefined && !Array.isArray(record.clientSpellKeys)) ||
    (record.numericShorthand !== undefined &&
      (!["2H", "II", "Third"].includes(record.numericShorthand) ||
        numericEnglish === english))) {
    throw new Error(`Unverified partial item effect: ${english}`);
  }
  for (const locale of translatedLocales) {
    const translated = record.translations[locale];
    if (!translated || translated === english || tokens(translated) !== tokens(english) ||
      numberSignature(translated) !== numberSignature(numericEnglish)) {
      throw new Error(`${locale}: invalid partial item effect: ${english}`);
    }
    for (const spellKey of record.clientSpellKeys ?? []) {
      const index = clientSource.keys.indexOf(spellKey);
      if (index < 0 || !english.includes(clientSource.values[index]) ||
        !clientLocales[locale].values[index] ||
        !translated.includes(clientLocales[locale].values[index])) {
        throw new Error(`${locale}: missing native spell name in partial effect: ${english}`);
      }
    }
    mergedTranslations[locale][english] ??= translated;
  }
}
const englishLetters = (value) => value.toLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, "");
for (const [english, record] of Object.entries(reviewed.nativeTextCorrections ?? {})) {
  if (occurrences.get(english) !== record.occurrences ||
    !Array.isArray(record.itemIds) || record.itemIds.length !== record.occurrences ||
    !record.itemIds.every((id) => catalog.items.some((item) =>
      Number(item.id) === id && item.siteEffects?.some((effect) => effect.text === english)))) {
    throw new Error(`Unverified English client item effect: ${english}`);
  }
  for (const [locale, translated] of Object.entries(record.translations ?? {})) {
    const current = mergedTranslations[locale]?.[english];
    if (!current || !englishLetters(current).includes(englishLetters(english)) ||
      !translated || englishLetters(translated).includes(englishLetters(english)) ||
      tokens(translated) !== tokens(english) ||
      numberSignature(translated) !== numberSignature(english)) {
      throw new Error(`${locale}: client effect is not an English fallback: ${english}`);
    }
    mergedTranslations[locale][english] = translated;
  }
}
// Both Spanish regions share reviewed Spanish text when a region has no translation.
// Keep every translation already supplied for the target region.
for (const [target, source] of [["esES", "esMX"], ["esMX", "esES"]]) {
  for (const [english, translated] of Object.entries(mergedTranslations[source])) {
    mergedTranslations[target][english] ??= translated;
  }
}
const wowheadEffects = new Map();
const conflictedWowheadEffects = new Set();
for (const item of wowhead.candidates) for (const effect of item.effects) {
  if (!effect.sourceMatches || !occurrences.has(effect.source)) continue;
  for (const [locale, translation] of Object.entries(effect.translations)) {
    if (!locales.includes(locale) || numbers(translation) !== numbers(effect.source)) continue;
    const key = `${locale}:${effect.source}`;
    if (wowheadEffects.has(key) && wowheadEffects.get(key) !== translation) {
      conflictedWowheadEffects.add(key);
    } else wowheadEffects.set(key, translation);
  }
}
for (const [key, translation] of wowheadEffects) {
  if (conflictedWowheadEffects.has(key)) continue;
  const separator = key.indexOf(":");
  const locale = key.slice(0, separator);
  const english = key.slice(separator + 1);
  mergedTranslations[locale][english] = translation;
}
for (const english of Object.keys(reviewed.partialEffects ?? {})) {
  if (locales.some((locale) => !mergedTranslations[locale][english])) {
    throw new Error(`Partial item effect is still untranslated: ${english}`);
  }
}
for (const locale of locales) {
  const path = join(root, `public/data/locales/wow-forever/item-effects-${locale}.json`);
  const translations = Object.fromEntries(Object.entries(mergedTranslations[locale])
    .filter(([english]) => occurrences.has(english)));
  const output = JSON.stringify({ version: 1, translations }) + "\n";
  if (check) {
    if (output !== await readFile(path, "utf8")) {
      throw new Error(`${locale}: reviewed item effect pack is stale`);
    }
  } else await writeFile(path, output);
  console.log(`${locale}: ${Object.keys(translations).length} reviewed item effects`);
}
