import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { localizeTalentCatalog } from "../src/features/classes/talent-catalog-localization.ts";
import { applyClassGuideText } from "../src/features/classes/class-guide-localization.ts";
import { createQuestTextDictionary, mergeWowheadQuestProse, getQuestText } from "../src/i18n/quest-text-dictionary.ts";

const audit = "data/site-research/hotfix-2026-11-07";
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const frozen = process.argv.includes("--stage");
const contentRoot = frozen ? (await json(`${audit}/content-release.json`)).stage : "public";
const localeRoot = frozen ? (await json(`${audit}/locales-release.json`)).stage : "public";
const content = (file) => json(path.join(contentRoot, "data", file));
const locale = (file) => json(path.join(localeRoot, "data", file));
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const spells = new Map();
for (const id of [6785, 6787, 9866, 9867, 18562, 1329555, 1291568, 1310041]) {
  spells.set(id, (await content(`spells/foreverdb/${id % 64}.json`))[id]);
}
for (const [id, extra] of [[6785, 42], [6787, 62], [9866, 78], [9867, 98]]) {
  assert.match(spells.get(id).d, new RegExp(`435%.*plus ${extra}\\b`));
}
assert.doesNotMatch(spells.get(18562).d, /consum|your active/);
assert.equal((spells.get(1329555).d.match(/Activates Gore Drinker/g) ?? []).length, 1);
assert.match(spells.get(1291568).d, /spells that deal damage/);
assert.equal(spells.get(1310041).retired, true);
const recipe = (await content("professions/details/leatherworking.json")).recipes.find((r) => r.s === 1263031);
assert.deepEqual([recipe.req, recipe.y, recipe.g], [125, 125, 130]);
assert.equal((await content("items/foreverdb-enrichment.json")).entries[2678].clientDetails.sellPriceCopper, 1);
const quests = (await content("quests/quest-details.json")).quests;
assert.equal(quests[97288].minimumLevel, 15);
for (const id of [97289, 97290, 97291, 97292]) assert.equal(quests[id].minimumLevel, 16);
assert.doesNotMatch(quests[5321].description, /chest here/);
assert.equal((await content("dungeons/observed-quests.json")).quests.find((q) => q.id === "97288").minimumLevel, 15);
const requirements = (await content("quests/requirements.json")).quests;
assert.deepEqual(requirements[92422].prerequisiteQuests.map((q) => q.id), ["356", "99156"]);
assert.deepEqual(requirements[95216].prerequisiteQuests.map((q) => q.id), ["447", "450", "451"]);
assert.equal(requirements[5321].providedItems[0].id, "13536");
assert.deepEqual((await content("items/research/sources/32.json"))[13536].map((s) => [s.t, s.q, s.provided]), [["quest", 5321, true]]);
const talents = await content("classes/talent-calculator.json");
const oldTalents = await json(`${audit}/before/public/data/classes/talent-calculator.json`);
const guide = { guide: (await content("classes/guides/class-guides.json")).classes.Druid,
  play: await content("classes/guides/druid-play.json"), builds: await content("classes/guides/druid-builds.json"), stats: await content("classes/guides/stats.json") };
const oldGuide = { ...guide, builds: await json(`${audit}/before/public/data/classes/guides/druid-builds.json`) };
const questSource = await locale("locales/wow-forever/quest-text-source.json");
assert.equal(questSource.provenance.catalogSha256, createHash("sha256")
  .update(await readFile(path.join(contentRoot, "data/quests/quest-details.json"))).digest("hex"));
const fallbacks = await locale("locales/wow-forever/quest-text-app-fallbacks.json");
const combined = await locale("locales/wow-forever/quest-prose-wowhead.json");
const writeupSource = await locale("spells/writeups/locales/source.json");
const consumed = /verbraucht|consumid|consommé|소모된|被消耗/;
for (const [language, code] of Object.entries(languages)) {
  const tip = await locale(`locales/wow-forever/spell-tooltip-${code}.json`);
  for (const [id, extra] of [[6785, 42], [6787, 62], [9866, 78], [9867, 98]]) {
    assert.match(tip.entries[id].d, /435/);
    assert.match(tip.entries[id].d, new RegExp(`(?<!\\d)${extra}(?!\\d)`));
  }
  const talentPack = await locale(`classes/locales/talents-${language}.json`);
  localizeTalentCatalog(talents.classes, talents.sourceBuild, language, talentPack);
  localizeTalentCatalog(oldTalents.classes, oldTalents.sourceBuild, language, talentPack);
  for (const id of [104912, -1329555]) {
    const rank = talentPack.entries[id].ranks[0];
    const oldTalent = oldTalents.classes.flatMap((c) => c.trees.flatMap((t) => t.talents)).find((t) => t.id === id);
    assert.equal(rank.source, oldTalent.d[0], "Old installed clients retain the original source match");
  }
  const guidePack = await locale(`classes/guides/locales/${language}/druid.json`);
  applyClassGuideText(guide, guidePack.edits);
  applyClassGuideText(oldGuide, guidePack.edits);
  for (const edit of guidePack.edits.filter((e) => e.sources)) assert.doesNotMatch(edit.text, consumed);
  const dictionary = createQuestTextDictionary(questSource, await locale(`locales/wow-forever/quest-text-${code}.json`), fallbacks.locales[code]);
  for (const pack of [await locale(`locales/wow-forever/quest-objective-wowhead-${code}.json`),
    await locale(`locales/wow-forever/quest-prose-wowhead-${code}.json`), combined]) mergeWowheadQuestProse(dictionary, pack, code);
  for (const [id, field] of [[97288, "objective"], [5321, "description"]]) {
    assert.notEqual(getQuestText(dictionary, String(id), field, quests[id][field]), quests[id][field], `${language}/${id} translation`);
  }
  const offers = await locale(`locales/wow-forever/quest-offer-${code}.json`);
  assert.notEqual(offers.quests[97288].name, quests[97288].title);
  const writeups = await locale(`spells/writeups/locales/${language}.json`);
  assert.equal(writeups.values.length, writeupSource.strings.length);
  for (const id of [18562, 1329555]) assert.ok(writeups.values[writeupSource.strings.indexOf(spells.get(id).d)]?.trim());
  const app = frozen ? await locale(`locales/app/${language}.json`) : await json(`src/i18n/locales/${language}.json`);
  assert.ok(app.map.foreverQuest.providedOnAccept && app.map.foreverQuest.requiredQuestChain);
}
console.log(`Verified ${frozen ? "frozen CDN" : "local"} hotfixes, eight translations, quest merge loading, and old/new talent and guide compatibility.`);
