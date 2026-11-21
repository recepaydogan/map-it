import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createMapEntityDictionary, getMapEntityText } from "../src/i18n/map-entity-text.ts";
import { mergeReviewedEntityNames } from "./lib/merge-reviewed-entity-names.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read("public/data/locales/wow-forever/map-entity-source.json");
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];

test("verified app and identical NPC fallbacks fill only absent map records", async () => {
  const fallbackPack = await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json");
  assert.equal(fallbackPack.version, 1);
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/map-entity-${locale}.json`);
    const fallbacks = fallbackPack.locales[locale];
    assert.ok(fallbacks, locale);
    const names = createMapEntityDictionary(source, pack, fallbacks);
    for (const [key, localized] of Object.entries(fallbacks)) {
      const index = source.keys.indexOf(key);
      assert.notEqual(index, -1, key);
      assert.equal(pack.values[index], null, `${locale}/${key} must be a client gap`);
      assert.equal(getMapEntityText(names, source.values[index], key), localized);
      assert.equal(getMapEntityText(names, "renamed map entity", key), undefined);
    }
  }
  const spanish = await read("public/data/locales/wow-forever/map-entity-esMX.json");
  const spanishFallbacks = fallbackPack.locales.esMX;
  assert.equal(spanishFallbacks["Quest:92819:0"], "Destrucción en las Minas de la Muerte");
  assert.equal(spanishFallbacks["Creature:218273:0"], "Espadachín deambulante");
  const europeanSpanish = await read("public/data/locales/wow-forever/map-entity-esES.json");
  const hemetIndex = source.keys.indexOf("Creature:715:0");
  assert.equal(spanish.values[hemetIndex], null);
  assert.equal(spanishFallbacks["Creature:715:0"], europeanSpanish.values[hemetIndex]);
  assert.equal(spanishFallbacks["Creature:268511:0"],
    fallbackPack.locales.esES["Creature:268511:0"]);
  assert.equal(spanishFallbacks["Creature:9117:0"],
    fallbackPack.locales.esES["Creature:9117:0"]);
  assert.equal(fallbackPack.locales.deDE["Creature:196:0"], "Eagan Pelzschneider");
  assert.throws(() => createMapEntityDictionary(source, spanish,
    { "Quest:1485:0": "Wrong duplicate quest" }), /Invalid map entity fallback/);
});

test("Wendel Mathers uses the personal name present in each client spell", async () => {
  const clientSource = await read("public/data/locales/wow-forever/source.json");
  const reviewed = await read("data/quest-marker-localization/reviewed-partial-entity-names.json");
  const spellIndex = clientSource.keys.indexOf("SpellName:437589:0");
  const entityIndex = source.keys.indexOf("Creature:218230:0");
  assert.ok(spellIndex >= 0);
  assert.equal(source.values[entityIndex], "Wendel Mathers");
  for (const [language, locale] of [["de", "deDE"], ["fr", "frFR"], ["pt-BR", "ptBR"]]) {
    const client = await read(`public/data/locales/wow-forever/${locale}.json`);
    const map = await read(`public/data/locales/wow-forever/map-entity-${locale}.json`);
    assert.ok(client.values[spellIndex].includes("Wendel Mathers"), locale);
    assert.equal(map.values[entityIndex], null, locale);
    assert.ok(reviewed["Wendel Mathers"].invariantLanguages.includes(language), language);
    assert.equal(reviewed["Wendel Mathers"][language], "Wendel Mathers", language);
  }
});

test("Portuguese NPC first names follow other localized client NPCs", async () => {
  const portuguese = await read("public/data/locales/wow-forever/map-entity-ptBR.json");
  const fallbacks = (await read(
    "public/data/locales/wow-forever/map-entity-app-fallbacks.json")).locales.ptBR;
  for (const [referenceId, referenceName, targetId, targetName] of [
    [12580, "Reginaldo Vilasboas", 256410, "Reginaldo Holmsby"],
    [4568, "Anastácia Cordato", 266847, "Anastácia Miller"],
  ]) {
    const reference = source.keys.indexOf(`Creature:${referenceId}:0`);
    const target = source.keys.indexOf(`Creature:${targetId}:0`);
    assert.ok(reference >= 0 && target >= 0);
    assert.equal(portuguese.values[reference], referenceName);
    assert.equal(portuguese.values[target], null);
    assert.equal(fallbacks[`Creature:${targetId}:0`], targetName);
  }
});

test("reviewed Western NPC invariants follow pinned Classic name precedent", async () => {
  const pinned = (await read("data/npc-name-localization/invariant-multiword-names.json")).names;
  const reviewed = await read("data/quest-marker-localization/reviewed-partial-entity-names.json");
  for (const [precedent, target, languages] of [
    ["Reginald Windsor", "Reginald Holmsby", ["de", "es", "fr"]],
    ["Anastasia Hartwell", "Anastasia Miller", ["de", "fr"]],
  ]) {
    for (const language of languages) {
      assert.equal(pinned[precedent][language], precedent);
      assert.ok(reviewed[target].invariantLanguages.includes(language));
      assert.equal(reviewed[target][language], target);
    }
  }
});

test("authored rare names use exact missing NPC IDs in every locale", async () => {
  const catalog = await read("data/npc-name-localization/reviewed-map-only-names.json");
  const fallbacks = (await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json")).locales;
  for (const [language, locale] of Object.entries({ de: "deDE", es: "esES",
    "es-MX": "esMX", fr: "frFR", ko: "koKR", "pt-BR": "ptBR",
    "zh-Hans": "zhCN", "zh-Hant": "zhTW" })) {
    const pack = await read(`public/data/locales/wow-forever/map-entity-${locale}.json`);
    for (const [id, record] of Object.entries(catalog.names)) {
      if (!record.translations[language]) continue;
      const key = `Creature:${id}:0`;
      const index = source.keys.indexOf(key);
      assert.equal(source.values[index], record.en);
      assert.equal(pack.values[index], null);
      assert.equal(fallbacks[locale][key], record.translations[language]);
    }
  }
});

test("reviewed unchanged NPC names are single proper names in Latin-script locales", async () => {
  const catalog = await read("data/npc-name-localization/reviewed-map-only-names.json");
  const localeIds = { de: "deDE", es: "esES", "es-MX": "esMX",
    fr: "frFR", "pt-BR": "ptBR" };
  for (const [id, record] of Object.entries(catalog.names)) {
    if (!record.invariantLanguages?.length) continue;
    assert.match(record.en, /^[A-Za-z']+$/);
    const key = `Creature:${id}:0`;
    const index = source.keys.indexOf(key);
    assert.equal(source.values[index], record.en);
    for (const language of record.invariantLanguages) {
      const locale = localeIds[language];
      assert.ok(locale, `${language}: invariant locale must use Latin script`);
      const pack = await read(`public/data/locales/wow-forever/map-entity-${locale}.json`);
      assert.equal(pack.values[index], null);
    }
  }
});

test("client item display names supply matching quest titles by reviewed item identity", async () => {
  const catalog = await read("data/quest-title-localization/client-item-title-fallbacks.json");
  const clientSource = await read("public/data/locales/wow-forever/source.json");
  const fallbackPack = await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json");
  assert.equal(catalog.version, 1);
  assert.equal(Object.keys(catalog.quests).length, 57);
  for (const [id, record] of Object.entries(catalog.quests)) {
    assert.equal(source.values[source.keys.indexOf(`Quest:${id}:0`)], record.en);
    for (const itemKey of record.itemKeys) {
      assert.match(itemKey, /^ItemSparse:\d+:4$/);
      assert.equal(clientSource.values[clientSource.keys.indexOf(itemKey)], record.en);
    }
  }
  const itemKey = catalog.quests["78132"].itemKeys[0];
  for (const locale of locales) {
    const client = await read(`public/data/locales/wow-forever/${locale}.json`);
    assert.equal(fallbackPack.locales[locale]["Quest:78132:0"],
      client.values[clientSource.keys.indexOf(itemKey)]);
  }
});

test("exact game names and unique map marker titles fill matching map gaps", async () => {
  const fallbacks = (await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json")).locales;
  const clientSource = await read("public/data/locales/wow-forever/source.json");
  const portugueseClient = await read("public/data/locales/wow-forever/ptBR.json");
  const valleyIndex = clientSource.keys.indexOf("AreaTable:2657:1");
  assert.equal(clientSource.values[valleyIndex], "Valley of Bones");
  assert.equal(fallbacks.ptBR["Quest:92841:0"], portugueseClient.values[valleyIndex]);
  const koreanClient = await read("public/data/locales/wow-forever/koKR.json");
  const flashIndex = clientSource.keys.indexOf("SpellName:1277455:0");
  assert.equal(clientSource.values[flashIndex], "Confounding Flash");
  assert.equal(fallbacks.koKR["Quest:94817:0"], koreanClient.values[flashIndex]);
  const englishApp = await read("src/i18n/locales/en.json");
  const koreanApp = await read("src/i18n/locales/ko.json");
  const marker = Object.keys(englishApp.map.questMarkers).find((id) =>
    englishApp.map.questMarkers[id].name === "Greater Friend of the Library" &&
    koreanApp.map.questMarkers[id]?.name === "도서관의 든든한 친구");
  assert.ok(marker);
  assert.equal(fallbacks.koKR["Quest:82208:0"], koreanApp.map.questMarkers[marker].name);
});

test("names embedded in client spell and item text fill matching creature IDs", async () => {
  const fallbacks = (await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json")).locales;
  const reviewed = await read("data/quest-marker-localization/reviewed-client-compound-names.json");
  const packs = Object.fromEntries(await Promise.all(["koKR", "zhCN", "zhTW"].map(async (locale) =>
    [locale, await read(`public/data/locales/wow-forever/map-entity-${locale}.json`)])));
  for (const [name, record] of Object.entries(reviewed)) {
    for (const id of record.npcIds) {
      const key = `Creature:${id}:0`;
      const index = source.keys.indexOf(key);
      assert.equal(source.values[index], name);
      for (const [language, locale] of [["ko", "koKR"], ["zh-Hans", "zhCN"],
        ["zh-Hant", "zhTW"]]) {
        if (record[language]) {
          assert.equal(packs[locale].values[index] || fallbacks[locale][key], record[language]);
        }
      }
    }
  }
});

test("book titles embedded in client item names fill matching quest IDs", async () => {
  const fallbacks = (await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json")).locales;
  const reviewed = await read("data/quest-title-localization/reviewed-client-compound-titles.json");
  for (const [name, record] of Object.entries(reviewed)) {
    for (const id of record.questIds) {
      assert.equal(source.values[source.keys.indexOf(`Quest:${id}:0`)], name);
      if (record.ko) assert.equal(fallbacks.koKR[`Quest:${id}:0`], record.ko);
      if (record["zh-Hant"]) {
        assert.equal(fallbacks.zhTW[`Quest:${id}:0`], record["zh-Hant"]);
      }
    }
  }
});

test("reviewed repeated quest titles reuse only uniform game translations", async () => {
  const catalog = await read("data/quest-title-localization/reviewed-repeated-map-title-fallbacks.json");
  const fallbackPack = await read("public/data/locales/wow-forever/map-entity-app-fallbacks.json");
  assert.equal(catalog.version, 1);
  assert.equal(catalog.titles["Call of Water"].questIds.includes(94495), true);
  assert.equal(catalog.titles["Stolen Winter Veil Treats"], undefined);
  assert.deepEqual(catalog.titles["A Friend of the Family"].questIds, [98190, 98191]);
  const korean = await read("public/data/locales/wow-forever/map-entity-koKR.json");
  const traditional = await read("public/data/locales/wow-forever/map-entity-zhTW.json");
  assert.equal(fallbackPack.locales.koKR["Quest:94495:0"],
    korean.values[source.keys.indexOf("Quest:63:0")]);
  assert.equal(fallbackPack.locales.koKR["Quest:98191:0"],
    korean.values[source.keys.indexOf("Quest:98190:0")]);
  assert.equal(fallbackPack.locales.koKR["Quest:79482:0"],
    korean.values[source.keys.indexOf("Quest:6963:0")]);
  assert.equal(fallbackPack.locales.zhTW["Quest:79482:0"],
    traditional.values[source.keys.indexOf("Quest:7042:0")]);
});

test("reviewed map entity catalog has no duplicate names", async () => {
  const raw = await readFile(join(root,
    "data/quest-marker-localization/reviewed-partial-entity-names.json"), "utf8");
  const names = [...raw.matchAll(/^  "([^"]+)": \{/gm)].map((match) => match[1]);
  assert.equal(names.length, Object.keys(JSON.parse(raw)).length);
  assert.equal(new Set(names).size, names.length);
});

test("complementary reviewed NPC locales survive catalog merging", async () => {
  const catalogs = await Promise.all([
    "reviewed-entity-names.json",
    "reviewed-classic-npc-gaps.json",
    "reviewed-partial-entity-names.json",
    "reviewed-client-compound-names.json",
  ].map((name) => read(`data/quest-marker-localization/${name}`)));
  const merged = mergeReviewedEntityNames(...catalogs);
  assert.equal(merged["Scarlet Captain"]["zh-Hans"], "血色十字军队长");
  assert.equal(merged["Scarlet Captain"].ko, "붉은십자군 부대장");
});

test("map entity packs match the published quest and NPC identities", async () => {
  for (const { path, sha256 } of source.provenance.mapFiles) {
    const content = await readFile(join(root, path), "utf8");
    assert.equal(createHash("sha256").update(content).digest("hex"), sha256, path);
  }
  assert.equal(source.provenance.excludedConflicts, 0);
  assert.ok(source.keys.length > 5900);
  assert.ok(source.provenance.excludedClassicMismatches.length > 300);
  assert.ok(!source.keys.includes("Quest:172:0"));
  assert.ok(!source.keys.includes("Creature:8479:0"));
  for (const locale of locales) {
    const pack = await read(`public/data/locales/wow-forever/map-entity-${locale}.json`);
    assert.equal(pack.values.length, source.keys.length, locale);
    assert.ok(pack.values.filter(Boolean).length > 3500, locale);
    createMapEntityDictionary(source, pack);
  }
});

test("same English quest title uses its own quest ID and rejects stale map labels", async () => {
  const pack = await read("public/data/locales/wow-forever/map-entity-ptBR.json");
  const names = createMapEntityDictionary(source, pack);
  assert.equal(getMapEntityText(names, "Vile Familiars", "Quest:1485:0"), "Familiares Vis");
  assert.equal(getMapEntityText(names, "Vile Familiars", "Quest:792:0"), "Familiares torpes");
  assert.equal(getMapEntityText(names, "Renamed quest", "Quest:1485:0"), undefined);
});

test("unchanged map NPC names have matching creature IDs and exclude role titles", async () => {
  const multiword = await read("data/npc-name-localization/invariant-multiword-names.json");
  const proper = await read("data/npc-name-localization/invariant-proper-names.json");
  for (const [catalog, id, name, language] of [
    [multiword, 279, "Morgan Pestle", "de"],
    [multiword, 907, "Keras Wolfheart", "fr"],
    [proper, 462, "Vultros", "de"],
    [proper, 519, "Slark", "fr"],
  ]) {
    const key = `Creature:${id}:0`;
    assert.equal(source.values[source.keys.indexOf(key)], name);
    assert.ok(catalog.names[name].npcIds.includes(id), key);
    assert.equal(catalog.names[name][language], name);
  }
  assert.equal(multiword.names["Boss Galgosh"], undefined);
});

test("reviewed partial quest titles fill only their missing locales", async () => {
  const fallbacks = (await read(
    "public/data/locales/wow-forever/map-entity-app-fallbacks.json")).locales;
  const key = "Quest:98297:0";
  assert.equal(source.values[source.keys.indexOf(key)], "Stopping the Cycle");
  assert.equal(fallbacks.ptBR[key], "Rompendo o ciclo");
  assert.equal(fallbacks.zhCN[key], "打破循环");
  assert.equal(fallbacks.zhTW[key], "打破循環");
  assert.equal(fallbacks.deDE[key], undefined);
});

test("Mexican Spanish NPC names come from their own locale", async () => {
  const pack = await read("public/data/locales/wow-forever/map-entity-esMX.json");
  const names = createMapEntityDictionary(source, pack);
  assert.equal(getMapEntityText(names, "Eagan Peltskinner", "Creature:196:0"),
    "Eagan Desollapelambres");
});

test("Spanish Hemet map labels follow the creature record instead of a book byline", async () => {
  const english = await read("src/i18n/locales/en.json");
  const spanish = await read("src/i18n/locales/es.json");
  const game = await read("public/data/locales/wow-forever/map-entity-esES.json");
  const reviewed = await read("data/quest-marker-localization/reviewed-partial-entity-names.json");
  const bookEvidence = await read("data/npc-name-localization/reviewed-client-evidence.json");
  const name = "Hemet Nesingwary";
  const creatureName = game.values[source.keys.indexOf("Creature:715:0")];
  const questName = game.values[source.keys.indexOf("Quest:5762:0")];
  assert.equal(creatureName, "Hemet Decautela");
  assert.equal(questName, creatureName);
  assert.notEqual(bookEvidence[name].es, creatureName);
  assert.equal(reviewed[name].sourcePriority, "client-creature");
  let checked = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    for (const field of ["startsAt", "endsAt", "name"]) {
      if (marker[field] !== name) continue;
      assert.equal(spanish.map.questMarkers[id][field], creatureName, `${id}/${field}`);
      checked += 1;
    }
  }
  assert.equal(checked, 12);
});

test("reviewed Chinese NPC fallbacks follow Forever creature IDs across map fields", async () => {
  const english = await read("src/i18n/locales/en.json");
  const reviewed = await read("data/quest-marker-localization/reviewed-partial-entity-names.json");
  const cases = {
    "zh-Hans": ["Sam Sarsaparilla", "Elegael Thornpaw", "Earthseer Farsen",
      "Yorana Windyreed", "Vayn Moongaze", "Josephine Carson", "Kelsey Fargo",
      "Fendaal Windstone", "Dead Cultist", "Hyusaa Quickbreeze", "Alfina Nightgaze",
      "Hamish Bergwort", "Blixie Fitzwink", "Ormin Pelford", "Denaaris Stargale",
      "Grenhild Darktalon", "Marcy Baker", "Belanaa Windveil"],
    "zh-Hant": ["Eleanor Shackleton", "Lyreena Duskblade", "Eric Brighthammer",
      "Aramis Hammerhand", "Boarton Shadetotem", "Avatar of Saeyleenan",
      "Oura Stormspinner", "Roy Lewells", "Thom Filch", "Eldrun Stormbreaker"],
  };
  for (const [language, names] of Object.entries(cases)) {
    const targetPack = await read(`public/data/locales/wow-forever/map-entity-${
      language === "zh-Hans" ? "zhCN" : "zhTW"}.json`);
    const siblingPack = await read(`public/data/locales/wow-forever/map-entity-${
      language === "zh-Hans" ? "zhTW" : "zhCN"}.json`);
    const app = await read(`src/i18n/locales/${language}.json`);
    for (const name of names) {
      const record = reviewed[name];
      assert.ok(record?.[language], `${language}/${name} reviewed name`);
      assert.equal(record.npcIds.length, 1, `${name} has one creature ID`);
      const index = source.keys.indexOf(`Creature:${record.npcIds[0]}:0`);
      assert.equal(source.values[index], name, `${name} creature identity`);
      assert.equal(targetPack.values[index], null, `${language}/${name} game gap`);
      assert.ok(siblingPack.values[index], `${language}/${name} sibling game term`);
      let checked = 0;
      for (const [id, marker] of Object.entries(english.map.questMarkers)) {
        for (const field of ["startsAt", "endsAt"]) {
          if (marker[field] !== name) continue;
          assert.equal(app.map.questMarkers[id]?.[field], record[language],
            `${language}/${name}/${id}/${field}`);
          checked += 1;
        }
      }
      for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
        for (const [id, marker] of Object.entries(english.map[group])) {
          if (marker.name !== name) continue;
          assert.equal(app.map[group][id]?.name, record[language],
            `${language}/${name}/${group}/${id}`);
          checked += 1;
        }
      }
      for (const [id, englishName] of Object.entries(english.map.repairVendors)) {
        if (englishName !== name) continue;
        assert.equal(app.map.repairVendors[id], record[language],
          `${language}/${name}/repairVendors/${id}`);
        checked += 1;
      }
      for (const [id, englishName] of Object.entries(english.map.questNpcs.names)) {
        if (englishName !== name) continue;
        assert.equal(app.map.questNpcs.names[id], record[language],
          `${language}/${name}/questNpcs/${id}`);
        checked += 1;
      }
      assert.ok(checked > 0, `${language}/${name} has map references`);
    }
  }
});

test("case-only quest title differences use uniform game translations", async () => {
  const cases = [
    ["ko", "koKR", "1012610", "Quest:960:0"],
    ["zh-Hans", "zhCN", "1012610", "Quest:960:0"],
    ["zh-Hant", "zhTW", "1012610", "Quest:960:0"],
    ["zh-Hant", "zhTW", "1012383", "Quest:634:0"],
  ];
  for (const [language, gameLocale, markerId, questKey] of cases) {
    const app = await read(`src/i18n/locales/${language}.json`);
    const game = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
    const index = source.keys.indexOf(questKey);
    assert.notEqual(index, -1, questKey);
    assert.equal(app.map.questMarkers[markerId].name, game.values[index]);
  }
  const koreanGame = await read("public/data/locales/wow-forever/map-entity-koKR.json");
  const koreanApp = await read("src/i18n/locales/ko.json");
  assert.equal(koreanApp.map.questMarkers["1014395"].name,
    koreanGame.values[source.keys.indexOf("Quest:7666:0")]);
  assert.equal(koreanApp.map.questMarkers["1014397"].name,
    koreanGame.values[source.keys.indexOf("Quest:7669:0")]);
  for (const [markerId, questId] of [
    ["1013065", "1798"], ["1013066", "1798"],
    ["1013386", "2996"], ["1013391", "3001"],
    ["1013956", "5342"], ["1013958", "5344"],
    ["1014316", "7163"], ["1014321", "7168"],
    ["1014986", "8929"], ["1014987", "8930"],
  ]) {
    assert.equal(koreanApp.map.questMarkers[markerId].name,
      koreanGame.values[source.keys.indexOf(`Quest:${questId}:0`)]);
  }
  assert.notEqual(
    koreanGame.values[source.keys.indexOf("Quest:7666:0")],
    koreanGame.values[source.keys.indexOf("Quest:7669:0")],
  );
});

test("Scourgestone marker titles follow their faction quest IDs", async () => {
  const app = await read("src/i18n/locales/es.json");
  const game = await read("public/data/locales/wow-forever/map-entity-esES.json");
  for (const [markerId, questId] of [
    ["1013966", "5402"], ["1013967", "5403"], ["1013968", "5404"],
    ["1013970", "5406"], ["1013971", "5407"], ["1013972", "5408"],
    ["1013986", "5508"], ["1013987", "5509"], ["1013988", "5510"],
  ]) {
    assert.equal(app.map.questMarkers[markerId].name,
      game.values[source.keys.indexOf(`Quest:${questId}:0`)]);
  }
});

test("repeated quest titles follow NPC and objective context", async () => {
  for (const [language, gameLocale, markers] of [
    ["fr", "frFR", [["1013552", "3763"], ["1013561", "3789"], ["1013562", "3790"]]],
    ["zh-Hans", "zhCN", [["1012782", "1179"], ["1013273", "2769"]]],
    ["zh-Hant", "zhTW", [
      ["1011964", "120"], ["1011965", "121"],
      ["1012782", "1179"], ["1013273", "2769"],
      ["1013470", "3385"], ["1013709", "4493"], ["1013710", "4494"],
    ]],
    ["pt-BR", "ptBR", [["1013470", "3385"]]],
  ]) {
    const app = await read(`src/i18n/locales/${language}.json`);
    const game = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
    for (const [markerId, questId] of markers) {
      assert.equal(app.map.questMarkers[markerId].name,
        game.values[source.keys.indexOf(`Quest:${questId}:0`)]);
    }
  }
});

test("shared quest givers allow uniform objective-matched titles", async () => {
  for (const [language, gameLocale, markers] of [
    ["de", "deDE", [["1012919", "1458"]]],
    ["fr", "frFR", [["1012919", "1458"]]],
    ["pt-BR", "ptBR", [
      ["1012167", "367"], ["1012933", "1481"], ["1014529", "8120"],
    ]],
  ]) {
    const app = await read(`src/i18n/locales/${language}.json`);
    const game = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
    for (const [markerId, questId] of markers) {
      assert.equal(app.map.questMarkers[markerId].name,
        game.values[source.keys.indexOf(`Quest:${questId}:0`)]);
    }
  }
});

test("war supply signets use faction-specific Korean quest titles", async () => {
  const app = await read("src/i18n/locales/ko.json");
  const game = await read("public/data/locales/wow-forever/map-entity-koKR.json");
  for (let offset = 0; offset < 10; offset += 1) {
    const markerId = String(1014951 + offset);
    const questId = String(8846 + offset);
    assert.equal(app.map.questMarkers[markerId].name,
      game.values[source.keys.indexOf(`Quest:${questId}:0`)]);
  }
});
