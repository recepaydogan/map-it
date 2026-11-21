import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeProfessionsSkillColorsTable } from "./lib/localize-professions-skill-colors-table.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const guide = read("../public/data/guides/professions.json");
const labels = read("../data/guide-localization/professions-skill-colors-table.json");
const section = guide.html.match(/<h2 id="how-skill-ups-and-recipe-colors-work"[\s\S]*?(?=<h2 id=|$)/)?.[0];
const sourceTable = section.match(/<table>[\s\S]*?<\/table>/)?.[0];

test("recipe colors preserve client thresholds, links and profession identities", () => {
  const sourceLinks = [...sourceTable.matchAll(/data-guide-link="([^"]+)"/g)]
    .map(([, link]) => link);
  const thresholds = [...sourceTable.matchAll(/<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)]
    .map(([, yellow, grey]) => [Number(yellow), Number(grey)]);
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const table = localizeProfessionsSkillColorsTable(section, labels[language] ?? labels.es);
    assert.deepEqual([...table.matchAll(/data-guide-link="([^"]+)"/g)]
      .map(([, link]) => link), sourceLinks, language);
    assert.deepEqual([...table.matchAll(/<\/td><td>(\d+)<\/td><td>(\d+)<\/td><\/tr>/g)]
      .map(([, yellow, grey]) => [Number(yellow), Number(grey)]), thresholds, language);
    assert.equal([...table.matchAll(/<tr><td>/g)].length, 8, language);
    assert.ok(table.includes("{{CLIENT:SkillLine:129:0|First Aid}}"), language);
  }
});
