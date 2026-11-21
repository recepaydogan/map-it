import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeProfessionsRankTables } from "./lib/localize-professions-rank-tables.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const guide = read("../public/data/guides/professions.json");
const labels = read("../data/guide-localization/professions-rank-tables.json");
const section = guide.html.match(/<h2 id="ranks-and-how-far-you-can-go-by-level-30"[\s\S]*?(?=<h2 id=|$)/)?.[0];

test("profession rank tables retain client caps and Classic trainer levels", () => {
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const [caps, levels] = localizeProfessionsRankTables(section,
      labels[language] ?? labels.es);
    assert.deepEqual([...caps.matchAll(/<tr><td>[^<]+<\/td><td>(\d+)<\/td><\/tr>/g)]
      .map(([, cap]) => Number(cap)), [75, 150, 225, 300], language);
    assert.equal([...levels.matchAll(/<tr><td>/g)].length, 7, language);
    assert.ok(levels.includes("{{CLIENT:SkillLine:171:0|Alchemy}}"), language);
    assert.ok(levels.includes("{{CLIENT:SkillLine:356:0|Fishing}}"), language);
    assert.ok(levels.includes(`1 (${(labels[language] ?? labels.es).client})`), language);
  }
});
