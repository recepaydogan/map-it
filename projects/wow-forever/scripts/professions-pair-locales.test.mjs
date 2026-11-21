import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeProfessionsPairTable } from "./lib/localize-professions-pair-table.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const guide = read("../public/data/guides/professions.json");
const labels = read("../data/guide-localization/professions-pair-table.json");
const section = guide.html.match(/<h2 id="picking-your-two-professions"[\s\S]*?(?=<h2 id=|$)/)?.[0];

test("six profession pair rows keep their roles and client term placeholders", () => {
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const table = localizeProfessionsPairTable(section, labels[language] ?? labels.es);
    assert.equal([...table.matchAll(/<tr><td>/g)].length, 6, language);
    assert.ok(table.includes("{{CLIENT:SkillLine:182:0|Herbalism}}"), language);
    assert.ok(table.includes("{{CLIENT:ItemSparse:279956:4|Mana Well}}"), language);
    assert.ok(table.includes("{{CLIENT:ItemSparse:279950:4|Reagent Bot}}"), language);
    assert.equal([...table.matchAll(/<td>/g)].length, 18, language);
  }
});
