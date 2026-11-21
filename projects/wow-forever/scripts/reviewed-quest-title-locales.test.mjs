import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const reviewed = {
  ...await read("data/quest-title-localization/reviewed-03.json"),
  ...await read("data/quest-title-localization/reviewed-04.json"),
  ...await read("data/quest-title-localization/reviewed-05.json"),
  ...await read("data/quest-title-localization/reviewed-06.json"),
  ...await read("data/quest-title-localization/reviewed-07.json"),
  ...await read("data/quest-title-localization/reviewed-08.json"),
  ...await read("data/quest-title-localization/reviewed-09.json"),
  ...await read("data/quest-title-localization/reviewed-10.json"),
  ...await read("data/quest-title-localization/reviewed-11.json"),
  ...await read("data/quest-title-localization/reviewed-12.json"),
  ...await read("data/quest-title-localization/reviewed-13.json"),
  ...await read("data/quest-title-localization/reviewed-14.json"),
  ...await read("data/quest-title-localization/reviewed-15.json"),
  ...await read("data/quest-title-localization/reviewed-16.json"),
  ...await read("data/quest-title-localization/reviewed-17.json"),
  ...await read("data/quest-title-localization/reviewed-18.json"),
  ...await read("data/quest-title-localization/reviewed-19.json"),
  ...await read("data/quest-title-localization/reviewed-20.json"),
  ...await read("data/quest-title-localization/reviewed-21.json"),
  ...await read("data/quest-title-localization/reviewed-22.json"),
  ...await read("data/quest-title-localization/reviewed-23.json"),
};
const english = await read("src/i18n/locales/en.json");

test("reviewed Forever quest titles match their map marker and community label", async () => {
  const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
  const gameSource = await read("public/data/locales/wow-forever/source.json");
  const gameCodes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
    ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  const locales = Object.fromEntries(await Promise.all(languages.map(async (language) =>
    [language, await read(`src/i18n/locales/${language}.json`)])));
  const gamePacks = Object.fromEntries(await Promise.all(languages.map(async (language) =>
    [language, await read(`public/data/locales/wow-forever/${gameCodes[language]}.json`)])));
  const mapSource = await read("public/data/locales/wow-forever/map-entity-source.json");
  const mapPacks = Object.fromEntries(await Promise.all(languages.map(async (language) =>
    [language, await read(`public/data/locales/wow-forever/map-entity-${gameCodes[language]}.json`)])));
  for (const [id, record] of Object.entries(reviewed)) {
    assert.equal(english.map.questMarkers[id].name, record.en, `English ${id}`);
    if (record.mapEntityQuestId) {
      const index = mapSource.keys.indexOf(`Quest:${record.mapEntityQuestId}:0`);
      assert.equal(mapSource.values[index]?.toLocaleLowerCase("en"),
        record.en.toLocaleLowerCase("en"), `game quest ${id}`);
    }
    for (const language of languages) {
      const locale = locales[language];
      const reviewedTitle = record[language] ?? mapPacks[language].values[
        mapSource.keys.indexOf(`Quest:${record.mapEntityQuestId}:0`)];
      assert.ok(reviewedTitle, `${language}/${id} has a title`);
      const title = reviewedTitle.replace(/\{\{CLIENT:([A-Za-z]+:\d+:\d+)\|([^}]+)\}\}/g,
        (_, key, expected) => {
          const index = gameSource.keys.indexOf(key);
          assert.equal(gameSource.values[index], expected);
          return gamePacks[language].values[index];
        });
      const ids = record.reuseSameEnglish
        ? Object.keys(english.map.questMarkers).filter((markerId) =>
          english.map.questMarkers[markerId].name === record.en) : [id];
      for (const markerId of ids) {
        assert.equal(locale.map.questMarkers[markerId]?.name, title,
          `${language}/${markerId}`);
        if (english.map.mapgenieCommunity[markerId]?.name === record.en) {
          assert.equal(locale.map.mapgenieCommunity[markerId]?.name, title,
            `${language}/${markerId} community`);
        }
      }
    }
  }
  assert.equal(english.map.questMarkers["950472"].startsAt,
    "Dull Storm Orb (Dropped by Dustwind Storm Witch)");
  assert.equal(english.map.questMarkers["1013660"].startsAt, "Zukk'ash Pod");
});

test("authored Forever quest title fallbacks cover only untranslated game rows", async () => {
  const source = await read("public/data/locales/wow-forever/map-entity-source.json");
  const packs = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
    ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  for (const [id, record] of Object.entries(reviewed).filter(([, value]) =>
    value.authoredFallbackLanguages)) {
    const index = source.keys.indexOf(`Quest:${record.mapEntityQuestId}:0`);
    assert.equal(source.values[index], record.en);
    for (const [language, gameLocale] of Object.entries(packs)) {
      const game = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
      assert.equal(record.authoredFallbackLanguages.includes(language), !game.values[index]);
      if (game.values[index] && record[language]) {
        assert.equal(record[language], game.values[index]);
      }
    }
  }
});

test("contextual Classic markers use their distinct quest translations", async () => {
  const source = await read("public/data/locales/wow-forever/map-entity-source.json");
  const questDetails = await read("public/data/quests/quest-details.json");
  const questIds = {
    "1011896": "32", "1012001": "162", "1013662": "4267",
    "1011982": "143", "1011983": "144",
    "1012784": "1181", "1012785": "1182", "1013540": "3642",
    "1013910": "5219", "1013922": "5231",
    "1012281": "495", "1012299": "518",
    "1013616": "4107", "1013621": "4112",
    "1014095": "5886", "1014100": "5891",
    "1014273": "6622", "1014275": "6624",
  };
  const packs = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
    ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  for (const [language, gameLocale] of Object.entries(packs)) {
    const locale = await read(`src/i18n/locales/${language}.json`);
    const pack = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
    for (const [markerId, questId] of Object.entries(questIds)) {
      const marker = english.map.questMarkers[markerId];
      const quest = questDetails.quests[questId];
      const index = source.keys.indexOf(`Quest:${questId}:0`);
      assert.equal(marker.name, quest.title, `${markerId}/${questId} title`);
      if (["1011896", "1012001", "1013662"].includes(markerId)) {
        assert.ok(quest.objective.includes(marker.endsAt), `${markerId}/${questId} destination`);
      }
      assert.equal(source.values[index], marker.name, `${markerId}/${questId} client source`);
      if (pack.values[index]) {
        assert.equal(locale.map.questMarkers[markerId]?.name, pack.values[index],
          `${language}/${markerId} localized title`);
      }
    }
  }
});
