/** Apply manually reviewed Forever quest titles by marker ID without guessing NPC names. */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const questDetails = await read("public/data/quests/quest-details.json");
const source = await read("public/data/locales/wow-forever/source.json");
const mapEntitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const npcNames = await read("data/npc-name-localization/reviewed-client-evidence.json");
const creatureNames = await read("data/quest-marker-localization/reviewed-partial-entity-names.json");
const indexByKey = new Map(source.keys.map((key, index) => [key, index]));
const mapEntityIndexByKey = new Map(mapEntitySource.keys.map((key, index) => [key, index]));
const comparable = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[’‘]/g, "'").toLocaleLowerCase();
const spellIndicesByName = new Map();
for (const [index, key] of source.keys.entries()) {
  if (!key.startsWith("SpellName:") || !key.endsWith(":0")) continue;
  const name = source.values[index];
  const indices = spellIndicesByName.get(name) ?? [];
  indices.push(index);
  spellIndicesByName.set(name, indices);
}
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const directory = "data/quest-title-localization";
const files = (await readdir(join(root, directory))).filter((file) => /^reviewed-.*\.json$/.test(file)).sort();
const titles = new Map();
for (const file of files) {
  const records = await read(join(directory, file));
  for (const [id, record] of Object.entries(records)) {
    if (titles.has(id)) throw new Error(`${id}: duplicate title in ${file}`);
    if (!english.map.questMarkers[id] || english.map.questMarkers[id].name !== record.en) {
      throw new Error(`${id}: English marker title changed in ${file}`);
    }
    if (Object.keys(record).some((key) => !["en", "questId", "clientTermKey", "clientSkillId",
      "clientItemKey",
      "clientZoneKey", "clientMapKey", "mapEntityQuestId", "contextEndAt",
      "reuseSameEnglish", "alsoStartsAt", "authoredFallbackLanguages",
      ...Object.keys(languages)].includes(key))) {
      throw new Error(`${id}: unexpected language or metadata in ${file}`);
    }
    if (record.questId && (questDetails.markerQuestIds[`mapgenie-quest-${id}`] !== record.questId ||
      questDetails.quests[record.questId]?.title !== record.en)) {
      throw new Error(`${id}: quest objective source does not match ${record.en}`);
    }
    if (record.clientTermKey) {
      const index = indexByKey.get(record.clientTermKey);
      if (!record.questId || index === undefined ||
        !questDetails.quests[record.questId].objective.toLowerCase()
          .includes(source.values[index].toLowerCase())) {
        throw new Error(`${id}: client term is not present in the quest objective`);
      }
    }
    if (record.clientItemKey) {
      const index = indexByKey.get(record.clientItemKey);
      if (index === undefined || !record.clientItemKey.startsWith("ItemSparse:") ||
        !record.en.includes(source.values[index].replace(/ Cloth$/, ""))) {
        throw new Error(`${id}: client item does not match the English quest title`);
      }
    }
    if (record.clientMapKey) {
      const index = indexByKey.get(record.clientMapKey);
      if (record.en !== "The Eastern Kingdom" || record.clientMapKey !== "Map:0:1" ||
        index === undefined || source.values[index] !== "Eastern Kingdoms") {
        throw new Error(`${id}: client map does not match the reviewed quest context`);
      }
    }
    if (record.mapEntityQuestId) {
      const index = mapEntityIndexByKey.get(`Quest:${record.mapEntityQuestId}:0`);
      if (index === undefined ||
        mapEntitySource.values[index]?.toLocaleLowerCase("en") !==
          record.en.toLocaleLowerCase("en")) {
        throw new Error(`${id}: map entity quest does not match the reviewed title`);
      }
    }
    if (record.authoredFallbackLanguages &&
      (!record.mapEntityQuestId || !Array.isArray(record.authoredFallbackLanguages) ||
        !record.authoredFallbackLanguages.length ||
        new Set(record.authoredFallbackLanguages).size !== record.authoredFallbackLanguages.length ||
        record.authoredFallbackLanguages.some((language) => !languages[language]))) {
      throw new Error(`${id}: invalid authored fallback language list`);
    }
    if (record.clientZoneKey) {
      const index = indexByKey.get(record.clientZoneKey);
      if (index === undefined || !record.clientZoneKey.startsWith("AreaTable:") ||
        source.values[index] !== "Dustwallow Marsh" || !record.en.includes("Marsh")) {
        throw new Error(`${id}: client zone does not match the reviewed quest context`);
      }
    }
    if (record.reuseSameEnglish !== undefined && record.reuseSameEnglish !== true) {
      throw new Error(`${id}: reuseSameEnglish must be true in ${file}`);
    }
    if (record.alsoStartsAt !== undefined && record.alsoStartsAt !== true) {
      throw new Error(`${id}: alsoStartsAt must be true in ${file}`);
    }
    for (const language of Object.keys(languages)) {
      if (record[language] === undefined && record.authoredFallbackLanguages &&
        !record.authoredFallbackLanguages.includes(language)) continue;
      if (typeof record[language] !== "string" || !record[language].trim() || record[language] === record.en) {
        throw new Error(`${id}: missing ${language} translation in ${file}`);
      }
    }
    if (record.clientSkillId) {
      const index = indexByKey.get(`SkillLine:${record.clientSkillId}:0`);
      if (index === undefined || !record.en.includes(source.values[index])) {
        throw new Error(`${id}: client skill does not match English quest title`);
      }
    }
    titles.set(id, record);
  }
}

const resolvedTitles = new Map();
for (const [id, record] of titles) {
  const ids = record.reuseSameEnglish
    ? Object.entries(english.map.questMarkers).filter(([, marker]) => marker.name === record.en).map(([key]) => key)
    : [id];
  for (const markerId of ids) {
    if (resolvedTitles.has(markerId)) throw new Error(`${markerId}: reviewed title collision`);
    if (record.alsoStartsAt && english.map.questMarkers[markerId].startsAt !== record.en) {
      throw new Error(`${markerId}: reviewed object name does not match the quest title`);
    }
    if (record.contextEndAt && english.map.questMarkers[markerId].endsAt !== record.contextEndAt) {
      throw new Error(`${markerId}: quest destination does not match the reviewed zone context`);
    }
    resolvedTitles.set(markerId, record);
  }
}
const camping = await read(join(directory, "camping-101.json"));
for (const language of Object.keys(languages)) {
  const template = camping.templates[language];
  if (typeof template !== "string" || (template.match(/\{\{skill(?:Lower)?\}\}/g) ?? []).length !== 1) {
    throw new Error(`${language}: invalid Camping 101 title template`);
  }
}
let campingCount = 0;
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  const match = /^Camping 101: (.+)$/.exec(marker.name);
  if (!match) continue;
  const skillId = camping.skillIds[match[1]];
  const index = indexByKey.get(`SkillLine:${skillId}:0`);
  if (index === undefined || source.values[index] !== match[1]) {
    throw new Error(`${id}: Camping 101 skill is not verified in the client`);
  }
  if (resolvedTitles.has(id)) throw new Error(`${id}: Camping 101 title overlaps a reviewed title`);
  resolvedTitles.set(id, { en: marker.name, clientSkillId: skillId, camping: true });
  campingCount += 1;
}
const clientSpellTitles = await read(join(directory, "client-spell-titles.json"));
let spellCount = 0;
for (const [name, context] of Object.entries(clientSpellTitles)) {
  if (!spellIndicesByName.has(name)) throw new Error(`${name}: no matching client spell name`);
  if (context.clientKey) {
    const index = indexByKey.get(context.clientKey);
    if (index === undefined || source.values[index] !== name || !context.clientKey.startsWith("SpellName:")) {
      throw new Error(`${name}: selected client spell key does not match the title`);
    }
  }
  const matching = Object.entries(english.map.questMarkers)
    .filter(([, marker]) => marker.name === name);
  if (!matching.length) throw new Error(`${name}: no matching quest marker`);
  for (const [id, marker] of matching) {
    if (context.requiredClass && marker.requiredClass !== context.requiredClass) {
      throw new Error(`${id}: quest class does not match ${name}`);
    }
    if (context.requiredProfession &&
      !marker.requiredProfession?.startsWith(`${context.requiredProfession} (`)) {
      throw new Error(`${id}: quest profession does not match ${name}`);
    }
    if (resolvedTitles.has(id)) throw new Error(`${id}: client spell title overlaps another title`);
    resolvedTitles.set(id, { en: name, clientSpellName: name, clientSpellKey: context.clientKey });
    spellCount += 1;
  }
}
const clientEntityTitles = await read(join(directory, "client-entity-titles.json"));
let entityCount = 0;
for (const [name, clientKey] of Object.entries(clientEntityTitles)) {
  const index = indexByKey.get(clientKey);
  if (index === undefined || source.values[index] !== name) {
    throw new Error(`${name}: client entity key does not match the quest title`);
  }
  const matching = Object.entries(english.map.questMarkers)
    .filter(([, marker]) => marker.name === name);
  if (!matching.length) throw new Error(`${name}: no matching quest marker`);
  for (const [id] of matching) {
    if (resolvedTitles.has(id)) throw new Error(`${id}: client entity title overlaps another title`);
    resolvedTitles.set(id, { en: name, clientKey });
    entityCount += 1;
  }
}
const druidGuideNames = await read("data/guide-localization/druid-quest-names.json");
let druidCount = 0;
for (const name of Object.keys(druidGuideNames.de.names)) {
  const matching = Object.entries(english.map.questMarkers)
    .filter(([, marker]) => marker.name === name);
  if (!matching.length) throw new Error(`${name}: no matching Druid quest marker`);
  for (const language of Object.keys(languages)) {
    if (!druidGuideNames[language]?.names?.[name]) {
      throw new Error(`${language}: missing Druid guide quest title ${name}`);
    }
  }
  for (const [id] of matching) {
    if (resolvedTitles.has(id)) throw new Error(`${id}: Druid guide title overlaps another title`);
    resolvedTitles.set(id, { en: name, druidGuideName: true });
    druidCount += 1;
  }
}
const shamanGuideNames = await read("data/guide-localization/shaman-quest-names.json");
let shamanCount = 0;
for (const name of Object.keys(shamanGuideNames.de)) {
  const matching = Object.entries(english.map.questMarkers)
    .filter(([, marker]) => marker.name === name && marker.requiredClass === "Shaman");
  if (!matching.length) throw new Error(`${name}: no matching Shaman quest marker`);
  for (const language of Object.keys(languages)) {
    if (!shamanGuideNames[language]?.[name]) {
      throw new Error(`${language}: missing Shaman guide quest title ${name}`);
    }
  }
  for (const [id] of matching) {
    if (resolvedTitles.has(id)) throw new Error(`${id}: Shaman guide title overlaps another title`);
    resolvedTitles.set(id, { en: name, shamanGuideName: true });
    shamanCount += 1;
  }
}
const paladinGuideNames = await read("data/guide-localization/paladin-quest-names.json");
let paladinCount = 0;
for (const name of Object.keys(paladinGuideNames.de)) {
  const matching = Object.entries(english.map.questMarkers)
    .filter(([, marker]) => marker.name === name && marker.requiredClass === "Paladin");
  if (!matching.length) throw new Error(`${name}: no matching Paladin quest marker`);
  for (const language of Object.keys(languages)) {
    if (!paladinGuideNames[language]?.[name]) {
      throw new Error(`${language}: missing Paladin guide quest title ${name}`);
    }
  }
  for (const [id] of matching) {
    if (resolvedTitles.has(id)) throw new Error(`${id}: Paladin guide title overlaps another title`);
    resolvedTitles.set(id, { en: name, paladinGuideName: true });
    paladinCount += 1;
  }
}
let npcNameCount = 0;
for (const name of Object.keys(npcNames)) {
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    if (marker.name !== name) continue;
    if (resolvedTitles.has(id)) throw new Error(`${id}: NPC name title overlaps another title`);
    resolvedTitles.set(id, { en: name, clientNpcName: true });
    npcNameCount += 1;
  }
}

const check = process.argv.includes("--check");
for (const [language, gameLocale] of Object.entries(languages)) {
  const file = `src/i18n/locales/${language}.json`;
  const locale = await read(file);
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  const mapEntityPack = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
  let communityCount = 0;
  for (const [id, record] of resolvedTitles) {
    const index = record.clientSkillId ? indexByKey.get(`SkillLine:${record.clientSkillId}:0`) : undefined;
    const skill = index === undefined ? undefined : pack.values[index];
    if (record.camping && !skill) throw new Error(`${language}/${id}: client skill name is unavailable`);
    const spellValues = record.clientSpellName
      ? [...new Set((record.clientSpellKey
        ? [indexByKey.get(record.clientSpellKey)] : spellIndicesByName.get(record.clientSpellName))
        .map((spellIndex) => pack.values[spellIndex]).filter(Boolean))] : [];
    if (record.clientSpellName && spellValues.length !== 1) {
      throw new Error(`${language}/${id}: client spell name is unavailable or ambiguous`);
    }
    const entity = record.clientKey ? pack.values[indexByKey.get(record.clientKey)] : undefined;
    if (record.clientKey && !entity) throw new Error(`${language}/${id}: client entity name is unavailable`);
    const druidGuideTitle = record.druidGuideName
      ? druidGuideNames[language].names[record.en].replace(
        /\{\{CLIENT:([A-Za-z]+:\d+:\d+)\|([^}]+)\}\}/g, (_, key, expected) => {
          const clientIndex = indexByKey.get(key);
          if (clientIndex === undefined || source.values[clientIndex] !== expected ||
            !pack.values[clientIndex]) {
            throw new Error(`${language}/${id}: unavailable Druid guide client term ${key}`);
          }
          return pack.values[clientIndex];
        }) : undefined;
    if (record.druidGuideName && druidGuideTitle.includes("{{CLIENT:")) {
      throw new Error(`${language}/${id}: unresolved Druid guide client term`);
    }
    const creature = record.clientNpcName &&
      creatureNames[record.en]?.sourcePriority === "client-creature"
      ? creatureNames[record.en] : undefined;
    if (creature?.[language] && !creature.npcIds.every((npcId) => {
      const creatureIndex = mapEntityIndexByKey.get(`Creature:${npcId}:0`);
      return mapEntitySource.values[creatureIndex] === record.en &&
        mapEntityPack.values[creatureIndex] === creature[language];
    })) throw new Error(`${language}/${id}: reviewed NPC title differs from client creature`);
    let translation = record.druidGuideName ? druidGuideTitle
      : record.shamanGuideName ? shamanGuideNames[language][record.en] : record.clientKey ? entity
      : record.paladinGuideName ? paladinGuideNames[language][record.en]
      : record.clientNpcName ? (creature?.[language] ?? `{{NPC:${record.en}}}`)
      : record.clientSpellName ? spellValues[0] : record.camping
      ? camping.templates[language].replace(/\{\{skill(Lower)?\}\}/g,
        (_, lower) => lower ? skill.toLocaleLowerCase(language) : skill)
      : record[language] ?? mapEntityPack.values[
        mapEntityIndexByKey.get(`Quest:${record.mapEntityQuestId}:0`)];
    if (typeof translation !== "string" || !translation.trim()) {
      throw new Error(`${language}/${id}: no game or reviewed title available`);
    }
    translation = translation.replace(/\{\{CLIENT:([A-Za-z]+:\d+:\d+)\|([^}]+)\}\}/g,
      (_, key, expected) => {
        const clientIndex = indexByKey.get(key);
        if (clientIndex === undefined || source.values[clientIndex] !== expected ||
          !record.en.includes(expected) || !pack.values[clientIndex]) {
          throw new Error(`${language}/${id}: unavailable reviewed client term ${key}`);
        }
        return pack.values[clientIndex];
      });
    if (record.clientZoneKey) {
      const zone = pack.values[indexByKey.get(record.clientZoneKey)];
      if (!zone || !translation.includes("{{ZONE}}")) {
        throw new Error(`${language}/${id}: reviewed zone is unavailable`);
      }
      translation = translation.replace("{{ZONE}}", zone);
    }
    translation = translation.replace(/\{\{NPC:([^}]+)\}\}/g, (_, name) => {
      const npc = npcNames[name];
      const clientIndex = npc ? indexByKey.get(npc.sourceKey) : undefined;
      const localized = npc?.[language];
      const anchor = npc?.clientAnchors?.[language] ?? localized;
      if (!record.en.includes(name) || clientIndex === undefined ||
        !source.values[clientIndex].includes(name) || !localized || !anchor ||
        !localized.toLocaleLowerCase(language).includes(anchor.toLocaleLowerCase(language)) ||
        !pack.values[clientIndex]?.toLocaleLowerCase(language)
          .includes(anchor.toLocaleLowerCase(language))) {
        throw new Error(`${language}/${id}: unavailable reviewed NPC name ${name}`);
      }
      return localized;
    });
    if (translation.includes("{{CLIENT:") || translation.includes("{{NPC:")) {
      throw new Error(`${language}/${id}: unresolved reviewed game term`);
    }
    if (record.clientTermKey) {
      const term = pack.values[indexByKey.get(record.clientTermKey)];
      if (!term || !translation.toLocaleLowerCase(language).includes(term.toLocaleLowerCase(language))) {
        throw new Error(`${language}/${id}: reviewed title does not use the client term`);
      }
    }
    if (record.clientItemKey) {
      const clientItem = pack.values[indexByKey.get(record.clientItemKey)];
      if (!clientItem || !comparable(translation).includes(comparable(clientItem))) {
        throw new Error(`${language}/${id}: reviewed title does not use the client item name`);
      }
    }
    if (record.clientMapKey) {
      const clientMap = pack.values[indexByKey.get(record.clientMapKey)];
      const titleForm = language === "de" && clientMap === "Östliche Königreiche"
        ? "Östlichen Königreiche" : clientMap;
      if (!clientMap || !comparable(translation).includes(comparable(titleForm))) {
        throw new Error(`${language}/${id}: title does not use the installed client map name`);
      }
    }
    if (record.mapEntityQuestId) {
      const official = mapEntityPack.values[mapEntityIndexByKey.get(`Quest:${record.mapEntityQuestId}:0`)];
      if (official && translation !== official) {
        throw new Error(`${language}/${id}: reviewed title conflicts with available game quest title`);
      }
      if (record.authoredFallbackLanguages &&
        record.authoredFallbackLanguages.includes(language) !== !official) {
        throw new Error(`${language}/${id}: authored fallback provenance no longer matches game data`);
      }
    }
    if (record.clientSkillId) {
      if (!skill || !translation.toLocaleLowerCase(language)
        .includes(skill.toLocaleLowerCase(language))) {
        throw new Error(`${language}/${id}: title does not use the installed client skill name`);
      }
    }
    const target = locale.map.questMarkers[id] ??= {};
    if (target.name && target.name !== translation) {
      throw new Error(`${language}/${id}: existing game title conflicts with reviewed title`);
    }
    target.name = translation;
    if (record.alsoStartsAt) {
      if (target.startsAt && target.startsAt !== translation) {
        throw new Error(`${language}/${id}: existing object name conflicts with reviewed title`);
      }
      target.startsAt = translation;
    }
    if (english.map.mapgenieCommunity?.[id]?.name === record.en) {
      const community = locale.map.mapgenieCommunity[id] ??= {};
      if (community.name && community.name !== translation) {
        throw new Error(`${language}/${id}: community quest title conflicts with reviewed title`);
      }
      community.name = translation;
      communityCount += 1;
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  const path = join(root, file);
  if (check) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: quest titles are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${resolvedTitles.size} quest markers and ${communityCount} community labels from ${titles.size} reviewed titles, ${campingCount} client-skill markers, ${spellCount} client-spell markers, ${entityCount} client-entity markers, ${druidCount} Druid-guide markers, ${shamanCount} Shaman-guide markers, ${paladinCount} Paladin-guide markers, ${npcNameCount} client-NPC markers`);
}
