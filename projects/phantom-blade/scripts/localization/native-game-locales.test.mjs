import fs from "node:fs";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { createInstance } from "i18next";

async function bundle(file) {
  const output = await build({ entryPoints: [file], bundle: true, platform: "node", format: "esm", write: false });
  return import(`data:text/javascript;base64,${Buffer.from(output.outputFiles[0].text).toString("base64")}`);
}
const { createNativeGameDictionary, nativeGameText } = await bundle("src/i18n/native-game-dictionary.ts");
const { localizeNativeDocument } = await bundle("src/i18n/native-wiki-localization.ts");
const { prepareGlobalSearch, localizePreparedSearch, searchGlobalCatalog } = await bundle("src/features/map/map-global-search.ts");
const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const root = "public/data/locales/phantom-blade-zero";
const source = read(`${root}/source.json`), manifest = read(`${root}/manifest.json`);
const id = "485853b048335bb197d38a8d", entry = read(`public/data/wiki/entries/${id}.json`);
const original = JSON.stringify(entry), sourceIndex = new Map(source.keys.map((key, i) => [key, i]));
const quests = read("public/data/game-files/build-26266538/database/quests.json").records;
const questEntries = quests.map(quest => read(`public/data/wiki/entries/${quest.id}.json`));
const namedEntries = read("public/data/wiki/index.json").entries.map(row => read(`public/data/wiki/entries/${row.id}.json`))
  .filter(row => row.npcNameEvidence || row.nameEvidence);
const search = read("public/data/map-search/index.json");
const searchSample = { version: 1, locations: [search.locations.find(location => location.point.category === "native-quests")], items: [search.items.find(item => item.id === id)] };
const searchOriginal = JSON.stringify(searchSample);
for (const { language, code } of manifest.locales) {
  const values = read(`${root}/${code}.json`), dictionary = createNativeGameDictionary(source, values);
  const i18n = createInstance();
  await i18n.init({ lng: language, fallbackLng: "en", resources: { [language]: { translation: read(`src/i18n/locales/${language}.json`) } } });
  const local = localizeNativeDocument(`data/wiki/entries/${id}.json`, entry, (english, key) => nativeGameText(dictionary, english, key), (key, params) => i18n.t(key, params));
  for (const named of namedEntries) {
    const reference = named.npcNameEvidence ? { namespace: "Default", key: named.npcNameEvidence.speakerKey } : named.nameEvidence;
    const key = `${reference.namespace}:${reference.key}`, alias = `Wiki:${named.id}:/name`;
    assert.equal(source.aliases[alias], key, `Display names must retain their exact native context: ${named.id}`);
    assert.equal(nativeGameText(dictionary, named.name, alias), values.values[sourceIndex.get(key)] || named.name);
  }
  assert.equal(local.name, values.values[sourceIndex.get("Default:Item_Key_Xigu_003")]);
  assert.equal(local.descriptions[0].text, values.values[sourceIndex.get("Default:Item_KeyDes_Xigu_003")]);
  assert.equal(local.native, entry.native, "Source evidence must remain the original object");
  assert.equal(local.nativeId, entry.nativeId);
  assert.equal(local.locations[0].markerId, entry.locations[0].markerId);
  assert.equal(nativeGameText(dictionary, local.name, `Wiki:${id}:/name`), local.name, "Do not translate an already localized name twice");
  const searchDictionary = localizePreparedSearch(prepareGlobalSearch(searchSample), (text, key) => nativeGameText(dictionary, text, key), (mapId, name) => i18n.t(`map.maps.names.${mapId}`, { defaultValue: name }));
  const localizedQuest = nativeGameText(dictionary, searchSample.locations[0].point.name, `Wiki:${searchSample.locations[0].point.reference.id}:/name`);
  assert.equal(searchGlobalCatalog(searchDictionary, localizedQuest, "xi-gu").locations[0].point.id, searchSample.locations[0].point.id);
  assert.equal(searchGlobalCatalog(searchDictionary, local.name, "xi-gu").items[0].id, id);
  assert.equal(searchGlobalCatalog(searchDictionary, entry.name, "xi-gu").items[0].id, id, "English aliases must remain searchable");
  assert.equal(JSON.stringify(searchSample), searchOriginal, "Search localization must not alter native records or coordinates");
  for (const quest of questEntries) {
    const before = JSON.stringify(quest);
    const localized = localizeNativeDocument(`data/wiki/entries/${quest.id}.json`, quest, (english, key) => nativeGameText(dictionary, english, key), (key, params) => i18n.t(key, params));
    const expected = (text, pointer) => {
      if (!text?.trim()) return text;
      const key = source.aliases[`Wiki:${quest.id}:${pointer}`];
      assert.ok(key, `Quest text must have an exact native alias: ${quest.id}:${pointer}`);
      return values.values[sourceIndex.get(key)] || text;
    };
    assert.equal(localized.name, expected(quest.name, "/name"));
    quest.descriptions.forEach((description, i) => assert.equal(localized.descriptions[i].text, expected(description.text, `/descriptions/${i}/text`)));
    quest.quest.stages.forEach((stage, i) => {
      assert.equal(localized.quest.stages[i].title, expected(stage.title, `/quest/stages/${i}/title`));
      assert.equal(localized.quest.stages[i].description, expected(stage.description, `/quest/stages/${i}/description`));
      assert.equal(localized.quest.stages[i].native, stage.native);
      assert.equal(localized.quest.stages[i].titleReference, stage.titleReference);
    });
    assert.equal(JSON.stringify(quest), before, "Quest localization must leave the source evidence untouched");
  }
}
assert.equal(JSON.stringify(entry), original, "Localization must never modify native data");
const contextual = createNativeGameDictionary({ version: 1, keys: ["A:word", "B:word"], values: ["Shared", "Shared"], aliases: { "Wiki:item:/name": "A:word" } }, { version: 1, values: [null, "Different context"] });
assert.equal(nativeGameText(contextual, "Shared", "Wiki:item:/name"), "Shared", "Missing native text must not borrow an unrelated context");
assert.equal(nativeGameText(contextual, "A changed source", "Wiki:item:/name"), "A changed source", "Stale aliases must not replace changed source text");
console.log(`Native locale checks passed for ${manifest.locales.length} languages, ${quests.length} quests and ${namedEntries.length} contextual names; item/quest text, identifiers and source evidence verified.`);
