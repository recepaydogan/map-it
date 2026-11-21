import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createQuestTextDictionary, getQuestText,
  mergeWowheadQuestProse } from "../src/i18n/quest-text-dictionary.ts";
import { stripWowheadQuestChrome } from "./lib/wowhead-quest-prose-page.mjs";
import { rejectedSemanticProse } from "./lib/rejected-semantic-prose.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read("public/data/locales/wow-forever/quest-text-source.json");
const catalogRaw = await readFile(join(root, "public/data/quests/quest-details.json"), "utf8");
const catalog = JSON.parse(catalogRaw);

test("reviewed quest variant mismatches never reach marker panels", async () => {
  assert.equal(rejectedSemanticProse.length, 77);
  const packs = new Map();
  for (const rule of rejectedSemanticProse) {
    assert.equal(catalog.quests[rule.id]?.[rule.field], rule.english);
    const type = rule.field === "objective" ? "objective" : "prose";
    const key = `${type}:${rule.locale}`;
    if (!packs.has(key)) packs.set(key, await read(
      `public/data/locales/wow-forever/quest-${type}-wowhead-${rule.locale}.json`));
    assert.notEqual(packs.get(key).quests[rule.id]?.locales?.[rule.locale]?.[rule.field],
      rule.localized, `${rule.locale}/${rule.id}/${rule.field}`);
  }
  const frenchObjective = packs.get("objective:frFR");
  const frenchProse = packs.get("prose:frFR");
  const dictionary = mergeWowheadQuestProse(mergeWowheadQuestProse(
    new Map(), frenchProse, "frFR"), frenchObjective, "frFR");
  assert.equal(getQuestText(dictionary, "99260", "objective",
    catalog.quests[99260].objective), catalog.quests[99260].objective);
  assert.equal(getQuestText(dictionary, "99260", "description",
    catalog.quests[99260].description), catalog.quests[99260].description);
  assert.match(getQuestText(dictionary, "5638", "objective",
    catalog.quests[5638].objective), /Rohan/);
  const germanProse = await read(
    "public/data/locales/wow-forever/quest-prose-wowhead-deDE.json");
  const german = mergeWowheadQuestProse(new Map(), germanProse, "deDE");
  assert.equal(getQuestText(german, "8110", "completionText",
    catalog.quests[8110].completionText), catalog.quests[8110].completionText);
  assert.equal(germanProse.quests[9007].reusedFromQuestId, "9013");
  assert.equal(getQuestText(german, "9007", "description",
    catalog.quests[9007].description),
  germanProse.quests[9013].locales.deDE.description);
  const traditionalProse = await read(
    "public/data/locales/wow-forever/quest-prose-wowhead-zhTW.json");
  const traditional = mergeWowheadQuestProse(new Map(), traditionalProse, "zhTW");
  assert.equal(getQuestText(traditional, "686", "description",
    catalog.quests[686].description), catalog.quests[686].description);
});

test("matching Wowhead quest prose localizes description, progress, and completion", async () => {
  const supplement = await read("public/data/locales/wow-forever/quest-prose-wowhead.json");
  for (const [id, quest] of Object.entries(supplement.quests)) {
    for (const [field, english] of Object.entries(quest.english)) {
      assert.equal(catalog.quests[id]?.[field], english, `${id}:${field} source`);
    }
  }
  const korean = mergeWowheadQuestProse(new Map(), supplement, "koKR");
  for (const field of ["description", "progressText", "completionText"]) {
    const english = catalog.quests[6393][field];
    const translated = getQuestText(korean, "6393", field, english);
    assert.equal(translated, supplement.quests[6393].locales.koKR[field]);
    assert.notEqual(translated, english);
    assert.equal(getQuestText(korean, "6393", field, "Changed text"), "Changed text");
  }
  assert.equal(getQuestText(mergeWowheadQuestProse(new Map(), supplement, "zhCN"),
    "6393", "description", catalog.quests[6393].description),
  catalog.quests[6393].description);
});

test("quest prose fallbacks cover absent client fields and keep their English identity", async () => {
  const fallbackPack = await read("public/data/locales/wow-forever/quest-text-app-fallbacks.json");
  assert.equal(fallbackPack.version, 1);
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(`public/data/locales/wow-forever/quest-text-${locale}.json`);
    const fallbacks = fallbackPack.locales[locale];
    assert.ok(fallbacks, locale);
    const dictionary = createQuestTextDictionary(source, pack, fallbacks);
    for (const [key, translated] of Object.entries(fallbacks)) {
      const index = source.keys.indexOf(key);
      assert.notEqual(index, -1, key);
      assert.ok(!pack.values[index], `${locale}/${key} must be a client gap`);
      const [id, field] = key.split(":");
      assert.equal(getQuestText(dictionary, id, field, source.values[index]), translated);
      assert.equal(getQuestText(dictionary, id, field, "changed quest text"), "changed quest text");
    }
  }
  const germanPack = await read("public/data/locales/wow-forever/quest-text-deDE.json");
  const germanGender = fallbackPack.locales.deDE["117:description"];
  assert.ok(germanGender.includes("/"));
  assert.ok(!/\$[A-Za-z]/.test(germanGender));
  assert.equal(fallbackPack.locales.frFR["5925:description"].includes("mon ami/amie"), true);
  assert.ok(fallbackPack.locales.esES["1024:description"].includes("listo/lista"));
  assert.ok(fallbackPack.locales.esES["6622:description"].includes("doctor/doctora"));
  const convertedTraditional = await read("data/quest-text-localization/zh-tw-derived.json");
  assert.ok(fallbackPack.derivedFromZhCN.zhTW.length > 2000);
  const traditionalPack = await read("public/data/locales/wow-forever/quest-text-zhTW.json");
  for (const [index, key] of source.keys.entries()) {
    assert.ok(traditionalPack.values[index] || fallbackPack.locales.zhTW[key],
      `zhTW/${key} must have quest prose`);
  }
  for (const key of fallbackPack.derivedFromZhCN.zhTW) {
    assert.equal(fallbackPack.locales.zhTW[key], convertedTraditional.entries[key]);
  }
  const convertedSimplified = await read("data/quest-text-localization/zh-cn-derived.json");
  assert.ok(fallbackPack.derivedFromZhTW.zhCN.length >= 30);
  const simplifiedPack = await read("public/data/locales/wow-forever/quest-text-zhCN.json");
  for (const [index, key] of source.keys.entries()) {
    assert.ok(simplifiedPack.values[index] || fallbackPack.locales.zhCN[key],
      `zhCN/${key} must have quest prose`);
  }
  for (const key of fallbackPack.derivedFromZhTW.zhCN) {
    assert.equal(fallbackPack.locales.zhCN[key], convertedSimplified.entries[key]);
  }
  assert.ok(fallbackPack.locales.zhTW["216:objective"].includes("梣谷"));
  assert.ok(fallbackPack.locales.zhTW["6:objective"].includes("維裡副隊長"));
  assert.equal(fallbackPack.locales.zhTW["17:description"],
    fallbackPack.locales.zhTW["2202:description"]);
  assert.equal(fallbackPack.locales.zhTW["4101:description"],
    fallbackPack.locales.zhTW["4102:description"]);
  assert.equal(fallbackPack.locales.ptBR["5517:objective"],
    (await read("public/data/locales/wow-forever/quest-text-ptBR.json"))
      .values[source.keys.indexOf("5513:objective")].replace("10", "25"));
  const clientSource = await read("public/data/locales/wow-forever/source.json");
  const portugueseClient = await read("public/data/locales/wow-forever/ptBR.json");
  const bindingsIndex = clientSource.keys.indexOf("ItemSparse:19716:4");
  assert.equal(clientSource.values[bindingsIndex], "Primal Hakkari Bindings");
  assert.ok(fallbackPack.locales.ptBR["8053:objective"].includes(
    portugueseClient.values[bindingsIndex]));
  const mapSource = await read("public/data/locales/wow-forever/map-entity-source.json");
  const portugueseMap = await read("public/data/locales/wow-forever/map-entity-ptBR.json");
  const winterNpcIndex = mapSource.keys.indexOf("Creature:13418:0");
  assert.equal(mapSource.values[winterNpcIndex], "Kaymard Copperpinch");
  assert.ok(fallbackPack.locales.ptBR["6983:objective"].includes(
    portugueseMap.values[winterNpcIndex]));
  assert.equal(fallbackPack.locales.ptBR["7042:description"].split("\n").length,
    source.values[source.keys.indexOf("7042:description")].split("\n").length);
  assert.equal(fallbackPack.locales.zhTW["5507:objective"].includes("10個"), true);
  assert.throws(() => createQuestTextDictionary(source,
    germanPack,
    { "5:objective": "Wrong duplicate objective" }), /Invalid quest text fallback/);
});

test("quest prose packs match the published English quest fields", async () => {
  assert.equal(source.version, 1);
  assert.ok(source.keys.length > 4000);
  assert.ok(source.keys.includes("1425:objective"),
    "reviewed title variant must keep quest text indexes aligned");
  assert.equal(source.provenance.catalogSha256,
    createHash("sha256").update(catalogRaw).digest("hex"));
  for (const [index, key] of source.keys.entries()) {
    const [id, field] = key.split(":");
    assert.equal(catalog.quests[id]?.[field], source.values[index], key);
  }
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(`public/data/locales/wow-forever/quest-text-${locale}.json`);
    const dictionary = createQuestTextDictionary(source, pack);
    assert.ok(dictionary.size > 2000, locale);
    assert.ok([...dictionary.values()].every((entry) => entry.localized !== entry.english), locale);
  }
});

test("quest detail lookup rejects changed English text and keeps locale-specific prose", async () => {
  const german = createQuestTextDictionary(source,
    await read("public/data/locales/wow-forever/quest-text-deDE.json"));
  const spanish = createQuestTextDictionary(source,
    await read("public/data/locales/wow-forever/quest-text-esES.json"));
  const original = catalog.quests[5].objective;
  assert.notEqual(getQuestText(german, "5", "objective", original), original);
  assert.notEqual(getQuestText(german, "5", "objective", original),
    getQuestText(spanish, "5", "objective", original));
  assert.equal(getQuestText(german, "5", "objective", `${original} changed`), `${original} changed`);
  assert.equal(getQuestText(german, "5", "description", original), original);
  const mexican = await read("public/data/locales/wow-forever/quest-text-esMX.json");
  assert.equal(mexican.fallbackLocale, "esES");
});

test("outdated client objective counts fall back without dropping spelled-out counts", async () => {
  const french = createQuestTextDictionary(source,
    await read("public/data/locales/wow-forever/quest-text-frFR.json"));
  const stale = source.values[source.keys.indexOf("8367:objective")];
  assert.equal(getQuestText(french, "8367", "objective", stale), stale);
  const spanish = createQuestTextDictionary(source,
    await read("public/data/locales/wow-forever/quest-text-esES.json"));
  const spelledOut = source.values[source.keys.indexOf("1109:objective")];
  assert.notEqual(getQuestText(spanish, "1109", "objective", spelledOut), spelledOut);
});

test("reviewed quest objectives use current quantities in both Chinese locales", async () => {
  const fallbacks = await read("public/data/locales/wow-forever/quest-text-app-fallbacks.json");
  const numbers = (value) => value.match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const locale of ["zhCN", "zhTW"]) {
    const pack = await read(`public/data/locales/wow-forever/quest-text-${locale}.json`);
    const dictionary = createQuestTextDictionary(source, pack, fallbacks.locales[locale]);
    for (const id of ["780", "7828", "7844", "9153"]) {
      const index = source.keys.indexOf(`${id}:objective`);
      const english = source.values[index];
      const localized = getQuestText(dictionary, id, "objective", english);
      assert.notEqual(localized, english, `${locale}/${id} localized`);
      assert.deepEqual(numbers(localized), numbers(english), `${locale}/${id} quantities`);
    }
  }
});

test("reviewed Spanish and Chinese objective counts resolve with current quantities", async () => {
  const fallbacks = await read("public/data/locales/wow-forever/quest-text-app-fallbacks.json");
  const idsByLocale = {
    esES: ["546", "5544"],
    esMX: ["546", "5544"],
    zhCN: ["532", "541", "640", "1846", "4141"],
    zhTW: ["532", "541", "640", "1452", "1846", "4141", "4145"],
  };
  const numbers = (value) => value.match(/\d+(?:[.,]\d+)?/g) ?? [];
  for (const [locale, ids] of Object.entries(idsByLocale)) {
    const pack = await read(`public/data/locales/wow-forever/quest-text-${locale}.json`);
    const dictionary = createQuestTextDictionary(source, pack, fallbacks.locales[locale]);
    for (const id of ids) {
      const english = catalog.quests[id].objective;
      const localized = getQuestText(dictionary, id, "objective", english);
      assert.notEqual(localized, english, `${locale}/${id} localized`);
      assert.deepEqual(numbers(localized), numbers(english), `${locale}/${id} quantities`);
    }
  }
});

test("outdated Traditional Chinese objective with two targets uses all four current targets", async () => {
  const locale = "zhTW";
  const id = "4145";
  const pack = await read(`public/data/locales/wow-forever/quest-text-${locale}.json`);
  const fallbacks = (await read("public/data/locales/wow-forever/quest-text-app-fallbacks.json"))
    .locales[locale];
  const index = source.keys.indexOf(`${id}:objective`);
  assert.equal(pack.values[index], null);
  const localized = getQuestText(createQuestTextDictionary(source, pack, fallbacks),
    id, "objective", catalog.quests[id].objective);
  assert.equal((localized.match(/5個血瓣花/g) ?? []).length, 4);
  assert.ok(localized.includes("掠奪者") && localized.includes("猛擊者"));
});

test("reviewed quest quantities reject stale prose and retain verified Chinese text", async () => {
  const fallbacks = await read("public/data/locales/wow-forever/quest-text-app-fallbacks.json");
  const simplified = await read("public/data/locales/wow-forever/quest-text-zhCN.json");
  const simplifiedProse = await read(
    "public/data/locales/wow-forever/quest-prose-wowhead-zhCN.json");
  const traditionalProse = await read(
    "public/data/locales/wow-forever/quest-prose-wowhead-zhTW.json");
  const index = source.keys.indexOf("22:description");
  assert.equal(simplified.values[index], null);
  assert.equal(simplifiedProse.quests[22]?.locales.zhCN.description, undefined);
  const corrected = getQuestText(createQuestTextDictionary(source, simplified,
    fallbacks.locales.zhCN), "22", "description", catalog.quests[22].description);
  assert.ok(corrected.includes("8片猪肝"));
  assert.ok(!corrected.includes("10个猪肝"));
  assert.equal(traditionalProse.quests[2138]?.locales.zhTW.description, undefined);
  assert.equal(traditionalProse.quests[7342]?.locales.zhTW.progressText, undefined);
});

test("captured Wowhead quest prose resolves only for matching quest fields", async () => {
  const locale = "koKR";
  const pack = await read(`public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`);
  const quest = catalog.quests[8];
  const dictionary = mergeWowheadQuestProse(new Map(), pack, locale);
  for (const field of ["description", "progressText", "completionText"]) {
    const translated = pack.quests[8].locales[locale][field];
    assert.equal(getQuestText(dictionary, "8", field, quest[field]), translated);
    assert.equal(getQuestText(dictionary, "8", field, `${quest[field]} changed`),
      `${quest[field]} changed`);
  }
  assert.equal(getQuestText(mergeWowheadQuestProse(new Map(), pack, "zhCN"),
    "8", "description", quest.description), quest.description);
});

test("reused Wowhead prose keeps the exact English field and donor locale text", async () => {
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(`public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`);
    const objectives = await read(`public/data/locales/wow-forever/quest-objective-wowhead-${locale}.json`);
    mergeWowheadQuestProse(new Map(), pack, locale);
    for (const [id, entry] of Object.entries(pack.quests)) {
      const source = catalog.quests[entry.reusedFromQuestId ?? id];
      assert.ok(source, `${locale}/${id} source quest`);
      assert.equal(entry.sourceUrl, `https://www.wowhead.com/forever/quest=${id}`,
        `${locale}/${id} target URL`);
      for (const [field, english] of Object.entries(entry.english)) {
        assert.equal(catalog.quests[id][field], english, `${locale}/${id}/${field} target`);
        assert.equal(source[field], english, `${locale}/${id}/${field} source`);
        if (entry.reusedFromQuestId) {
          const donor = field === "objective" ?
            objectives.quests[entry.reusedFromQuestId] : pack.quests[entry.reusedFromQuestId];
          assert.ok(donor && !donor.reusedFromQuestId, `${locale}/${id}/${field} direct donor`);
          assert.equal(entry.locales[locale][field], donor.locales[locale][field],
            `${locale}/${id}/${field} donor text`);
          assert.equal(entry.localeUrls[locale], donor.localeUrls[locale],
            `${locale}/${id}/${field} donor URL`);
        } else if (entry.reusedFieldSources?.[field]) {
          const source = entry.reusedFieldSources[field];
          const donor = pack.quests[source.questId];
          assert.ok(donor && !donor.reusedFromQuestId, `${locale}/${id}/${field} field donor`);
          assert.equal(catalog.quests[source.questId][field], english,
            `${locale}/${id}/${field} field donor source`);
          assert.equal(entry.locales[locale][field], donor.locales[locale][field],
            `${locale}/${id}/${field} field donor text`);
          assert.equal(source.localeUrl, donor.localeUrls[locale],
            `${locale}/${id}/${field} field donor URL`);
        }
      }
    }
  }
});

test("different exact-text donors preserve both fields of a quest", async () => {
  const locale = "zhTW";
  const pack = await read(`public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`);
  const entry = pack.quests[3645];
  assert.equal(entry.reusedFromQuestId, undefined);
  assert.equal(entry.reusedFieldSources.progressText.questId, "3644");
  assert.equal(entry.reusedFieldSources.completionText.questId, "3647");
  const dictionary = mergeWowheadQuestProse(new Map(), pack, locale);
  for (const field of ["progressText", "completionText"]) {
    assert.equal(getQuestText(dictionary, "3645", field, catalog.quests[3645][field]),
      entry.locales[locale][field]);
  }
});

test("reused Wowhead objectives keep the donor identity and load in every locale", async () => {
  let reused = 0;
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(`public/data/locales/wow-forever/quest-objective-wowhead-${locale}.json`);
    const dictionary = mergeWowheadQuestProse(new Map(), pack, locale);
    for (const [id, entry] of Object.entries(pack.quests)) {
      if (!entry.reusedFromQuestId) continue;
      const donor = pack.quests[entry.reusedFromQuestId];
      assert.ok(donor && !donor.reusedFromQuestId, `${locale}/${id} direct objective donor`);
      assert.equal(entry.english.objective, catalog.quests[id].objective);
      assert.equal(entry.english.objective, catalog.quests[entry.reusedFromQuestId].objective);
      assert.equal(entry.locales[locale].objective, donor.locales[locale].objective);
      assert.equal(entry.localeUrls[locale], donor.localeUrls[locale]);
      assert.equal(getQuestText(dictionary, id, "objective", entry.english.objective),
        entry.locales[locale].objective);
      reused++;
    }
  }
  assert.ok(reused > 0, "expected verified objective reuse");
});

test("captured Wowhead objectives keep source quantities and resolve in the quest dictionary", async () => {
  let checked = 0;
  const numbers = (value) => new Set((value.normalize("NFKC")
    .match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(",", ".")));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(`public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`);
    for (const [id, entry] of Object.entries(pack.quests)) {
      const localized = entry.locales[locale]?.objective;
      if (!localized) continue;
      const english = catalog.quests[id]?.objective;
      assert.equal(entry.english.objective, english, `${locale}/${id} objective source`);
      for (const number of numbers(english)) {
        assert.ok(numbers(localized).has(number), `${locale}/${id} objective number ${number}`);
      }
      const dictionary = mergeWowheadQuestProse(new Map(), {
        version: 1, quests: { [id]: entry },
      }, locale);
      assert.equal(getQuestText(dictionary, id, "objective", english), localized);
      checked++;
    }
  }
  assert.ok(checked > 0, "expected a captured, applied Wowhead objective");
});

test("direct Wowhead objectives override different client and converted fallback wording", async () => {
  const locale = "zhTW";
  const id = "9153";
  const english = catalog.quests[id].objective;
  const client = await read(`public/data/locales/wow-forever/quest-text-${locale}.json`);
  const fallbacks = (await read("public/data/locales/wow-forever/quest-text-app-fallbacks.json"))
    .locales[locale];
  const wowhead = await read(`public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`);
  const direct = wowhead.quests[id]?.locales[locale]?.objective;
  assert.ok(direct, "captured direct Wowhead objective should remain in the locale pack");
  assert.notEqual(direct, fallbacks[`${id}:objective`]);
  const dictionary = createQuestTextDictionary(source, client, fallbacks);
  mergeWowheadQuestProse(dictionary, wowhead, locale);
  assert.equal(getQuestText(dictionary, id, "objective", english), direct);
});

test("item-only quest objective reuses the matching localized item name", async () => {
  const id = "92811";
  const itemId = "254432";
  const sourceNames = await read("public/data/locales/wow-forever/source.json");
  const itemIndex = sourceNames.keys.indexOf(`ItemSparse:${itemId}:4`);
  assert.equal(sourceNames.values[itemIndex], "Carved Centaur Totem");
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const itemPack = await read(`public/data/locales/wow-forever/${locale}.json`);
    const pack = await read(`public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`);
    const entry = pack.quests[id];
    assert.equal(entry.derivedFromItemId, itemId);
    assert.equal(entry.english.objective, catalog.quests[id].objective);
    assert.equal(entry.locales[locale].objective, `${itemPack.values[itemIndex]} (5)`);
    const dictionary = mergeWowheadQuestProse(new Map(), {
      version: 1, quests: { [id]: entry },
    }, locale);
    assert.equal(getQuestText(dictionary, id, "objective", catalog.quests[id].objective),
      entry.locales[locale].objective);
  }
});

test("captured quest prose packs contain no Wowhead page controls", async () => {
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(`public/data/locales/wow-forever/quest-prose-wowhead-${locale}.json`);
    for (const [id, quest] of Object.entries(pack.quests)) {
      for (const [field, value] of Object.entries(quest.locales[locale] ?? {})) {
        assert.equal(stripWowheadQuestChrome(value).trim(), value,
          `${locale}/${id}/${field} contains reader controls`);
      }
    }
  }
});
