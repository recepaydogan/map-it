/** Report untranslated app keys and missing client records without treating fallback as coverage. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasConflictingQuestObjectiveNumbers } from "./lib/quest-objective-numbers.mjs";
import { isEnglishQuestProseFallback } from "./lib/wowhead-quest-prose-page.mjs";
import { mergeReviewedEntityNames } from "./lib/merge-reviewed-entity-names.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const flatten = (node, prefix = "", values = new Map()) => {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") values.set(path, value);
    else if (value && typeof value === "object") flatten(value, path, values);
  }
  return values;
};
const source = await read("src/i18n/locales/en.json");
const sourceFields = flatten(source);
const placeholderSignature = (value) =>
  (value.match(/\{\{[^}]+\}\}/g) ?? []).sort().join("|");
const invariantNpcNames = await read("data/npc-name-localization/invariant-proper-names.json");
const invariantMultiwordNames = await read("data/npc-name-localization/invariant-multiword-names.json");
const invariantNpcQuestTitles = await read("data/quest-title-localization/invariant-npc-quest-titles.json");
const reviewedClientCompoundTitles = await read(
  "data/quest-title-localization/reviewed-client-compound-titles.json");
const reviewedQuestTextTitles = await read("data/quest-marker-localization/reviewed-quest-text-titles.json");
const partialQuestTitles = await read("data/quest-title-localization/authored-partial-quest-titles.json");
const invariantPartialQuestTitles = new Map(Object.values(partialQuestTitles).flatMap((record) =>
  record.markerIds.map((id) => [`map.questMarkers.${id}.name`, record])));
const reviewedQuestTextTitleByPath = new Map(Object.entries(reviewedQuestTextTitles)
  .flatMap(([name, record]) => record.markerIds.map((id) =>
    [`map.questMarkers.${id}.name`, { name, languages: record.invariantLanguages }])));
const reviewedClientNpcNames = await read("data/npc-name-localization/reviewed-client-evidence.json");
const reviewedForeverTrainers = await read("data/npc-name-localization/reviewed-forever-trainer-names.json");
const reviewedEntityNames = mergeReviewedEntityNames(
  await read("data/quest-marker-localization/reviewed-entity-names.json"),
  await read("data/quest-marker-localization/reviewed-classic-npc-gaps.json"),
  await read("data/quest-marker-localization/reviewed-partial-entity-names.json"),
  await read("data/quest-marker-localization/reviewed-client-compound-names.json"));
const authoredWesternNpcNames = (await read(
  "data/npc-name-localization/authored-western-map-fallbacks.json")).names;
const reviewedMapOnlyNames = (await read(
  "data/npc-name-localization/reviewed-map-only-names.json")).names;
const mexicanSpanishFallback = await read("data/app-localization/esmx-regional-map-fallback.json");
const gameSource = await read("public/data/locales/wow-forever/source.json");
const classCatalog = await read("public/data/classes/catalog.json");
const classCatalogProseFields = classCatalog.classes.flatMap((entry) => [
  ...entry.trees.flatMap((tree) => tree.new.flatMap((talent) =>
    talent.description ? [{ path: `${entry.id}/${tree.name}/${talent.name}`, source: talent.description }] : [])),
  ...entry.abilities.new.flatMap((ability) => ability.description
    ? [{ path: `${entry.id}/abilities/${ability.name}`, source: ability.description }] : []),
]);
const itemCatalog = await read("public/data/items/catalog.json");
const spellDetails = (await Promise.all(Array.from({ length: 64 }, (_, shard) =>
  read(`public/data/spells/foreverdb/${shard}.json`)))).flatMap(Object.values);
const visibleSpellWriteupTexts = new Set();
const sourceSpellWriteupTexts = new Set();
for (const classId of ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"]) {
  const writeups = await read(`public/data/spells/writeups/${classId}.json`);
  for (const writeup of [...Object.values(writeups.abilities ?? {}), ...Object.values(writeups.talents ?? {})]) {
    if (writeup.summary) sourceSpellWriteupTexts.add(writeup.summary);
    for (const text of [...(writeup.details ?? []), ...(writeup.avoidWhen ?? [])]) {
      sourceSpellWriteupTexts.add(text);
    }
    if (writeup.forever) visibleSpellWriteupTexts.add(writeup.forever);
    for (const text of writeup.useWhen ?? []) visibleSpellWriteupTexts.add(text);
  }
}
for (const value of visibleSpellWriteupTexts) sourceSpellWriteupTexts.add(value);
const spellWriteupSource = await read("public/data/spells/writeups/locales/source.json");
if (spellWriteupSource.version !== 1 || !Array.isArray(spellWriteupSource.strings) ||
  new Set(spellWriteupSource.strings).size !== spellWriteupSource.strings.length) {
  throw new Error("Invalid visible spell write-up locale source");
}
const staleSpellWriteupTexts = spellWriteupSource.strings.filter(
  (value) => !sourceSpellWriteupTexts.has(value));
if (staleSpellWriteupTexts.length) {
  console.error(`${staleSpellWriteupTexts.length} unused spell write-up locale source strings`);
  for (const value of staleSpellWriteupTexts) console.error(`  ${value}`);
  process.exitCode = 1;
}
const catalogItemById = new Map(itemCatalog.items.map((item) => [item.id, item]));
const siteEffectReview = await read("data/item-effect-localization/reviewed-effects.json");
const siteEffectTexts = [...new Set(itemCatalog.items.flatMap((item) =>
  (item.siteEffects ?? []).map((effect) => effect.text)))];
const unspacedCasefold = (text) => text.toLowerCase()
  .replace(/[^\p{L}\p{N}]/gu, "");
const fishingPoleEffect = /^When applied to your fishing pole, increases Fishing by (\d+) for (\d+) min(?:utes)?\.$/i;
const mapEntitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const mapFallbacks = await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json");
const questTextSource = await read("public/data/locales/wow-forever/quest-text-source.json");
const questTextFallbacks = await read("public/data/locales/wow-forever/quest-text-app-fallbacks.json");
const questDetails = (await read("public/data/quests/quest-details.json")).quests;
const wowheadQuestProse = await read("public/data/locales/wow-forever/quest-prose-wowhead.json");
const questTextIndexes = new Map(questTextSource.keys.map((key, index) => [key, index]));
const visibleQuestFields = ["objective", "description", "progressText", "completionText"];
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
let totalMissing = 0;
let totalUnreviewedSame = 0;
const requestedLanguage = process.argv.includes("--language")
  ? process.argv[process.argv.indexOf("--language") + 1] : undefined;
const prefix = process.argv.includes("--prefix")
  ? process.argv[process.argv.indexOf("--prefix") + 1] : undefined;
const limit = process.argv.includes("--limit")
  ? Number(process.argv[process.argv.indexOf("--limit") + 1]) : 30;
if (requestedLanguage && !languages[requestedLanguage]) throw new Error(`Unknown language: ${requestedLanguage}`);
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");

for (const [language, gameLocale] of Object.entries(languages)) {
  if (requestedLanguage && language !== requestedLanguage) continue;
  const app = flatten(await read(`src/i18n/locales/${language}.json`));
  const classCatalogPack = await read(`public/data/classes/locales/${language}.json`);
  if (classCatalogPack.version !== 1 || !classCatalogPack.translations ||
    Object.entries(classCatalogPack.translations).some(([english, localized]) =>
      !classCatalogProseFields.some((field) => field.source === english) ||
      typeof localized !== "string" || !localized.trim() || localized === english)) {
    throw new Error(`${language}: invalid class catalog locale pack`);
  }
  const classCatalogEnglishProse = classCatalogProseFields.filter((field) =>
    !classCatalogPack.translations[field.source]);
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const spellPack = await read(`public/data/locales/wow-forever/spell-tooltip-${gameLocale}.json`);
  const spellWriteupPack = await read(`public/data/spells/writeups/locales/${language}.json`);
  if (spellPack.version !== 1 || spellPack.locale !== gameLocale || !spellPack.entries ||
    Object.values(spellPack.entries).some((entry) =>
      Object.entries(entry).some(([field, value]) =>
        !["r", "d", "a", "old"].includes(field) || typeof value !== "string" || !value.trim())) ||
    spellWriteupPack.version !== 1 || spellWriteupPack.language !== language ||
    !Array.isArray(spellWriteupPack.values) ||
    spellWriteupPack.values.length !== spellWriteupSource.strings.length ||
    spellWriteupPack.values.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error(`${language}: invalid spell locale packs`);
  }
  const spellFallback = { r: 0, d: 0, a: 0, old: 0 };
  for (const detail of spellDetails) {
    for (const field of Object.keys(spellFallback)) {
      if (!detail[field] || (field === "old" && detail.old === detail.d) ||
        spellPack.entries[detail.id]?.[field]) continue;
      spellFallback[field] += 1;
    }
  }
  const spellWriteupTranslated = new Set(spellWriteupSource.strings.filter((value, index) =>
    spellWriteupPack.values[index] && spellWriteupPack.values[index] !== value));
  const spellWriteupUntranslated = [...visibleSpellWriteupTexts].filter((value) =>
    !spellWriteupTranslated.has(value));
  const allSpellWriteupUntranslated = [...sourceSpellWriteupTexts].filter((value) =>
    !spellWriteupTranslated.has(value));
  const siteEffectPack = await read(`public/data/locales/wow-forever/item-effects-${gameLocale}.json`);
  const wowheadEffectPack = await read(
    `public/data/locales/wow-forever/item-effects-wowhead-${gameLocale}.json`);
  const mapPack = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
  const questTextPack = await read(`public/data/locales/wow-forever/quest-text-${gameLocale}.json`);
  const wowheadQuestLocaleProse = await read(
    `public/data/locales/wow-forever/quest-prose-wowhead-${gameLocale}.json`);
  const wowheadQuestObjectives = await read(
    `public/data/locales/wow-forever/quest-objective-wowhead-${gameLocale}.json`);
  if (pack.values.length !== gameSource.keys.length) throw new Error(`${language}: client pack length mismatch`);
  if (siteEffectPack.version !== 1 || !siteEffectPack.translations ||
    wowheadEffectPack.version !== 1 || !wowheadEffectPack.translations ||
    Object.entries(wowheadEffectPack.translations).some(([source, translated]) =>
      !siteEffectTexts.includes(source) || typeof translated !== "string" ||
      !translated.trim() || translated === source)) {
    throw new Error(`${language}: invalid site effect locale pack`);
  }
  const activeSiteEffects = { ...siteEffectPack.translations,
    ...wowheadEffectPack.translations };
  const inactiveSiteEffects = Object.keys(siteEffectPack.translations)
    .filter((text) => !siteEffectTexts.includes(text));
  if (inactiveSiteEffects.length) {
    console.error(`${language}: ${inactiveSiteEffects.length} inactive item effect translations`);
    process.exitCode = 1;
  }
  const fishingUiReady = ["database.clientItem.siteEffect.fishingBonus",
    "database.clientItem.siteEffect.durationMinutes"].every((key) =>
    app.has(key) && placeholderSignature(app.get(key)) === placeholderSignature(sourceFields.get(key)));
  const siteEffectsUnresolved = siteEffectTexts.filter((text) =>
    !(fishingUiReady && fishingPoleEffect.test(text)) &&
    (!activeSiteEffects[text] ||
      (activeSiteEffects[text] === text &&
        !Object.hasOwn(siteEffectReview.invariantEffects ?? {}, text))));
  const siteEffectsEnglishCarryover = siteEffectTexts.filter((text) => {
    const translated = activeSiteEffects[text];
    const source = unspacedCasefold(text);
    return translated && translated !== text && source.length >= 16 &&
      unspacedCasefold(translated).includes(source);
  });
  if (mapPack.values.length !== mapEntitySource.keys.length ||
    !mapFallbacks.locales[gameLocale]) throw new Error(`${language}: map entity pack mismatch`);
  if (questTextPack.values.length !== questTextSource.keys.length ||
    !questTextFallbacks.locales[gameLocale]) throw new Error(`${language}: quest text pack mismatch`);
  const missing = [...sourceFields].filter(([key]) => !app.has(key));
  const placeholderMismatches = [...sourceFields].filter(([key, value]) =>
    app.has(key) && placeholderSignature(app.get(key)) !== placeholderSignature(value));
  const same = [...sourceFields].filter(([key, text]) => app.get(key) === text);
  const gameNameIndexes = { area: new Map(), unit: new Map() };
  for (const [index, key] of gameSource.keys.entries()) {
    const type = /^(?:AreaTable|AreaPOI):\d+:[01]$/.test(key) ? "area"
      : /^(?:Creature|DungeonEncounter):\d+:0$/.test(key) ? "unit" : undefined;
    if (!type) continue;
    const name = gameSource.values[index];
    const indexes = gameNameIndexes[type].get(name) ?? [];
    indexes.push(index);
    gameNameIndexes[type].set(name, indexes);
  }
  const gameNameIsInvariant = (type, name) => {
    const indexes = gameNameIndexes[type].get(name);
    return indexes?.length && indexes.every((index) => pack.values[index] === name);
  };
  const reviewedInvariant = same.filter(([key, text]) =>
    (/^map\.(?:publishedPlaces|publishedSettlements|publishedSettlementRegions|bankRegions|transportStops\.places|instanceMaps)\./.test(key) &&
      gameNameIsInvariant("area", text)) ||
    (/^map\.instanceEncounters\./.test(key) && gameNameIsInvariant("unit", text)) ||
    (invariantPartialQuestTitles.get(key)?.en === text &&
      invariantPartialQuestTitles.get(key).invariantLocales?.includes(language)) ||
    (reviewedForeverTrainers[text]?.[language] === text &&
      (/^map\.questMarkers\.[^.]+\.(startsAt|endsAt)$/.test(key) ||
        /^map\.(professionTrainers|mapgenieCommunity)\.[^.]+\.name$/.test(key))) ||
    (reviewedEntityNames[text]?.invariantLanguages?.includes(language) &&
      ((reviewedEntityNames[text].includeQuestTitles &&
        /^map\.questMarkers\.[^.]+\.name$/.test(key)) ||
        /^map\.questMarkers\.[^.]+\.(startsAt|endsAt)$/.test(key) ||
        /^map\.(classTrainers|professionTrainers)\.[^.]+\.name$/.test(key) ||
        /^map\.mapgenieCommunity\.[^.]+\.(name|detail)$/.test(key) ||
        /^map\.(repairVendors|questNpcs\.names)\.[^.]+$/.test(key))) ||
    (reviewedQuestTextTitleByPath.get(key)?.name === text &&
      reviewedQuestTextTitleByPath.get(key).languages.includes(language)) ||
    (invariantNpcQuestTitles.names[text]?.[language] === text &&
      /^map\.questMarkers\.[^.]+\.name$/.test(key)) ||
    ((reviewedClientNpcNames[text]?.[language] === text
      || invariantNpcNames.names[text]?.[language] === text
      || invariantMultiwordNames.names[text]?.[language] === text) && (
      /^map\.questMarkers\.[^.]+\.(startsAt|endsAt)$/.test(key) ||
      /^map\.(classTrainers|professionTrainers)\.[^.]+\.name$/.test(key) ||
      /^map\.mapgenieCommunity\.[^.]+\.(name|detail)$/.test(key) ||
      /^map\.(repairVendors|questNpcs\.names)\.[^.]+$/.test(key))));
  const authoredNameInvariants = same.filter(([key, text]) =>
    authoredWesternNpcNames[text]?.invariantLanguages?.includes(language) &&
    (/^map\.questMarkers\.[^.]+\.(startsAt|endsAt)$/.test(key) ||
      /^map\.(classTrainers|professionTrainers)\.[^.]+\.name$/.test(key) ||
      /^map\.mapgenieCommunity\.[^.]+\.(name|detail)$/.test(key) ||
      /^map\.(repairVendors|questNpcs\.names)\.[^.]+$/.test(key)));
  const reviewedKeys = new Set([...reviewedInvariant, ...authoredNameInvariants]
    .map(([key]) => key));
  const fixedUiTokens = new Set(["PvP", "Forever", "Discord", "WFM Addon",
    "X, Y", "Ctrl K", "Ctrl+Shift+D", "Ctrl+Shift+A", "you@example.com"]);
  const structuralSame = same.filter(([key, text]) =>
    /^updates\.releases\.[^.]+\.items\.\d+\.parts\.\d+\.target$/.test(key) ||
    /^updates\.releases\.[^.]+\.items\.\d+\.(?:target|links\.\d+\.categoryId)$/.test(key) ||
    /^updates\.releases\.[^.]+\.version$/.test(key) ||
    fixedUiTokens.has(text) ||
    !/\p{L}/u.test(text.replace(/\{\{[^}]+\}\}/g, "")));
  const structuralKeys = new Set(structuralSame.map(([key]) => key));
  const regionalFallbackKeys = language === "es-MX"
    ? new Set(Object.keys(mexicanSpanishFallback.fields)) : new Set();
  const unreviewedSame = same.filter(([key]) => !reviewedKeys.has(key)
    && !regionalFallbackKeys.has(key) && !structuralKeys.has(key));
  const unchangedProse = unreviewedSame.filter(([key, text]) => {
    if (text.trim().split(/\s+/).length < 4) return false;
    if (/^map\.mapgenieCommunity\.\d+\.detail$/.test(key) &&
      / · (?:Alliance|Horde)$/.test(text)) return false;
    if (/^map\.questMarkers\.\d+\.(?:startsAt|endsAt)$/.test(key)) return false;
    return true;
  });
  totalMissing += missing.length;
  totalUnreviewedSame += unreviewedSame.length;
  const clientBlank = gameSource.keys.flatMap((key, index) =>
    pack.values[index] == null || pack.values[index] === "" ? [key] : []);
  const translationsByEnglish = new Map();
  for (const [index, english] of gameSource.values.entries()) {
    const value = pack.values[index];
    if (!value) continue;
    const values = translationsByEnglish.get(english) ?? new Set();
    values.add(value);
    translationsByEnglish.set(english, values);
  }
  const clientUnresolved = clientBlank.filter((key) => {
    const index = gameSource.keys.indexOf(key);
    return translationsByEnglish.get(gameSource.values[index])?.size !== 1;
  });
  const clientSame = gameSource.keys.flatMap((key, index) =>
    pack.values[index] && pack.values[index] === gameSource.values[index] ? [key] : []);
  const clientDescriptionEnglish = gameSource.keys.flatMap((key, index) =>
    /^ItemSparse:\d+:0$/.test(key) &&
      gameSource.values[index]?.trim().split(/\s+/).length >= 5 &&
      pack.values[index] === gameSource.values[index] ? [key] : []);
  const catalogDescriptionEnglish = gameSource.keys.flatMap((key, index) => {
    const match = /^ItemSparse:(\d+):0$/.exec(key);
    if (!match) return [];
    const english = gameSource.values[index];
    const item = catalogItemById.get(match[1]);
    return english?.length >= 20 && item?.description === english &&
      pack.values[index] === english ? [key] : [];
  });
  const mapRawBlank = mapEntitySource.keys.filter((_, index) => !mapPack.values[index]);
  const reviewedMapInvariants = new Set();
  for (const [name, entry] of Object.entries(reviewedEntityNames)) {
    if (entry.sourcePriority !== "reviewed-proper-name") continue;
    for (const [reviewedLanguage, precedentName] of Object.entries(entry.precedent ?? {})) {
      const precedent = invariantMultiwordNames.names[precedentName];
      if (entry[reviewedLanguage] !== name ||
        !entry.invariantLanguages?.includes(reviewedLanguage) ||
        precedentName.split(" ")[0] !== name.split(" ")[0] ||
        precedent?.[reviewedLanguage] !== precedentName) {
        throw new Error(`${name}/${reviewedLanguage}: proper-name precedent changed`);
      }
    }
    if (entry.invariantLanguages?.some((reviewedLanguage) =>
      !entry.evidence?.[reviewedLanguage] && !entry.precedent?.[reviewedLanguage])) {
      throw new Error(`${name}: proper-name invariant lacks evidence`);
    }
  }
  for (const catalog of [invariantNpcNames.names, invariantMultiwordNames.names,
    reviewedEntityNames]) {
    for (const [name, entry] of Object.entries(catalog)) {
      const regionalSpanishInvariant = language === "es-MX" &&
        (!entry[language] || entry[language] === name) &&
        (entry.es === name || entry.invariantLanguages?.includes("es"));
      if (entry[language] !== name && !entry.invariantLanguages?.includes(language) &&
        !regionalSpanishInvariant) continue;
      for (const id of entry.npcIds ?? []) {
        const key = `Creature:${id}:0`;
        const index = mapEntitySource.keys.indexOf(key);
        if (index >= 0 && mapEntitySource.values[index] === name) reviewedMapInvariants.add(key);
      }
    }
  }
  for (const [name, entry] of Object.entries(invariantNpcQuestTitles.names)) {
    if (entry[language] !== name &&
      !(language === "es-MX" && !entry[language] && entry.es === name)) continue;
    for (const id of entry.questIds ?? []) {
      const key = `Quest:${id}:0`;
      const index = mapEntitySource.keys.indexOf(key);
      if (index >= 0 && mapEntitySource.values[index] === name) reviewedMapInvariants.add(key);
    }
  }
  for (const [id, record] of Object.entries(reviewedMapOnlyNames)) {
    if (!record.invariantLanguages?.includes(language)) continue;
    const key = `Creature:${id}:0`;
    const index = mapEntitySource.keys.indexOf(key);
    if (index < 0 || mapEntitySource.values[index] !== record.en) {
      throw new Error(`${language}/${key}: reviewed invariant NPC identity changed`);
    }
    reviewedMapInvariants.add(key);
  }
  for (const [name, entry] of Object.entries(reviewedClientCompoundTitles)) {
    if (entry[language] !== name) continue;
    for (const id of entry.questIds ?? []) {
      const key = `Quest:${id}:0`;
      const index = mapEntitySource.keys.indexOf(key);
      if (index >= 0 && mapEntitySource.values[index] === name) reviewedMapInvariants.add(key);
    }
  }
  for (const [name, entry] of Object.entries(reviewedQuestTextTitles)) {
    if (!entry.gameQuestIds?.length || !entry.questTextKey ||
      !entry.invariantLanguages?.includes(language)) continue;
    const textIndex = questTextSource.keys.indexOf(entry.questTextKey);
    const translatedText = questTextPack.values[textIndex] ??
      questTextFallbacks.locales[gameLocale][entry.questTextKey];
    if (textIndex < 0 || !questTextSource.values[textIndex].includes(name) ||
      !translatedText?.includes(name)) {
      throw new Error(`${language}/${name}: reviewed quest-text name evidence changed`);
    }
    for (const id of entry.gameQuestIds) {
      const key = `Quest:${id}:0`;
      const index = mapEntitySource.keys.indexOf(key);
      if (index < 0 || mapEntitySource.values[index] !== name) {
        throw new Error(`${language}/${key}: reviewed quest title identity changed`);
      }
      reviewedMapInvariants.add(key);
    }
  }
  for (const [name, entry] of Object.entries(reviewedQuestTextTitles)) {
    if (entry.sourcePriority !== "forever-site" ||
      !entry.invariantLanguages?.includes(language) ||
      entry.translations?.[language] !== name || !entry.evidence?.[language]) continue;
    for (const id of [entry.gameQuestId, ...(entry.gameQuestIds ?? [])].filter(Boolean)) {
      const key = `Quest:${id}:0`;
      const index = mapEntitySource.keys.indexOf(key);
      if (index < 0 || mapEntitySource.values[index] !== name) {
        throw new Error(`${language}/${key}: reviewed site quest identity changed`);
      }
      reviewedMapInvariants.add(key);
    }
  }
  const mapInvariantBlank = mapRawBlank.filter((key) =>
    !mapFallbacks.locales[gameLocale][key] && reviewedMapInvariants.has(key));
  const mapUnresolved = mapRawBlank.filter((key) =>
    !mapFallbacks.locales[gameLocale][key] && !reviewedMapInvariants.has(key));
  const questTextRawBlank = questTextSource.keys.filter((key, index) =>
    !questTextPack.values[index] ||
    isEnglishQuestProseFallback(questTextPack.values[index], questTextSource.values[index]) ||
    (key.endsWith(":objective") &&
      hasConflictingQuestObjectiveNumbers(questTextSource.values[index],
        questTextPack.values[index])));
  const questTextConverted = gameLocale === "zhTW"
    ? questTextFallbacks.derivedFromZhCN?.zhTW?.length ?? 0
    : gameLocale === "zhCN"
      ? questTextFallbacks.derivedFromZhTW?.zhCN?.length ?? 0 : 0;
  const questTextUnresolved = questTextRawBlank.filter((key) => {
    if (questTextFallbacks.locales[gameLocale][key] &&
      !isEnglishQuestProseFallback(questTextFallbacks.locales[gameLocale][key],
        questTextSource.values[questTextIndexes.get(key)])) return false;
    const [id, field] = key.split(":");
    const english = questTextSource.values[questTextIndexes.get(key)];
    return ![wowheadQuestProse, wowheadQuestLocaleProse, wowheadQuestObjectives].some((pack) => {
      const record = pack.quests[id];
      const localized = record?.english?.[field] === english &&
        record.locales?.[gameLocale]?.[field];
      return Boolean(localized && !isEnglishQuestProseFallback(localized, english));
    });
  });
  const questProseUncovered = [];
  const regionalQuestProse = Object.values(wowheadQuestLocaleProse.quests).reduce((count, entry) =>
    count + Object.keys(entry.regionalFallbackFields ?? {}).length, 0);
  for (const [id, quest] of Object.entries(questDetails)) {
    for (const field of visibleQuestFields) {
      const english = quest[field];
      if (typeof english !== "string" || !english.trim()) continue;
      const key = `${id}:${field}`;
      const index = questTextIndexes.get(key);
      const indexedValue = index !== undefined && questTextSource.values[index] === english &&
        (questTextPack.values[index] || questTextFallbacks.locales[gameLocale][key]);
      const indexed = indexedValue && !isEnglishQuestProseFallback(indexedValue, english) &&
        (field !== "objective" ||
        !hasConflictingQuestObjectiveNumbers(english, indexedValue));
      const wowhead = wowheadQuestProse.quests[id];
      const localized = wowhead?.english?.[field] === english &&
        wowhead.locales?.[gameLocale]?.[field];
      const batch = wowheadQuestLocaleProse.quests[id];
      const batchLocalized = batch?.english?.[field] === english &&
        batch.locales?.[gameLocale]?.[field];
      const objective = wowheadQuestObjectives.quests[id];
      const objectiveLocalized = objective?.english?.[field] === english &&
        objective.locales?.[gameLocale]?.[field];
      if (!indexed &&
        ![localized, batchLocalized, objectiveLocalized].some((value) =>
          value && !isEnglishQuestProseFallback(value, english))) {
        questProseUncovered.push(key);
      }
    }
  }
  const groups = new Map();
  for (const [key] of missing) {
    const group = key.split(".").slice(0, 2).join(".");
    groups.set(group, (groups.get(group) ?? 0) + 1);
  }
  console.log(`${language}: app missing ${missing.length}; placeholder mismatches ${placeholderMismatches.length}; app unchanged ${unreviewedSame.length}; unchanged prose ${unchangedProse.length}; class catalog English prose ${classCatalogEnglishProse.length}; structural keys ${structuralSame.length}; reviewed invariant names ${reviewedInvariant.length}; authored name invariants ${authoredNameInvariants.length}; regional Spanish fallback ${regionalFallbackKeys.size}; client raw blank ${clientBlank.length}; client unresolved ${clientUnresolved.length}; client same as enUS ${clientSame.length}; client description English ${clientDescriptionEnglish.length}; catalog description English ${catalogDescriptionEnglish.length}; map entity raw blank ${mapRawBlank.length}; map entity reviewed invariant ${mapInvariantBlank.length}; map entity unresolved ${mapUnresolved.length}; quest text raw blank ${questTextRawBlank.length}; quest text converted from other Chinese locale ${questTextConverted}; quest text unresolved ${questTextUnresolved.length}; quest prose regional Spanish fallback ${regionalQuestProse}; all visible quest prose uncovered ${questProseUncovered.length}; site effect unresolved ${siteEffectsUnresolved.length}; site effect English carryover ${siteEffectsEnglishCarryover.length}`);
  console.log(`${language}: spell fallback ranks ${spellFallback.r}, descriptions ${spellFallback.d}, auras ${spellFallback.a}, Classic Era descriptions ${spellFallback.old}; visible spell guide prose untranslated ${spellWriteupUntranslated.length}; all spell guide prose untranslated ${allSpellWriteupUntranslated.length}`);
  console.log([...groups].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([group, count]) => `${group}=${count}`).join(" "));
  if (prefix) {
    const rows = missing.filter(([key]) => key === prefix || key.startsWith(`${prefix}.`));
    for (const [key, value] of rows.slice(0, limit)) console.log(`${key}\t${value}`);
    console.log(`Listed ${Math.min(limit, rows.length)} of ${rows.length} missing keys under ${prefix}`);
  }
  if (process.argv.includes("--unchanged")) {
    const rows = unreviewedSame.filter(([key]) => !prefix || key === prefix || key.startsWith(`${prefix}.`));
    for (const [key, value] of rows.slice(0, limit)) console.log(`unchanged\t${key}\t${value}`);
    console.log(`Listed ${Math.min(limit, rows.length)} of ${rows.length} unchanged keys${prefix ? ` under ${prefix}` : ""}`);
  }
  if (process.argv.includes("--prose")) {
    for (const [key, value] of unchangedProse.slice(0, limit)) {
      console.log(`unchanged prose\t${key}\t${value}`);
    }
    console.log(`Listed ${Math.min(limit, unchangedProse.length)} of ${unchangedProse.length} unchanged prose fields`);
  }
  if (process.argv.includes("--class-catalog")) {
    for (const field of classCatalogEnglishProse.slice(0, limit)) {
      console.log(`class catalog English prose\t${field.path}\t${field.source}`);
    }
    console.log(`Listed ${Math.min(limit, classCatalogEnglishProse.length)} of ${classCatalogEnglishProse.length} class catalog English prose fields`);
  }
  if (process.argv.includes("--map-entity")) {
    for (const key of mapUnresolved.slice(0, limit)) {
      const index = mapEntitySource.keys.indexOf(key);
      console.log(`map unresolved\t${key}\t${mapEntitySource.values[index]}`);
    }
    console.log(`Listed ${Math.min(limit, mapUnresolved.length)} of ${mapUnresolved.length} unresolved map entities`);
  }
  if (process.argv.includes("--client-same")) {
    const requestedTable = process.argv.includes("--client-table")
      ? process.argv[process.argv.indexOf("--client-table") + 1] : undefined;
    const clientSameRows = requestedTable
      ? clientSame.filter((key) => key.startsWith(`${requestedTable}:`)) : clientSame;
    const byTable = new Map();
    for (const key of clientSameRows) {
      const table = key.split(":")[0];
      byTable.set(table, (byTable.get(table) ?? 0) + 1);
    }
    console.log(`client same by table\t${[...byTable].sort((a, b) => b[1] - a[1])
      .map(([table, count]) => `${table}:${count}`).join(" ")}`);
    for (const key of clientSameRows.slice(0, limit)) {
      console.log(`client same\t${key}\t${gameSource.values[gameSource.keys.indexOf(key)]}`);
    }
    console.log(`Listed ${Math.min(limit, clientSameRows.length)} of ${clientSameRows.length} unchanged client fields`);
  }
  if (process.argv.includes("--catalog-description")) {
    for (const key of catalogDescriptionEnglish.slice(0, limit)) {
      console.log(`catalog description English\t${key}\t${gameSource.values[gameSource.keys.indexOf(key)]}`);
    }
    console.log(`Listed ${Math.min(limit, catalogDescriptionEnglish.length)} of ${catalogDescriptionEnglish.length} English catalog descriptions`);
  }
  if (process.argv.includes("--client-description")) {
    for (const key of clientDescriptionEnglish.slice(0, limit)) {
      console.log(`client description English\t${key}\t${gameSource.values[gameSource.keys.indexOf(key)]}`);
    }
    console.log(`Listed ${Math.min(limit, clientDescriptionEnglish.length)} of ${clientDescriptionEnglish.length} English client descriptions`);
  }
  if (process.argv.includes("--quest-text")) {
    for (const key of questTextUnresolved.slice(0, limit)) {
      const index = questTextSource.keys.indexOf(key);
      console.log(`quest text unresolved\t${key}\t${questTextSource.values[index].slice(0, 180)}`);
    }
    console.log(`Listed ${Math.min(limit, questTextUnresolved.length)} of ${questTextUnresolved.length} unresolved quest text fields`);
    for (const key of questProseUncovered.slice(0, limit)) {
      const [id, field] = key.split(":");
      console.log(`visible quest prose uncovered\t${key}\t${questDetails[id][field].slice(0, 180)}`);
    }
    console.log(`Listed ${Math.min(limit, questProseUncovered.length)} of ${questProseUncovered.length} visible quest prose gaps`);
  }
  if (process.argv.includes("--site-effect")) {
    for (const text of siteEffectsUnresolved.slice(0, limit)) {
      console.log(`site effect unresolved\t${text.slice(0, 180)}`);
    }
    console.log(`Listed ${Math.min(limit, siteEffectsUnresolved.length)} of ${siteEffectsUnresolved.length} unresolved site effect texts`);
    for (const text of siteEffectsEnglishCarryover.slice(0, limit)) {
      console.log(`site effect English carryover\t${text.slice(0, 180)}`);
    }
    console.log(`Listed ${Math.min(limit, siteEffectsEnglishCarryover.length)} of ${siteEffectsEnglishCarryover.length} English carryovers`);
  }
  if (process.argv.includes("--fail") &&
    (missing.length || placeholderMismatches.length || unchangedProse.length ||
      classCatalogEnglishProse.length || clientUnresolved.length ||
      clientDescriptionEnglish.length || catalogDescriptionEnglish.length ||
      mapUnresolved.length || questTextUnresolved.length || questProseUncovered.length || siteEffectsUnresolved.length ||
      siteEffectsEnglishCarryover.length || Object.values(spellFallback).some(Boolean) ||
      allSpellWriteupUntranslated.length)) process.exitCode = 1;
}
console.log(`Selected total: app missing ${totalMissing}; app unchanged ${totalUnreviewedSame}`);
