import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeProfessionsCampingTable } from "./lib/localize-professions-camping-table.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const guide = read("../public/data/guides/professions.json");
const labels = read("../data/guide-localization/professions-camping-table.json");
const section = guide.html.match(/<h2 id="camping-what-each-profession-adds"[\s\S]*?(?=<h2 id=|$)/)?.[0];
const sourceTable = section.match(/<table>[\s\S]*?<\/table>/)?.[0];
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, link]) => link);

test("camping tables retain all profession rows, item links and skill gates", () => {
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const table = localizeProfessionsCampingTable(section, labels[language] ?? labels.es);
    assert.equal([...table.matchAll(/<tr><td>/g)].length, 12, language);
    assert.deepEqual(links(table), links(sourceTable), language);
    assert.equal([...table.matchAll(/<td>{{CLIENT:SkillLine:/g)].length, 12, language);
    assert.ok(table.includes("{{LINK:") === false, language);
    assert.ok(table.includes("<table>") && !table.slice(7).includes("<table>"), language);
  }
});
