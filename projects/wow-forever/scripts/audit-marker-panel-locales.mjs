/** Count unresolved ID-backed names and quest prose shown inside map marker panels. */
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasConflictingQuestObjectiveNumbers } from "./lib/quest-objective-numbers.mjs";
import { isRejectedNumericProse } from "./lib/rejected-numeric-prose.mjs";
import { isRejectedSemanticProse } from "./lib/rejected-semantic-prose.mjs";
import { isEnglishQuestProseFallback, stripWowheadQuestChrome } from "./lib/wowhead-quest-prose-page.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const localeDir = "public/data/locales/wow-forever";
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const appLocales = { deDE: "de", esES: "es", esMX: "es-MX", frFR: "fr",
  koKR: "ko", ptBR: "pt-BR", zhCN: "zh-Hans", zhTW: "zh-Hant" };
const flatten = (value, prefix = "", output = {}) => {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") output[path] = child;
    else if (child && typeof child === "object") flatten(child, path, output);
  }
  return output;
};
const appSource = flatten(await read("src/i18n/locales/en.json"));
const panelUiKeys = Object.keys(appSource).filter((key) =>
  key.startsWith("map.") || key.startsWith("reference."));
const gameSource = await read(`${localeDir}/source.json`);
const mapSource = await read(`${localeDir}/map-entity-source.json`);
const questSource = await read(`${localeDir}/quest-text-source.json`);
const questFallbacks = await read(`${localeDir}/quest-text-app-fallbacks.json`);
const mapFallbacks = await read(`${localeDir}/map-entity-app-fallbacks.json`);
const sharedProse = await read(`${localeDir}/quest-prose-wowhead.json`);
const quests = (await read("public/data/quests/quest-details.json")).quests;
const explainGaps = process.argv.includes("--reasons");
const captureEvidence = new Map();
if (explainGaps) {
  const captures = await readFile(join(root,
    "data/site-research/wowhead-quest-prose-captures.jsonl"), "utf8");
  for (const line of captures.split(/\r?\n/).filter(Boolean)) {
    const record = JSON.parse(line);
    const key = `${record.id}:${record.locale}`;
    const evidence = captureEvidence.get(key) ?? { source: new Set(), target: new Set(),
      targetTexts: new Map(),
      mismatch: false };
    if (record.status === "source-mismatch") evidence.mismatch = true;
    for (const field of Object.keys(record.english ?? {})) evidence.source.add(field);
    for (const [field, value] of Object.entries(record.translated ?? {})) {
      const cleaned = stripWowheadQuestChrome(value).trim();
      if (isEnglishQuestProseFallback(cleaned, record.english?.[field])) continue;
      evidence.target.add(field);
      evidence.targetTexts.set(field, cleaned);
    }
    captureEvidence.set(key, evidence);
  }
}
const gameIndexes = new Map(gameSource.keys.map((key, index) => [key, index]));
const mapIndexes = new Map(mapSource.keys.map((key, index) => [key, index]));
const questIndexes = new Map(questSource.keys.map((key, index) => [key, index]));
const offers = new Map();
const names = new Map();
let rawDescriptions = 0;
for (const file of await readdir(join(root, "public/maps/world-atlas"))) {
  if (!file.endsWith(".json")) continue;
  const map = await read(`public/maps/world-atlas/${file}`);
  for (const point of map.locations ?? []) {
    if (point.description && !point.descriptionKey) rawDescriptions++;
    for (const offer of point.questOffers ?? []) {
      offers.set(offer.id, quests[offer.id]?.title ?? offer.name.replace(/ \([^()]*\)$/, ""));
      for (const item of [offer.objectiveItem, ...(offer.objectiveItems ?? [])]) {
        if (item) names.set(`ItemSparse:${item.id}:4`, item.name);
      }
      for (const currency of offer.currencyRewards ?? []) names.set(`CurrencyTypes:${currency.id}:0`, currency.name);
    }
    for (const ability of point.petAbilities ?? []) names.set(`SpellName:${ability.id}:0`, ability.name);
    for (const creature of point.droppedBy ?? []) names.set(`Creature:${creature.id}:0`, creature.name);
  }
}
const fields = ["description", "objective", "progressText", "completionText"];
const assertNoEnglishFallbacks = (pack, locale, name) => {
  for (const [id, quest] of Object.entries(pack.quests ?? {})) {
    for (const [field, value] of Object.entries(quest.locales?.[locale] ?? {})) {
      if (isEnglishQuestProseFallback(value, quest.english?.[field])) {
        throw new Error(`${name}: ${locale} quest ${id} ${field} contains English source fallback`);
      }
    }
  }
};
for (const locale of locales) {
  const app = flatten(await read(`src/i18n/locales/${appLocales[locale]}.json`));
  const uiGaps = panelUiKeys.filter((key) => !Object.hasOwn(app, key));
  const [game, map, offerPack, creaturePack, questText, prose, objectives] = await Promise.all([
    read(`${localeDir}/${locale}.json`), read(`${localeDir}/map-entity-${locale}.json`),
    read(`${localeDir}/quest-offer-${locale}.json`), read(`${localeDir}/marker-creature-${locale}.json`),
    read(`${localeDir}/quest-text-${locale}.json`),
    read(`${localeDir}/quest-prose-wowhead-${locale}.json`),
    read(`${localeDir}/quest-objective-wowhead-${locale}.json`),
  ]);
  assertNoEnglishFallbacks(prose, locale, "Wowhead prose");
  assertNoEnglishFallbacks(objectives, locale, "Wowhead objectives");
  for (const [index, value] of questText.values.entries()) {
    if (typeof value === "string" && /^\[[\s\S]*\]$/.test(value.trim()) &&
      isEnglishQuestProseFallback(value, questSource.values[index])) {
      throw new Error(`Client quest text: ${locale} ${questSource.keys[index]} contains English source fallback`);
    }
  }
  const resolve = (key, english) => {
    const gameIndex = gameIndexes.get(key);
    if (gameIndex !== undefined && gameSource.values[gameIndex] === english && game.values[gameIndex]) return true;
    const mapIndex = mapIndexes.get(key);
    if (mapIndex !== undefined && mapSource.values[mapIndex] === english &&
      (map.values[mapIndex] || mapFallbacks.locales[locale][key])) return true;
    const id = /^Quest:(\d+):0$/.exec(key)?.[1];
    if (id && offerPack.quests[id]?.english === english && offerPack.quests[id]?.name) return true;
    const creatureId = /^Creature:(\d+):0$/.exec(key)?.[1];
    return Boolean(creatureId && creaturePack.creatures[creatureId]?.english === english &&
      creaturePack.creatures[creatureId]?.name);
  };
  const offerGaps = [...offers].filter(([id, name]) => !resolve(`Quest:${id}:0`, name));
  const nameGaps = [...names].filter(([key, name]) => !resolve(key, name));
  const proseGaps = [];
  const regionalProse = Object.values(prose.quests).reduce((count, entry) =>
    count + Object.keys(entry.regionalFallbackFields ?? {}).length, 0);
  const proseGapReasons = {};
  const proseGapDetails = [];
  for (const [id, quest] of Object.entries(quests)) for (const field of fields) {
    const english = quest[field];
    if (typeof english !== "string" || !english.trim()) continue;
    const key = `${id}:${field}`;
    const index = questIndexes.get(key);
    const clientValue = index !== undefined && questSource.values[index] === english &&
      (questText.values[index] || questFallbacks.locales[locale][key]);
    const client = clientValue && !isEnglishQuestProseFallback(clientValue, english) &&
      (field !== "objective" ||
      !hasConflictingQuestObjectiveNumbers(english, clientValue));
    const fromPack = (pack) => pack.quests[id]?.english?.[field] === english &&
      pack.quests[id]?.locales?.[locale]?.[field] &&
      !isEnglishQuestProseFallback(pack.quests[id].locales[locale][field], english);
    if (!client && !fromPack(sharedProse) && !fromPack(prose) && !fromPack(objectives)) {
      proseGaps.push(key);
      if (explainGaps) {
        const evidence = captureEvidence.get(`${id}:${locale}`);
        const reason = evidence?.target.has(field) &&
          isRejectedSemanticProse(id, locale, field, english,
            evidence.targetTexts.get(field)) ? "rejected-semantic-source" :
          evidence?.target.has(field) && isRejectedNumericProse(id, locale, field, english,
            evidence.targetTexts.get(field)) ? "rejected-numeric-source" :
          evidence?.target.has(field) ? "captured-not-applied" :
          evidence?.source.has(field) ? "localized-field-not-captured" :
            evidence?.mismatch ? "source-mismatch" :
              evidence ? "english-field-unmatched" : "no-capture";
        proseGapReasons[reason] = (proseGapReasons[reason] ?? 0) + 1;
        if (process.argv.includes("--gap-details")) proseGapDetails.push({ key, reason });
      }
    }
  }
  console.log(`${locale}: panel UI keys ${panelUiKeys.length - uiGaps.length}/${panelUiKeys.length}; ` +
    `quest offers ${offers.size - offerGaps.length}/${offers.size}; ` +
    `nested item/currency/spell/creature names ${names.size - nameGaps.length}/${names.size}; ` +
    `quest prose ${Object.values(quests).reduce((count, quest) => count + fields.filter((field) => quest[field]?.trim()).length, 0) - proseGaps.length} covered, ${proseGaps.length} missing, ${regionalProse} regional Spanish fallbacks; ` +
    `raw marker descriptions ${rawDescriptions}`);
  if (uiGaps.length) console.log(`  UI gaps: ${uiGaps.slice(0, 8).join(", ")}`);
  if (offerGaps.length) console.log(`  offer gaps: ${offerGaps.slice(0, 8).map(([id]) => id).join(", ")}`);
  if (nameGaps.length) console.log(`  name gaps: ${nameGaps.slice(0, 8).map(([key]) => key).join(", ")}`);
  console.log(`  prose gaps by field: ${fields.map((field) =>
    `${field}=${proseGaps.filter((key) => key.endsWith(`:${field}`)).length}`).join(" ")}`);
  if (explainGaps) console.log(`  prose gap reasons: ${Object.entries(proseGapReasons)
    .map(([reason, count]) => `${reason}=${count}`).join(" ")}`);
  if (process.argv.includes("--gap-details")) console.log(`  prose gap details: ${JSON.stringify(
    proseGapDetails.filter(({ reason }) => reason !== "localized-field-not-captured"))}`);
  if (process.argv.includes("--sample-objectives") && locale === "koKR") {
    console.log(`  objective samples: ${proseGaps.filter((key) => key.endsWith(":objective"))
      .slice(0, 12).join(", ")}`);
  }
}
