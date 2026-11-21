import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await readJson("src/i18n/locales/en.json");
const source = await readJson("public/data/locales/wow-forever/source.json");
const entitySource = await readJson("public/data/locales/wow-forever/map-entity-source.json");
const mexicanFallback = await readJson("data/app-localization/esmx-regional-map-fallback.json");
const alternateClientPlaces = await readJson(
  "data/map-context-localization/reviewed-alternate-client-place-names.json");
const alternateClientPlaceByPath = new Map(alternateClientPlaces.map((row) =>
  [`${row.language}/${row.target}`, row.sourceKey]));
const alternateFlightPoints = await readJson(
  "data/map-context-localization/reviewed-alternate-client-flight-points.json");
const alternateFlightPointByPath = new Map(alternateFlightPoints.map((row) =>
  [`${row.language}/map.publishedFlightPoints.${row.id}`, row]));
const byKey = new Map(source.keys.map((key, index) => [key, index]));
const entityByKey = new Map(entitySource.keys.map((key, index) => [key, index]));
const alternateValue = (key, pack, entityPack) => key.startsWith("Quest:")
  ? entityPack.values[entityByKey.get(key)]
  : pack.values[byKey.get(key)];
const indicesByName = new Map();
source.keys.forEach((key, index) => {
  const [table, , column] = key.split(":");
  const match = `${table}:${column}:${source.values[index]}`;
  if (!indicesByName.has(match)) indicesByName.set(match, []);
  indicesByName.get(match).push(index);
});
const locales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const professionSkillIds = {
  Alchemy: 171, Blacksmithing: 164, Enchanting: 333, Engineering: 202,
  Herbalism: 182, Leatherworking: 165, Mining: 186, Skinning: 393,
  Tailoring: 197, Cooking: 185, "First Aid": 129, Fishing: 356,
};
const reviewedTitleIds = new Set();
const reviewedObjectStartIds = new Set();
const titleDirectory = join(root, "data/quest-title-localization");
for (const file of (await readdir(titleDirectory)).filter((name) => /^reviewed-.*\.json$/.test(name))) {
  const titles = await readJson(`data/quest-title-localization/${file}`);
  for (const [id, record] of Object.entries(titles)) {
    const matchingIds = record.reuseSameEnglish
      ? Object.entries(english.map.questMarkers)
        .filter(([, marker]) => marker.name === record.en).map(([markerId]) => markerId)
      : [id];
    for (const markerId of matchingIds) {
      reviewedTitleIds.add(markerId);
      if (record.alsoStartsAt) reviewedObjectStartIds.add(markerId);
    }
  }
}
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  if (/^Camping 101: /.test(marker.name)) reviewedTitleIds.add(id);
}
const druidGuideNames = await readJson("data/guide-localization/druid-quest-names.json");
const druidQuestTitles = new Set(Object.keys(druidGuideNames.de.names));
const shamanGuideNames = await readJson("data/guide-localization/shaman-quest-names.json");
const shamanQuestTitles = new Set(Object.keys(shamanGuideNames.de));
const paladinGuideNames = await readJson("data/guide-localization/paladin-quest-names.json");
const paladinQuestTitles = new Set(Object.keys(paladinGuideNames.de));
const pfQuestNpcNames = new Set(Object.keys((await readJson(
  "data/npc-name-localization/pfquest-classic-names.json")).names));
const polestarForeverNpcNames = new Set(Object.keys((await readJson(
  "data/npc-name-localization/polestar-forever-names.json")).names));
const reviewedNpcNames = new Set([...Object.keys(await readJson(
  "data/npc-name-localization/reviewed-client-evidence.json")), ...pfQuestNpcNames,
  ...polestarForeverNpcNames]);
const pfQuestClassicTitles = new Set(Object.keys((await readJson(
  "data/quest-title-localization/pfquest-classic-titles.json")).titles));
const polestarForeverTitles = new Set(Object.keys((await readJson(
  "data/quest-title-localization/polestar-forever-titles.json")).titles));
const communityServiceLabels = await readJson("data/map-community-localization/service-labels.json");
const partialForeverTitles = (await readJson(
  "data/quest-title-localization/polestar-forever-partial-titles.json")).titles;
const partialClassicTitles = (await readJson(
  "data/quest-title-localization/pfquest-classic-partial-titles.json")).titles;
const invariantNpcQuestTitles = (await readJson(
  "data/quest-title-localization/invariant-npc-quest-titles.json")).names;
const reviewedMapEntityNames = {
  ...await readJson("data/quest-marker-localization/reviewed-entity-names.json"),
  ...await readJson("data/quest-marker-localization/reviewed-classic-npc-gaps.json"),
  ...await readJson("data/quest-marker-localization/reviewed-partial-entity-names.json"),
};
const reviewedQuestTextTitles = await readJson(
  "data/quest-marker-localization/reviewed-quest-text-titles.json");
const reviewedQuestTextTitleByMarker = new Map(Object.entries(reviewedQuestTextTitles)
  .flatMap(([name, entry]) => entry.markerIds.map((id) => [id, { name, entry }])));
const authoredPartialQuestTitles = await readJson(
  "data/quest-title-localization/authored-partial-quest-titles.json");
const authoredPartialQuestTitleByMarker = new Map(Object.values(authoredPartialQuestTitles)
  .flatMap((entry) => entry.markerIds.map((id) => [id, entry])));
const mapSeededNpcNames = (await readJson(
  "data/npc-name-localization/map-seeded-forever-names.json")).names;
const authoredKoreanNpcNames = await readJson(
  "data/npc-name-localization/authored-korean-map-fallbacks.json");
const authoredChineseNpcNames = await readJson(
  "data/npc-name-localization/authored-chinese-map-fallbacks.json");
const authoredWesternNpcNames = (await readJson(
  "data/npc-name-localization/authored-western-map-fallbacks.json")).names;
const authoredNpcName = (language, original) =>
  authoredWesternNpcNames[original]?.[language] ?? (language === "ko"
    ? authoredKoreanNpcNames[original]
    : authoredChineseNpcNames[original]?.[language]);
const isMexicanFallback = (language, path, original, translated) => {
  const record = language === "es-MX" ? mexicanFallback.fields[path] : undefined;
  return record?.english === original && record?.spanish === translated;
};
const foreverObjectNames = (await readJson(
  "data/object-name-localization/polestar-forever-objects.json")).names;
const reviewedTraditionalObjects = await readJson(
  "data/object-name-localization/reviewed-hant-fallbacks.json");
const reviewedTraditionalNpcNames = await readJson(
  "data/npc-name-localization/reviewed-hant-npc-fallbacks.json");
const reviewedCrossFieldReuse = await readJson(
  "data/quest-marker-localization/reviewed-cross-field-reuse.json");
const authoredPortugueseObjects = await readJson(
  "data/object-name-localization/authored-pt-map-objects.json");
const reviewedQuestSourceNotes = await readJson(
  "data/map-context-localization/quest-source-notes.json");
const gatherableCatalogs = await Promise.all((await readdir(join(root, "data/map-context-localization")))
  .filter((name) => /^gatherable-types.*\.json$/.test(name)).sort()
  .map((name) => readJson(`data/map-context-localization/${name}`)));
const reviewedGatherableTypes = Object.fromEntries(Object.keys(locales).map((language) =>
  [language, { gatherableTypes: Object.assign({}, ...gatherableCatalogs.map((catalog) =>
    (catalog[language] ?? (language === "es-MX" ? catalog.es : undefined))?.gatherableTypes ?? {})) }]));
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  if (druidQuestTitles.has(marker.name) ||
    (marker.requiredClass === "Shaman" && shamanQuestTitles.has(marker.name)) ||
    (marker.requiredClass === "Paladin" && paladinQuestTitles.has(marker.name)) ||
    reviewedNpcNames.has(marker.name) || pfQuestClassicTitles.has(marker.name) ||
    polestarForeverTitles.has(marker.name)) {
    reviewedTitleIds.add(id);
  }
}

test("staged map names come from the client locale or a reviewed map catalog", async () => {
  let checked = 0;
  for (const [language, gameLocale] of Object.entries(locales)) {
    const locale = await readJson(`src/i18n/locales/${language}.json`);
    const translated = locale.map;
    const pack = await readJson(`public/data/locales/wow-forever/${gameLocale}.json`);
    const entityPack = await readJson(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
    const questTitlesByEnglish = new Map();
    entitySource.keys.forEach((key, index) => {
      if (!/^Quest:\d+:0$/.test(key) || !entityPack.values[index]) return;
      const englishTitle = entitySource.values[index].toLocaleLowerCase("en-US");
      const names = questTitlesByEnglish.get(englishTitle) ?? new Set();
      names.add(entityPack.values[index]);
      questTitlesByEnglish.set(englishTitle, names);
    });
    assert.ok(translated, `${language}: no staged map names`);
    for (const [field, table, column] of [
      ["instanceEncounters", "DungeonEncounter", 0], ["publishedAreaNames", "AreaTable", 1],
      ["thunderBluffSigns", "GameObjects", 0],
      ["publishedFlightPoints", "TaxiNodes", 0],
    ]) {
      for (const [id, label] of Object.entries(translated[field] ?? {})) {
        if (!/^\d+$/.test(id)) continue; // UI labels in the same group are reviewed separately.
        const index = byKey.get(`${table}:${id}:${column}`);
        assert.equal(source.values[index], english.map[field][id]);
        const alternateKey = alternateClientPlaceByPath.get(`${language}/map.${field}.${id}`);
        const flightPoint = alternateFlightPointByPath.get(`${language}/map.${field}.${id}`);
        const expected = flightPoint
          ? english.map[field][id].replace(flightPoint.englishPart,
            alternateValue(flightPoint.sourceKey, pack, entityPack))
          : alternateKey ? alternateValue(alternateKey, pack, entityPack) : pack.values[index];
        assert.equal(label, expected,
          `${language}/${field}/${id}`);
        checked += 1;
      }
    }
    for (const [field, table, column] of [
      ...["publishedSettlements", "publishedSettlementRegions",
        "publishedBattlegroundObjectives", "publishedPointsOfInterest"].map((field) => [field, "AreaTable", 1]),
      ["gatherableTypes", "ItemSparse", 4],
    ]) {
      for (const [id, label] of Object.entries(translated[field] ?? {})) {
        const original = english.map[field][id];
        const reviewedGatherable = field === "gatherableTypes"
          ? reviewedGatherableTypes[language].gatherableTypes[id] : undefined;
        if (reviewedGatherable !== undefined) {
          assert.equal(label, reviewedGatherable, `${language}/${field}/${id}`);
          checked += 1;
          continue;
        }
        const matchingValues = (indicesByName.get(`${table}:${column}:${original}`) ?? [])
          .map((index) => pack.values[index]);
        if (field === "publishedSettlements" && id === "16" && original === "Stormwind") {
          const stormwindCityIndex = byKey.get("AreaTable:1519:1");
          assert.equal(source.values[stormwindCityIndex], "Stormwind City");
          matchingValues.push(pack.values[stormwindCityIndex]);
        }
        const poiIndex = byKey.get(`AreaPOI:${id}:0`);
        if (poiIndex !== undefined && source.values[poiIndex] === original) {
          matchingValues.push(pack.values[poiIndex]);
        }
        if (field === "publishedPointsOfInterest") {
          matchingValues.push(...(indicesByName.get(`GameObjects:0:${original}`) ?? [])
            .map((index) => pack.values[index]));
        }
        const alternateKey = alternateClientPlaceByPath.get(`${language}/map.${field}.${id}`);
        if (alternateKey) matchingValues.push(alternateValue(alternateKey, pack, entityPack));
        assert.ok(matchingValues.includes(label), `${language}/${field}/${id}: ${label}`);
        checked += 1;
      }
    }
    for (const [id, label] of Object.entries(translated.publishedWorldObjectives ?? {})) {
      const index = byKey.get(`AreaPOI:${id}:0`);
      assert.equal(source.values[index], english.map.publishedWorldObjectives[id]);
      assert.equal(label, pack.values[index], `${language}/publishedWorldObjectives/${id}`);
      checked += 1;
    }
    for (const [id, record] of Object.entries(translated.classTrainers ?? {})) {
      const original = english.map.classTrainers[id].class;
      if (original === "Weapon Master") continue; // Role title, not a ChrClasses entry.
      const labels = (indicesByName.get(`ChrClasses:0:${original}`) ?? [])
        .map((index) => pack.values[index]);
      assert.ok(labels.includes(record.class), `${language}/classTrainers/${id}`);
      checked += 1;
    }
    for (const [id, label] of Object.entries(translated.books?.names ?? {})) {
      const original = english.map.books.names[id];
      const matches = (indicesByName.get(`ItemSparse:4:${original}`) ?? [])
        .map((index) => pack.values[index]);
      assert.deepEqual(matches, [label], `${language}/books/names/${id}`);
      checked += 1;
    }
    for (const [id, record] of Object.entries(translated.mapgenieCommunity ?? {})) {
      if (!record.name || (reviewedTitleIds.has(id) &&
        english.map.mapgenieCommunity[id]?.name === english.map.questMarkers[id]?.name)) continue;
      const original = english.map.mapgenieCommunity[id].name;
      if (isMexicanFallback(language, `map.mapgenieCommunity.${id}.name`,
        original, record.name)) {
        checked += 1;
        continue;
      }
      if (mapSeededNpcNames[original]?.[language] === record.name) {
        checked += 1;
        continue;
      }
      if (authoredNpcName(language, original) === record.name) {
        checked += 1;
        continue;
      }
      if (reviewedMapEntityNames[original]?.[language] === record.name) {
        checked += 1;
        continue;
      }
      if (language === "zh-Hant" &&
        reviewedTraditionalNpcNames[original]?.[language] === record.name) {
        checked += 1;
        continue;
      }
      if (partialForeverTitles[original]?.[language] === record.name) {
        checked += 1;
        continue;
      }
      if (communityServiceLabels[original]) {
        assert.equal(record.name, communityServiceLabels[original][language],
          `${language}/mapgenieCommunity/${id}/name`);
        checked += 1;
        continue;
      }
      if (pfQuestNpcNames.has(original) || polestarForeverNpcNames.has(original)) continue;
      const matches = [["AreaTable", 1], ["Map", 1], ["LFGDungeons", 0],
        ["AreaPOI", 0], ["WMOAreaTable", 0], ["ItemSparse", 4], ["SpellName", 0],
        ["DungeonEncounter", 0], ["Faction", 0]]
        .flatMap(([table, column]) =>
        (indicesByName.get(`${table}:${column}:${original}`) ?? [])
          .map((index) => pack.values[index]));
      if (original === "Mailbox") matches.push(translated.categories.mailbox);
      assert.ok(matches.includes(record.name),
        `${language}/mapgenieCommunity/${id}/name: ${record.name}`);
      checked += 1;
    }
    for (const [id, original] of Object.entries(english.map.instanceCoverage.names ?? {})) {
      if (!communityServiceLabels[original]) continue;
      assert.equal(translated.instanceCoverage.names[id], communityServiceLabels[original][language],
        `${language}/instanceCoverage/names/${id}`);
      checked += 1;
    }
    const professionNames = (await readJson(`src/i18n/locales/${language}.json`)).professions?.names ?? {};
    for (const [id, label] of Object.entries(professionNames)) {
      const original = english.professions.names[id];
      const index = byKey.get(`SkillLine:${professionSkillIds[original]}:0`);
      assert.equal(label, pack.values[index], `${language}/professions.names/${id}`);
      checked += 1;
    }
    const translatedQuests = translated.questMarkers ?? {};
    const localizedName = (table, original) => {
      const names = new Set((indicesByName.get(`${table}:0:${original}`) ?? [])
        .map((index) => pack.values[index]).filter(Boolean));
      assert.equal(names.size, 1, `${language}: ambiguous ${table} name ${original}`);
      return [...names][0];
    };
    for (const [id, record] of Object.entries(translatedQuests)) {
      const original = english.map.questMarkers[id];
      for (const field of ["name", "startsAt", "endsAt"]) {
        const crossField = reviewedCrossFieldReuse.find((row) =>
          row.language === language && row.target === `map.questMarkers.${id}.${field}`);
        if (crossField) {
          const sourceValue = crossField.source.split(".").reduce(
            (node, part) => node?.[part], locale);
          assert.equal(record[field], sourceValue, `${language}/questMarkers/${id}/${field}`);
          checked += 1;
          continue;
        }
        if (isMexicanFallback(language, `map.questMarkers.${id}.${field}`,
          original[field], record[field])) {
          checked += 1;
          continue;
        }
        if (field === "startsAt" && reviewedQuestSourceNotes[id]?.[language] === record[field]) {
          checked += 1;
          continue;
        }
        if (foreverObjectNames[original[field]]?.[language] === record[field]) {
          checked += 1;
          continue;
        }
        if (language === "zh-Hant" && field !== "name" &&
          reviewedTraditionalObjects[original[field]]?.[language] === record[field]) {
          checked += 1;
          continue;
        }
        const authoredObject = language === "pt-BR" ? authoredPortugueseObjects[id] : undefined;
        if (authoredObject?.fields.includes(field) && authoredObject.en === original[field] &&
          authoredObject[language] === record[field]) {
          checked += 1;
          continue;
        }
        if (field !== "name" && mapSeededNpcNames[original[field]]?.[language] === record[field]) {
          checked += 1;
          continue;
        }
        if (language === "zh-Hant" && field !== "name" &&
          reviewedTraditionalNpcNames[original[field]]?.[language] === record[field]) {
          checked += 1;
          continue;
        }
        if (field !== "name" && authoredNpcName(language, original[field]) === record[field]) {
          checked += 1;
          continue;
        }
        if (field === "name" && partialForeverTitles[original.name]?.[language] === record.name) {
          checked += 1;
          continue;
        }
        if (field === "name" && partialClassicTitles[original.name]?.[language] === record.name) {
          checked += 1;
          continue;
        }
        if (field === "name" && invariantNpcQuestTitles[original.name]?.[language] === record.name) {
          checked += 1;
          continue;
        }
        if (field === "name" &&
          questTitlesByEnglish.get(original.name.toLocaleLowerCase("en-US"))?.has(record.name)) {
          checked += 1;
          continue;
        }
        if (field === "name" &&
          english.map.mapgenieCommunity[id]?.name === original.name &&
          translated.mapgenieCommunity[id]?.name === record.name) {
          checked += 1;
          continue;
        }
        if (field === "name" && authoredPartialQuestTitleByMarker.get(id)?.en === original.name &&
          authoredPartialQuestTitleByMarker.get(id)?.locales?.[language] === record.name) {
          checked += 1;
          continue;
        }
        const reviewedTextTitle = field === "name"
          ? reviewedQuestTextTitleByMarker.get(id) : undefined;
        if (reviewedTextTitle?.name === original.name &&
          (reviewedTextTitle.entry.translations?.[language] === record.name ||
            (reviewedTextTitle.entry.invariantLanguages?.includes(language) &&
              record.name === original.name))) {
          checked += 1;
          continue;
        }
        const reviewedEntity = reviewedMapEntityNames[original[field]];
        if (reviewedEntity?.[language] === record[field] &&
          (field !== "name" || reviewedEntity.includeQuestTitles)) {
          checked += 1;
          continue;
        }
        if (field === "startsAt" && reviewedObjectStartIds.has(id)) {
          assert.equal(record.startsAt, record.name, `${language}/questMarkers/${id}/startsAt`);
          continue;
        }
        if (!record[field] || (field === "name" && reviewedTitleIds.has(id)) ||
          (field !== "name" && reviewedNpcNames.has(original[field]))) continue;
        const tables = field === "name"
          ? [["ItemSparse", 4], ["AreaTable", 1], ["SpellName", 0], ["Map", 1],
            ["LFGDungeons", 0], ["DungeonEncounter", 0], ["Faction", 0],
            ["WMOAreaTable", 0], ["LockType", 1]]
          : [["ItemSparse", 4], ["DungeonEncounter", 0], ["Faction", 0],
            ["SpellFocusObject", 0]];
        const matches = tables.flatMap(([table, column]) =>
          (indicesByName.get(`${table}:${column}:${original[field]}`) ?? [])
            .map((index) => pack.values[index]));
        assert.ok(matches.includes(record[field]),
          `${language}/questMarkers/${id}/${field}: ${record[field]}`);
        checked += 1;
      }
      if (record.requiredClass) {
        const separator = language.startsWith("zh") ? "、" : ", ";
        const expected = original.requiredClass.split(", ")
          .map((name) => localizedName("ChrClasses", name)).join(separator);
        assert.equal(record.requiredClass, expected, `${language}/questMarkers/${id}/requiredClass`);
        checked += 1;
      }
      if (record.requiredProfession) {
        const [, name, level] = original.requiredProfession.match(/^(.+) \((\d+)\)$/) ?? [];
        const index = byKey.get(`SkillLine:${professionSkillIds[name]}:0`);
        assert.equal(record.requiredProfession, `${pack.values[index]} (${level})`,
          `${language}/questMarkers/${id}/requiredProfession`);
        checked += 1;
      }
    }
  }
  assert.ok(checked > 4000, `Expected thousands of verified map names, got ${checked}`);
});

test("quest NPC region labels use both localized client place names", async () => {
  const regions = [
    ["gerrig-bonegrip", "AreaTable:1537:1", "WMOAreaTable:15634:0"],
    ["high-explorer-magellas", "AreaTable:1537:1", "WMOAreaTable:15583:0"],
    ["high-tinker-mekkatorque", "AreaTable:1537:1", "WMOAreaTable:15678:0"],
    ["lady-dena-kennedy", "AreaTable:1519:1", "WMOAreaTable:14618:0"],
    ["librarian-mae-paledust", "AreaTable:1537:1", "WMOAreaTable:15660:0"],
    ["neeru-fireblade", "AreaTable:1637:1", "WMOAreaTable:32214:0"],
    ["nikova-raskol", "AreaTable:1519:1", "WMOAreaTable:34470:0"],
    ["shoni-the-shilent", "AreaTable:1519:1", "WMOAreaTable:43646:0"],
    ["thrall", "AreaTable:1637:1", "WMOAreaTable:13918:0"],
    ["varimathras", "AreaTable:1497:1", "WMOAreaTable:15148:0"],
  ];
  for (const [language, gameLocale] of Object.entries(locales)) {
    const app = await readJson(`src/i18n/locales/${language}.json`);
    const pack = await readJson(`public/data/locales/wow-forever/${gameLocale}.json`);
    for (const [id, cityKey, districtKey] of regions) {
      const cityIndex = byKey.get(cityKey);
      const districtIndex = byKey.get(districtKey);
      assert.equal(english.map.questNpcs.regions[id],
        `${source.values[cityIndex]}, ${source.values[districtIndex]}`, id);
      assert.equal(app.map.questNpcs.regions[id],
        `${pack.values[cityIndex]}, ${pack.values[districtIndex]}`, `${language}/${id}`);
    }
  }
});
