/** Build per-locale quest prose packs from ID and English-source-matched Wowhead captures. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasConflictingQuestObjectiveNumbers } from "./lib/quest-objective-numbers.mjs";
import { isRejectedNumericProse } from "./lib/rejected-numeric-prose.mjs";
import { isRejectedSemanticProse } from "./lib/rejected-semantic-prose.mjs";
import { isEnglishQuestProseFallback, stripWowheadQuestChrome } from "./lib/wowhead-quest-prose-page.mjs";
import { applySpanishRegionalQuestFallbacks } from "./lib/regional-quest-fallbacks.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = "public/data/locales/wow-forever";
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const catalog = (await read("public/data/quests/quest-details.json")).quests;
const manual = await read(`${directory}/quest-prose-wowhead.json`);
const reviewedItemObjectives = await read(
  "data/quest-text-localization/reviewed-item-objective-reuse.json");
const codes = { deDE: "de", esES: "es", esMX: "mx", frFR: "fr", koKR: "ko",
  ptBR: "pt", zhCN: "cn", zhTW: "tw" };
const fields = new Set(["description", "objective", "progressText", "completionText"]);
const reusableFields = ["description", "progressText", "completionText", "objective"];
const questTextSource = await read(`${directory}/quest-text-source.json`);
const questTextIndex = new Map(questTextSource.keys.map((key, index) => [key, index]));
const appFallbacks = (await read(`${directory}/quest-text-app-fallbacks.json`)).locales;
const clientPacks = Object.fromEntries(await Promise.all(Object.keys(codes).map(async (locale) =>
  [locale, await read(`${directory}/quest-text-${locale}.json`)])));
const objectivePacks = Object.fromEntries(await Promise.all(Object.keys(codes).map(async (locale) =>
  [locale, await read(`${directory}/quest-objective-wowhead-${locale}.json`)])));
const numericValues = (value) => new Set((value.normalize("NFKC")
  .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
const objectiveNumbersMatch = (source, localized) =>
  !hasConflictingQuestObjectiveNumbers(source, localized) &&
  [...numericValues(source)].every((number) => numericValues(localized).has(number));
const hasExistingObjective = (id, locale, english, translated) => {
  const fromWowhead = objectivePacks[locale].quests[id];
  if (fromWowhead?.english?.objective === english &&
    fromWowhead.locales?.[locale]?.objective &&
    !isEnglishQuestProseFallback(fromWowhead.locales[locale].objective, english)) return true;
  const key = `${id}:objective`;
  const index = questTextIndex.get(key);
  if (index === undefined || questTextSource.values[index] !== english) return false;
  const localized = clientPacks[locale].values[index] || appFallbacks[locale]?.[key];
  return Boolean(localized && !isEnglishQuestProseFallback(localized, english) &&
    localized === translated &&
    objectiveNumbersMatch(english, localized));
};
const hasLocalizedObjective = (id, locale, english) => {
  const fromWowhead = objectivePacks[locale].quests[id];
  if (fromWowhead?.english?.objective === english &&
    fromWowhead.locales?.[locale]?.objective &&
    !isEnglishQuestProseFallback(fromWowhead.locales[locale].objective, english)) return true;
  const key = `${id}:objective`;
  const index = questTextIndex.get(key);
  if (index === undefined || questTextSource.values[index] !== english) return false;
  const localized = clientPacks[locale].values[index] || appFallbacks[locale]?.[key];
  return Boolean(localized && !isEnglishQuestProseFallback(localized, english));
};
const packs = Object.fromEntries(Object.keys(codes).map((locale) =>
  [locale, { version: 1, quests: {} }]));
const input = await readFile(join(root, "data/site-research/wowhead-quest-prose-captures.jsonl"), "utf8");
const seen = new Set();
const localizedBySource = Object.fromEntries(Object.keys(codes).map((locale) =>
  [locale, new Map()]));
const localizedByExactText = Object.fromEntries(Object.keys(codes).map((locale) =>
  [locale, new Map()]));
let added = 0;
for (const line of input.split(/\r?\n/).filter(Boolean)) {
  const record = JSON.parse(line);
  const { id, locale, sourceUrl, localeUrl, english, translated } = record;
  if (record.status !== "captured" || !translated || !Object.keys(translated).length) continue;
  const key = `${id}:${locale}`;
  if (!catalog[id] || !codes[locale] ||
    (seen.has(key) && !record.sourceRetryAttempted && !record.targetRetryAttempted) ||
    sourceUrl !== `https://www.wowhead.com/forever/quest=${id}` ||
    localeUrl !== `https://www.wowhead.com/forever/${codes[locale]}/quest=${id}`) {
    throw new Error(`Invalid Wowhead quest capture: ${key}`);
  }
  seen.add(key);
  const englishFields = {};
  const localizedFields = {};
  for (const [field, captured] of Object.entries(translated)) {
    const value = typeof captured === "string" ?
      stripWowheadQuestChrome(captured).trim() : captured;
    if (!fields.has(field) || !english[field] || english[field] !== catalog[id][field] ||
      typeof value !== "string" || !value.trim() || value === english[field] ||
      /\$[A-Za-z]/.test(value) || value.length > 30_000 ||
      (field === "objective" && !objectiveNumbersMatch(english[field], value))) {
      throw new Error(`Invalid Wowhead quest text: ${key}/${field}`);
    }
    if (isEnglishQuestProseFallback(value, english[field]) ||
      isRejectedSemanticProse(id, locale, field, english[field], value) ||
      isRejectedNumericProse(id, locale, field, english[field], value) ||
      manual.quests[id]?.locales[locale]?.[field] ||
      (field === "objective" && hasExistingObjective(id, locale, english[field], value))) continue;
    englishFields[field] = english[field];
    localizedFields[field] = value;
    added++;
  }
  if (Object.keys(localizedFields).length) {
    const entry = packs[locale].quests[id] ?? { sourceUrl,
      localeUrls: { [locale]: localeUrl }, english: {}, locales: { [locale]: {} } };
    for (const [field, value] of Object.entries(localizedFields)) {
      if ((entry.english[field] && entry.english[field] !== englishFields[field]) ||
        (entry.locales[locale][field] && entry.locales[locale][field] !== value)) {
        throw new Error(`Conflicting Wowhead quest capture: ${key}/${field}`);
      }
      entry.english[field] = englishFields[field];
      entry.locales[locale][field] = value;
    }
    packs[locale].quests[id] = entry;
    for (const [field, value] of Object.entries(localizedFields)) {
      if (field === "objective") continue;
      const signature = `${field}\0${catalog[id].title}\0${englishFields[field]}`;
      const candidates = localizedBySource[locale].get(signature) ?? [];
      candidates.push({ id, localeUrl, value });
      localizedBySource[locale].set(signature, candidates);
      const exactSignature = `${field}\0${englishFields[field]}`;
      const exactCandidates = localizedByExactText[locale].get(exactSignature) ?? [];
      exactCandidates.push({ id, localeUrl, value });
      localizedByExactText[locale].set(exactSignature, exactCandidates);
    }
  }
}
let reused = 0;
let exactTextReused = 0;
let directEntryFieldsReused = 0;
for (const [locale, objectivePack] of Object.entries(objectivePacks)) {
  for (const [id, entry] of Object.entries(objectivePack.quests)) {
    const english = entry.english?.objective;
    const value = entry.locales?.[locale]?.objective;
    if (!english || english !== catalog[id]?.objective || !value ||
      entry.sourceUrl !== `https://www.wowhead.com/forever/quest=${id}` ||
      entry.localeUrls?.[locale] !==
        `https://www.wowhead.com/forever/${codes[locale]}/quest=${id}` ||
      isEnglishQuestProseFallback(value, english) ||
      !objectiveNumbersMatch(english, value)) continue;
    const candidate = { id, localeUrl: entry.localeUrls?.[locale], value };
    if (!candidate.localeUrl) continue;
    const sourceKey = `objective\0${catalog[id].title}\0${english}`;
    const sourceCandidates = localizedBySource[locale].get(sourceKey) ?? [];
    sourceCandidates.push(candidate);
    localizedBySource[locale].set(sourceKey, sourceCandidates);
    const exactKey = `objective\0${english}`;
    const exactCandidates = localizedByExactText[locale].get(exactKey) ?? [];
    exactCandidates.push(candidate);
    localizedByExactText[locale].set(exactKey, exactCandidates);
  }
}
const writeLocalePack = async (path, serialized) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      await writeFile(path, serialized);
      return;
    } catch (error) {
      if (!["UNKNOWN", "EBUSY", "EPERM", "EACCES"].includes(error.code) || attempt === 19) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 250 * Math.min(attempt + 1, 8)));
    }
  }
};
for (const [locale, pack] of Object.entries(packs)) {
  for (const [id, quest] of Object.entries(catalog)) {
    for (const field of reusableFields) {
      const english = quest[field];
      if (!english || manual.quests[id]?.locales[locale]?.[field] ||
        (field === "objective" && hasLocalizedObjective(id, locale, english)) ||
        pack.quests[id]?.locales[locale]?.[field]) continue;
      const sameTitle = localizedBySource[locale].get(
        `${field}\0${quest.title}\0${english}`);
      const candidates = sameTitle?.length ? sameTitle :
        localizedByExactText[locale].get(`${field}\0${english}`);
      if (!candidates?.length || new Set(candidates.map((candidate) => candidate.value)).size !== 1) {
        continue;
      }
      const source = candidates.find((candidate) =>
        candidate.id === pack.quests[id]?.reusedFromQuestId) ?? candidates[0];
      // The installed client only accepts objective reuse when every field in
      // the entry comes from the same donor quest.
      if (field === "objective" && pack.quests[id] &&
        pack.quests[id].reusedFromQuestId !== source.id) continue;
      const entry = pack.quests[id] ?? {
        reusedFromQuestId: source.id,
        sourceUrl: `https://www.wowhead.com/forever/quest=${id}`,
        localeUrls: { [locale]: source.localeUrl }, english: {}, locales: { [locale]: {} },
      };
      if (entry.reusedFromQuestId && entry.reusedFromQuestId !== source.id) {
        const firstId = entry.reusedFromQuestId;
        const firstUrl = entry.localeUrls[locale];
        entry.reusedFieldSources = Object.fromEntries(Object.keys(entry.english)
          .map((existingField) => [existingField, { questId: firstId, localeUrl: firstUrl }]));
        delete entry.reusedFromQuestId;
        entry.localeUrls[locale] = `https://www.wowhead.com/forever/${codes[locale]}/quest=${id}`;
      }
      if (!entry.reusedFromQuestId) {
        (entry.reusedFieldSources ??= {})[field] = {
          questId: source.id, localeUrl: source.localeUrl,
        };
        directEntryFieldsReused++;
      }
      entry.english[field] = english;
      entry.locales[locale][field] = source.value;
      pack.quests[id] = entry;
      if (entry.reusedFromQuestId) {
        if (sameTitle?.length) reused++;
        else exactTextReused++;
      }
    }
  }
}
for (const [locale, pack] of Object.entries(packs)) {
  if (reviewedItemObjectives.version !== 1 ||
    !Array.isArray(reviewedItemObjectives.quests)) {
    throw new Error("Invalid reviewed item objectives");
  }
  const gameSource = await read(`${directory}/source.json`);
  const gameLocale = await read(`${directory}/${locale}.json`);
  for (const rule of reviewedItemObjectives.quests) {
    const itemKey = `ItemSparse:${rule.itemId}:4`;
    const itemIndex = gameSource.keys.indexOf(itemKey);
    if (!/^\d+$/.test(rule.id) || !/^\d+$/.test(rule.itemId) ||
      !Number.isInteger(rule.count) || rule.count < 1 ||
      rule.itemUrl !== `https://www.wowhead.com/forever/item=${rule.itemId}` ||
      catalog[rule.id]?.objective !== rule.englishObjective ||
      rule.englishObjective !== `${rule.englishItem} (${rule.count})` ||
      itemIndex < 0 || gameSource.values[itemIndex] !== rule.englishItem ||
      gameLocale.values.length !== gameSource.keys.length) {
      throw new Error(`Invalid reviewed item objective: ${rule.id}/${locale}`);
    }
    const itemName = gameLocale.values[itemIndex];
    if (typeof itemName !== "string" || !itemName.trim() ||
      itemName === rule.englishItem) {
      throw new Error(`Missing localized reviewed item: ${rule.itemId}/${locale}`);
    }
    if (manual.quests[rule.id]?.locales?.[locale]?.objective ||
      pack.quests[rule.id]?.locales?.[locale]?.objective) continue;
    const sourceUrl = `https://www.wowhead.com/forever/quest=${rule.id}`;
    const localeUrl = `https://www.wowhead.com/forever/${codes[locale]}/quest=${rule.id}`;
    const entry = pack.quests[rule.id] ?? {
      sourceUrl, localeUrls: { [locale]: localeUrl }, english: {},
      locales: { [locale]: {} },
    };
    if (entry.reusedFromQuestId || entry.english.objective) {
      throw new Error(`Conflicting reviewed item objective: ${rule.id}/${locale}`);
    }
    entry.english.objective = rule.englishObjective;
    entry.locales[locale].objective = `${itemName} (${rule.count})`;
    entry.derivedFromItemId = rule.itemId;
    pack.quests[rule.id] = entry;
  }
  if (locale === "esMX") {
    const regional = applySpanishRegionalQuestFallbacks({ packs, objectivePacks,
      manual, catalog, clientPacks, appFallbacks, questTextIndex, questTextSource });
    console.log(`esMX: ${regional} direct Wowhead esES regional fallback fields`);
  }
  const path = join(root, directory, `quest-prose-wowhead-${locale}.json`);
  const serialized = JSON.stringify(pack);
  const existing = await readFile(path, "utf8");
  if (process.argv.includes("--check")) {
    if (existing !== serialized) throw new Error(`${locale} pack is stale`);
  } else if (existing !== serialized) await writeLocalePack(path, serialized);
  console.log(`${locale}: ${Object.keys(pack.quests).length} quest IDs`);
}
console.log(`${added} direct, ${reused} same-title, ${exactTextReused} cross-title and ` +
  `${directEntryFieldsReused} direct-entry exact-text reused Wowhead fields`);
