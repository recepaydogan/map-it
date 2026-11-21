import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeDruidAbilityTable } from "./lib/localize-druid-ability-table.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const guide = read("../public/data/guides/leveling-druid.json");
const client = read("../public/data/locales/wow-forever/source.json");
const generic = read("../data/guide-localization/hunter-ability-table.json");
const labels = read("../data/guide-localization/druid-ability-table.json");
const section = guide.html.match(/<h2 id="your-spells-and-forms-level-by-level"[\s\S]*?(?=<h2 id=|$)/)?.[0];
const sourceTable = section.match(/<table>[\s\S]*?<\/table>/)?.[0];

test("Druid ability table retains levels, spell links and quest versus trainer sources", () => {
  const links = [...sourceTable.matchAll(/data-guide-link="([^"]+)"/g)]
    .map(([, link]) => link);
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const base = generic[language] ?? generic.es;
    const note = labels[language] ?? labels.es;
    const translated = localizeDruidAbilityTable(section, base, note);
    assert.deepEqual([...translated.matchAll(/data-guide-link="([^"]+)"/g)]
      .map(([, link]) => link), links, language);
    assert.equal([...translated.matchAll(/<tr><td>/g)].length, 80, language);
    assert.ok(translated.includes(note.foreverQuest), language);
    assert.ok(translated.includes(base.quest.replace("{name}", "Body and Heart")), language);
    assert.ok(translated.includes(note.shapeshift), language);
    assert.ok(!translated.includes("<td>Trainer</td>"), language);
  }
});

test("eight Druid guides retain structure, client names and source links", () => {
  const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
    "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  const sourceLinks = [...guide.html.matchAll(/data-guide-link="([^"]+)"/g)]
    .map(([, link]) => link);
  for (const [language, code] of Object.entries(codes)) {
    const translated = read(`../public/data/guides/locales/${language}/leveling-druid.json`);
    const locale = read(`../public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(translated.headings.map(({ id, depth }) => ({ id, depth })),
      guide.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual([...translated.html.matchAll(/data-guide-link="([^"]+)"/g)]
      .map(([, link]) => link), sourceLinks, language);
    assert.equal([...translated.html.matchAll(/<table>/g)].length, 6, language);
    assert.equal([...translated.html.matchAll(/<tr><td>/g)].length, 98, language);
    assert.ok(!translated.html.includes("{{"), `${language}: unresolved template`);
    for (const key of ["ChrRaces:95:2", "ChrRaces:96:2", "AreaTable:16916:1",
      "ItemSparse:249396:4", "SpellName:1238069:0", "SpellName:1322605:0"]) {
      const index = client.keys.indexOf(key);
      assert.ok(translated.html.includes(locale.values[index]), `${language}: ${key}`);
    }
  }
});
