import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeDruidQuestTable } from "./lib/localize-druid-quest-table.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const source = read("../public/data/locales/wow-forever/source.json");
const guide = read("../public/data/guides/leveling-druid.json");
const labels = read("../data/guide-localization/druid-quest-table.json");
const section = guide.html.match(/<h2 id="class-quests-up-to-30"[\s\S]*?(?=<h2 id=|$)/)?.[0];
const sourceTable = section.match(/<table>[\s\S]*?<\/table>/)?.[0];

test("Druid Classic quest table preserves map pins, rewards and caveats", () => {
  const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
    "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  const links = [...sourceTable.matchAll(/data-guide-link="([^"]+)"/g)]
    .map(([, link]) => link);
  for (const [language, code] of Object.entries(codes)) {
    const locale = read(`../public/data/locales/wow-forever/${code}.json`);
    const table = localizeDruidQuestTable(section, labels[language] ?? labels.es, source, locale);
    assert.deepEqual([...table.matchAll(/data-guide-link="([^"]+)"/g)]
      .map(([, link]) => link), links, language);
    assert.deepEqual([...table.matchAll(/<tr><td>(\d+)<\/td>/g)].map(([, level]) => level),
      ["1", "10", "14", "16"], language);
    for (const key of ["ChrRaces:4:2", "ChrRaces:6:2"]) {
      assert.ok(table.includes(locale.values[source.keys.indexOf(key)]), `${language}: ${key}`);
    }
    assert.ok(table.includes("Curing the Sick"), language);
    assert.ok(!table.includes("{{LINK:"), language);
  }
});
