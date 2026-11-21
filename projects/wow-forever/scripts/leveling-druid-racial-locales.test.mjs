import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeDruidRacialTable } from "./lib/localize-druid-racial-table.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const source = read("../public/data/locales/wow-forever/source.json");
const guide = read("../public/data/guides/leveling-druid.json");
const labels = read("../data/guide-localization/druid-racial-table.json");
const section = guide.html.match(/<h2 id="choosing-a-race"[\s\S]*?(?=<h2 id=|$)/)?.[0];
const sourceLinks = [...section.matchAll(/data-guide-link="([^"]+)"/g)].slice(0, 16)
  .map(([, link]) => link);

test("Druid racial rows keep client race/zone names and all source spell links", () => {
  const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
    "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  for (const [language, code] of Object.entries(codes)) {
    const locale = read(`../public/data/locales/wow-forever/${code}.json`);
    const table = localizeDruidRacialTable(section, labels[language] ?? labels.es, source, locale);
    assert.equal([...table.matchAll(/<tr><td>/g)].length, 4, language);
    assert.deepEqual([...table.matchAll(/data-guide-link="([^"]+)"/g)].map(([, link]) => link),
      sourceLinks, language);
    for (const key of ["ChrRaces:4:2", "ChrRaces:95:2", "ChrRaces:6:2", "ChrRaces:96:2",
      "AreaTable:141:1", "AreaTable:16593:1", "AreaTable:215:1"]) {
      const index = source.keys.indexOf(key);
      assert.ok(table.includes(locale.values[index]), `${language}: ${key}`);
    }
    assert.ok(!table.includes("{{LINK:"), language);
  }
});
