/** Reuse reviewed app quest titles and identical client NPC names where map client records are absent. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeReviewedEntityNames } from "./lib/merge-reviewed-entity-names.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const directory = "public/data/locales/wow-forever";
const source = await read(`${directory}/map-entity-source.json`);
const clientSource = await read(`${directory}/source.json`);
const clientItemQuestTitles = await read("data/quest-title-localization/client-item-title-fallbacks.json");
const compoundClientQuestTitles = await read(
  "data/quest-title-localization/reviewed-client-compound-titles.json");
const repeatedQuestTitles = await read(
  "data/quest-title-localization/reviewed-repeated-map-title-fallbacks.json");
const authoredMapQuestTitles = await read(
  "data/quest-title-localization/reviewed-map-quest-titles.json");
const authoredMapOnlyNames = await read(
  "data/npc-name-localization/reviewed-map-only-names.json");
const quests = await read("public/data/quests/quest-details.json");
const english = await read("src/i18n/locales/en.json");
const reviewedNames = mergeReviewedEntityNames(
  await read("data/quest-marker-localization/reviewed-entity-names.json"),
  await read("data/quest-marker-localization/reviewed-classic-npc-gaps.json"),
  await read("data/quest-marker-localization/reviewed-partial-entity-names.json"),
  await read("data/quest-marker-localization/reviewed-client-compound-names.json"));
const compoundClientNames = await read(
  "data/quest-marker-localization/reviewed-client-compound-names.json");
const questTitleCatalogs = await Promise.all([
  read("data/quest-title-localization/polestar-forever-titles.json"),
  read("data/quest-title-localization/polestar-forever-partial-titles.json"),
]);
const reviewedQuestDirectory = "data/quest-title-localization";
const reviewedQuestFiles = (await readdir(join(root, reviewedQuestDirectory)))
  .filter((file) => /^reviewed-.*\.json$/.test(file));
const reviewedQuests = await Promise.all(reviewedQuestFiles.map((file) =>
  read(`${reviewedQuestDirectory}/${file}`)));
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
if (source.version !== 1 || source.keys.length !== source.values.length ||
  new Set(source.keys).size !== source.keys.length) throw new Error("Invalid map entity source");
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const clientSourceIndex = new Map(clientSource.keys.map((key, index) => [key, index]));
if (authoredMapOnlyNames.version !== 1 || !authoredMapOnlyNames.names) {
  throw new Error("Invalid authored map-only NPC catalog");
}
for (const [id, record] of Object.entries(authoredMapOnlyNames.names)) {
  const index = sourceIndex.get(`Creature:${id}:0`);
  const invariants = record.invariantLanguages ?? [];
  if (!/^\d+$/.test(id) || index === undefined || source.values[index] !== record.en ||
    !record.context || !Object.keys(record.translations ?? {}).length ||
    !Array.isArray(invariants) || new Set(invariants).size !== invariants.length ||
    (invariants.length > 0 && !/^[A-Za-z']+$/.test(record.en)) ||
    invariants.some((language) => !["de", "es", "es-MX", "fr", "pt-BR"].includes(language) ||
      Object.hasOwn(record.translations, language)) ||
    Object.entries(record.translations).some(([language, translated]) =>
      !languages[language] || typeof translated !== "string" ||
      !translated.trim() || translated === record.en)) {
    throw new Error(`${id}: invalid authored map-only NPC identity or translations`);
  }
}
if (clientItemQuestTitles.version !== 1) throw new Error("Invalid client item quest catalog");
if (repeatedQuestTitles.version !== 1) throw new Error("Invalid repeated quest title catalog");
if (authoredMapQuestTitles.version !== 1 || !authoredMapQuestTitles.titles) {
  throw new Error("Invalid authored map quest title catalog");
}
for (const [id, record] of Object.entries(authoredMapQuestTitles.titles)) {
  const index = sourceIndex.get(`Quest:${id}:0`);
  const itemIndex = record.itemKey ? clientSourceIndex.get(record.itemKey) : undefined;
  const areaIndex = record.areaKey ? clientSourceIndex.get(record.areaKey) : undefined;
  const authoredLanguages = Object.keys(languages).filter((language) =>
    Object.hasOwn(record, language));
  if (index === undefined || source.values[index] !== record.en ||
    !authoredLanguages.length ||
    Object.keys(record).some((key) => !["en", "itemKey", "areaKey", ...Object.keys(languages)].includes(key)) ||
    (record.itemKey && (!/^ItemSparse:\d+:4$/.test(record.itemKey) ||
      itemIndex === undefined ||
      !record.en.toLowerCase().includes(clientSource.values[itemIndex].toLowerCase()))) ||
    (record.areaKey && (!/^AreaTable:\d+:1$/.test(record.areaKey) ||
      areaIndex === undefined ||
      !record.en.toLowerCase().includes(clientSource.values[areaIndex].toLowerCase()))) ||
    authoredLanguages.some((language) =>
      typeof record[language] !== "string" || !record[language].trim() ||
      record[language] === record.en)) {
    throw new Error(`${id}: invalid authored map quest title`);
  }
}
for (const [name, record] of Object.entries(repeatedQuestTitles.titles)) {
  if (!Array.isArray(record.questIds) || !record.questIds.length) {
    throw new Error(`${name}: missing repeated quest IDs`);
  }
  for (const id of record.questIds) {
    const index = sourceIndex.get(`Quest:${id}:0`);
    if (index === undefined || source.values[index] !== name) {
      throw new Error(`${name}/${id}: repeated quest identity changed`);
    }
  }
}
for (const [id, record] of Object.entries(clientItemQuestTitles.quests)) {
  const questIndex = sourceIndex.get(`Quest:${id}:0`);
  if (questIndex === undefined || source.values[questIndex] !== record.en ||
    !Array.isArray(record.itemKeys) || !record.itemKeys.length) {
    throw new Error(`${id}: client item quest identity changed`);
  }
  for (const itemKey of record.itemKeys) {
    const itemIndex = clientSourceIndex.get(itemKey);
    if (!/^ItemSparse:\d+:4$/.test(itemKey) || itemIndex === undefined ||
      clientSource.values[itemIndex] !== record.en) {
      throw new Error(`${id}: client item name no longer matches the quest title`);
    }
  }
}
const records = {};

for (const [language, locale] of Object.entries(languages)) {
  const pack = await read(`${directory}/map-entity-${locale}.json`);
  const clientPack = await read(`${directory}/${locale}.json`);
  const app = await read(`src/i18n/locales/${language}.json`);
  if (pack.version !== 1 || pack.values.length !== source.keys.length) {
    throw new Error(`${locale}: invalid map entity pack`);
  }
  if (clientPack.values.length !== clientSource.keys.length) {
    throw new Error(`${locale}: invalid client pack`);
  }
  for (const [englishName, record] of Object.entries(compoundClientNames)) {
    const translated = record[language];
    if (!translated) continue;
    const evidenceKey = record.evidence?.[language];
    const evidenceIndex = clientSourceIndex.get(evidenceKey);
    if (evidenceIndex === undefined ||
      !clientSource.values[evidenceIndex]?.includes(englishName) ||
      !clientPack.values[evidenceIndex]?.includes(translated)) {
      throw new Error(`${locale}/${englishName}: client compound name evidence changed`);
    }
  }
  const candidates = new Map();
  const localizedQuestMarkerTitles = new Map();
  for (const [markerKey, questId] of Object.entries(quests.markerQuestIds)) {
    if (!markerKey.startsWith("mapgenie-quest-")) continue;
    const markerId = markerKey.slice("mapgenie-quest-".length);
    const name = english.map.questMarkers[markerId]?.name;
    const translated = app.map.questMarkers[markerId]?.name;
    const key = `Quest:${questId}:0`;
    const index = sourceIndex.get(key);
    if (index === undefined || pack.values[index] || source.values[index] !== name ||
      !translated || translated === name) continue;
    const values = candidates.get(key) ?? new Set();
    values.add(translated);
    candidates.set(key, values);
  }
  for (const [markerId, marker] of Object.entries(english.map.questMarkers)) {
    const original = marker.name;
    const translated = app.map.questMarkers[markerId]?.name;
    if (!original || !translated || translated === original) continue;
    const values = localizedQuestMarkerTitles.get(original) ?? new Set();
    values.add(translated);
    localizedQuestMarkerTitles.set(original, values);
  }
  const localizedByCreatureName = new Map();
  const localizedGameNames = new Map();
  for (let index = 0; index < clientSource.keys.length; index += 1) {
    if (!/^(?:ItemSparse|GameObjects|Creature|DungeonEncounter|AreaTable|AreaPOI|SpellName|SpellFocusObject):\d+:[014]$/.test(clientSource.keys[index])) continue;
    const original = clientSource.values[index];
    const translated = clientPack.values[index];
    if (!original || !translated || translated === original) continue;
    const values = localizedGameNames.get(original) ?? new Set();
    values.add(translated);
    localizedGameNames.set(original, values);
  }
  for (let index = 0; index < source.keys.length; index += 1) {
    if (!source.keys[index].startsWith("Creature:") || !pack.values[index]) continue;
    const values = localizedByCreatureName.get(source.values[index]) ?? new Set();
    values.add(pack.values[index]);
    localizedByCreatureName.set(source.values[index], values);
  }
  for (let index = 0; index < clientSource.keys.length; index += 1) {
    if (!/^(?:Creature|DungeonEncounter):\d+:0$/.test(clientSource.keys[index]) ||
      !clientPack.values[index] || clientPack.values[index] === clientSource.values[index]) continue;
    const values = localizedByCreatureName.get(clientSource.values[index]) ?? new Set();
    values.add(clientPack.values[index]);
    localizedByCreatureName.set(clientSource.values[index], values);
  }
  const reviewedByCreatureName = new Map();
  const collect = (name, translated) => {
    if (!name || !translated || name === translated) return;
    const values = reviewedByCreatureName.get(name) ?? new Set();
    values.add(translated);
    reviewedByCreatureName.set(name, values);
  };
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    for (const field of ["startsAt", "endsAt"]) {
      collect(marker[field], app.map.questMarkers[id]?.[field]);
    }
  }
  for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
    for (const [id, record] of Object.entries(english.map[group])) {
      for (const field of group === "mapgenieCommunity" ? ["name", "detail"] : ["name"]) {
        collect(record[field], app.map[group][id]?.[field]);
      }
    }
  }
  for (const [id, name] of Object.entries(english.map.repairVendors)) {
    collect(name, app.map.repairVendors[id]);
  }
  for (const [id, name] of Object.entries(english.map.questNpcs.names)) {
    collect(name, app.map.questNpcs.names[id]);
  }
  const fallbacks = {};
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    if (pack.values[index]) continue;
    if (key.startsWith("Creature:")) {
      const values = localizedByCreatureName.get(source.values[index]);
      if (values?.size === 1) fallbacks[key] = [...values][0];
      else if (!values) {
        const reviewed = reviewedByCreatureName.get(source.values[index]);
        if (reviewed?.size === 1) fallbacks[key] = [...reviewed][0];
      }
    } else if (key.startsWith("Quest:") && candidates.get(key)?.size === 1) {
      fallbacks[key] = [...candidates.get(key)][0];
    }
  }
  for (const catalog of questTitleCatalogs) {
    for (const [englishName, record] of Object.entries(catalog.titles)) {
      const translated = record[language];
      if (!translated || translated === englishName) continue;
      for (const id of record.questIds ?? []) {
        const key = `Quest:${id}:0`;
        const index = sourceIndex.get(key);
        if (index === undefined || pack.values[index] || source.values[index] !== englishName ||
          fallbacks[key]) continue;
        fallbacks[key] = translated;
      }
    }
  }
  for (const catalog of reviewedQuests) {
    for (const record of Object.values(catalog)) {
      const translated = record?.[language];
      if (!record?.en || !translated || translated === record.en) continue;
      for (const id of [record.mapEntityQuestId, record.questId,
        ...(record.questIds ?? [])].filter(Boolean)) {
        const key = `Quest:${id}:0`;
        const index = sourceIndex.get(key);
        if (index === undefined || pack.values[index] ||
          source.values[index] !== record.en || fallbacks[key]) continue;
        fallbacks[key] = translated;
      }
    }
  }
  for (const [id, record] of Object.entries(authoredMapQuestTitles.titles)) {
    const key = `Quest:${id}:0`;
    const index = sourceIndex.get(key);
    const translated = record[language];
    if (!translated || pack.values[index]) continue;
    if (record.itemKey) {
      const itemName = clientPack.values[clientSourceIndex.get(record.itemKey)];
      if (!itemName || !translated.includes(itemName)) {
        throw new Error(`${locale}/${key}: authored quest title omits the client item name`);
      }
    }
    if (record.areaKey) {
      const areaName = clientPack.values[clientSourceIndex.get(record.areaKey)];
      if (!areaName || !translated.toLocaleLowerCase().includes(areaName.toLocaleLowerCase())) {
        throw new Error(`${locale}/${key}: authored quest title omits the client area name`);
      }
    }
    if (fallbacks[key] && fallbacks[key] !== translated) {
      throw new Error(`${locale}/${key}: authored map quest title conflicts with another source`);
    }
    fallbacks[key] = translated;
  }
  for (const [id, record] of Object.entries(clientItemQuestTitles.quests)) {
    const key = `Quest:${id}:0`;
    if (fallbacks[key] || pack.values[sourceIndex.get(key)]) continue;
    const values = new Set(record.itemKeys.map((itemKey) =>
      clientPack.values[clientSourceIndex.get(itemKey)]).filter((value) =>
      value && value !== record.en));
    if (values.size === 1) fallbacks[key] = [...values][0];
  }
  for (const [englishName, record] of Object.entries(compoundClientQuestTitles)) {
    const translated = record[language];
    if (!translated || translated === englishName) continue;
    const evidenceIndex = clientSourceIndex.get(record.evidence?.[language]);
    if (evidenceIndex === undefined ||
      !clientSource.values[evidenceIndex]?.includes(englishName) ||
      !clientPack.values[evidenceIndex]?.includes(translated)) {
      throw new Error(`${locale}/${englishName}: client compound quest title evidence changed`);
    }
    for (const id of record.questIds) {
      const key = `Quest:${id}:0`;
      const index = sourceIndex.get(key);
      if (index === undefined || source.values[index] !== englishName) {
        throw new Error(`${key}: client compound quest identity changed`);
      }
      if (!pack.values[index] && !fallbacks[key]) fallbacks[key] = translated;
    }
  }
  for (const [englishName, record] of Object.entries(reviewedNames)) {
    const translated = record[language];
    if (!translated || translated === englishName || !record.npcIds?.length) continue;
    for (const id of record.npcIds) {
      const key = `Creature:${id}:0`;
      const index = sourceIndex.get(key);
      if (index === undefined || pack.values[index]) continue;
      if (source.values[index] !== englishName) {
        throw new Error(`${key}: reviewed NPC identity differs from the map entity`);
      }
      if (fallbacks[key] && fallbacks[key] !== translated) {
        throw new Error(`${key}: reviewed NPC name conflicts with the client duplicate`);
      }
      fallbacks[key] = translated;
    }
  }
  for (const [id, record] of Object.entries(authoredMapOnlyNames.names)) {
    const key = `Creature:${id}:0`;
    const index = sourceIndex.get(key);
    const translated = record.translations[language];
    if (!translated || pack.values[index]) continue;
    if (fallbacks[key] && fallbacks[key] !== translated) {
      throw new Error(`${locale}/${key}: authored NPC name conflicts with another source`);
    }
    fallbacks[key] = translated;
  }
  const translatedQuestTitles = new Map();
  for (let index = 0; index < source.keys.length; index += 1) {
    if (!source.keys[index].startsWith("Quest:") || !pack.values[index]) continue;
    const values = translatedQuestTitles.get(source.values[index]) ?? new Set();
    values.add(pack.values[index]);
    translatedQuestTitles.set(source.values[index], values);
  }
  for (const [name, record] of Object.entries(repeatedQuestTitles.titles)) {
    const values = translatedQuestTitles.get(name);
    if (values?.size !== 1) continue;
    const translated = [...values][0];
    for (const id of record.questIds) {
      const key = `Quest:${id}:0`;
      if (!pack.values[sourceIndex.get(key)] && !fallbacks[key]) fallbacks[key] = translated;
    }
  }
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    if (!key.startsWith("Quest:") || pack.values[index] || fallbacks[key]) continue;
    const values = localizedQuestMarkerTitles.get(source.values[index]);
    if (values?.size === 1) fallbacks[key] = [...values][0];
  }
  // Reuse an exact game name only when every matching client record agrees.
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    if (pack.values[index] || fallbacks[key]) continue;
    const values = localizedGameNames.get(source.values[index]);
    if (values?.size === 1) fallbacks[key] = [...values][0];
  }
  // The Mexican pack is sparse; a matching Spanish game ID is preferable to English.
  if (locale === "esMX") {
    const spanishPack = await read(`${directory}/map-entity-esES.json`);
    if (spanishPack.version !== 1 || spanishPack.values.length !== source.keys.length) {
      throw new Error("Spanish map entity pack does not share the source keys");
    }
    for (let index = 0; index < source.keys.length; index += 1) {
      const key = source.keys[index];
      if (!pack.values[index] && !fallbacks[key] && spanishPack.values[index] &&
        spanishPack.values[index] !== source.values[index]) {
        fallbacks[key] = spanishPack.values[index];
      } else if (!pack.values[index] && !fallbacks[key] &&
        records.esES[key] && records.esES[key] !== source.values[index]) {
        fallbacks[key] = records.esES[key];
      }
    }
  }
  for (const [key, translated] of Object.entries(fallbacks)) {
    const index = sourceIndex.get(key);
    if (index === undefined || pack.values[index] || translated === source.values[index]) {
      throw new Error(`${locale}/${key}: invalid map entity fallback`);
    }
  }
  records[locale] = fallbacks;
  console.log(`${locale}: ${Object.keys(fallbacks).length} ID/name-verified map fallbacks`);
}

const path = join(root, directory, "map-entity-app-fallbacks.json");
const output = `${JSON.stringify({ version: 1, locales: records }, null, 2)}\n`;
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Map entity app fallbacks are stale");
} else await writeFile(path, output);
