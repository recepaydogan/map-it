import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const guide = read("../public/data/guides/professions.json");
const source = read("../public/data/locales/wow-forever/source.json");
const locales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, link]) => link);
const tableRows = (html) => [...html.matchAll(/<table>[\s\S]*?<\/table>/g)]
  .map(([table]) => [...table.matchAll(/<tr(?:>|\s)/g)].length);

test("all eight profession guides preserve 12 sections, source links and client terms", () => {
  for (const [language, code] of Object.entries(locales)) {
    const translated = read(`../public/data/guides/locales/${language}/professions.json`);
    const locale = read(`../public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(translated.headings.map(({ id, depth }) => ({ id, depth })),
      guide.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(translated.html), links(guide.html), language);
    assert.deepEqual(tableRows(translated.html), tableRows(guide.html), language);
    assert.ok(!translated.html.includes("{{"), `${language}: unresolved template`);
    const mapLabels = [...translated.html.matchAll(
      /data-guide-link="map-view:zephras-isle"[^>]*>([^<]+)<\/a>/g)].map((match) => match[1]);
    assert.equal(mapLabels.length, 2, `${language}: island map links`);
    assert.ok(mapLabels.every((label) => !label.includes("Open the ")),
      `${language}: English island map link`);
    for (const key of ["SkillLine:171:0", "SkillLine:164:0", "SkillLine:129:0",
      "ItemSparse:279956:4", "AreaTable:12:1", "SpellName:1225451:0"]) {
      const index = source.keys.indexOf(key);
      assert.ok(translated.html.includes(locale.values[index]), `${language}: ${key}`);
    }
  }
});
