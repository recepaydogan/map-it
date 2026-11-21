import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../public/data/guides/", import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));
const locales = {
  de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW",
};
const classIds = { warrior: 1, paladin: 2, hunter: 3, rogue: 4, priest: 5,
  shaman: 7, mage: 8, warlock: 9, druid: 11 };

test("every localized guide summary is present and class menu names match the client", async () => {
  const english = await read("index.json");
  const source = await read("../locales/wow-forever/source.json");
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  const ids = english.guides.map((guide) => guide.id).sort();
  for (const [language, clientLocale] of Object.entries(locales)) {
    const translated = await read(`locales/${language}/index.json`);
    const pack = await read(`../locales/wow-forever/${clientLocale}.json`);
    assert.equal(translated.version, 1, language);
    assert.deepEqual(Object.keys(translated.summaries).sort(), ids, language);
    for (const guide of english.guides) {
      const summary = translated.summaries[guide.id];
      assert.ok(summary.title.trim() && summary.intro.trim(), `${language}: ${guide.id}`);
      assert.ok(!/[<>]/.test(summary.title + summary.intro), `${language}: ${guide.id} contains markup`);
      if (guide.group !== "class") continue;
      const classId = classIds[guide.id.slice("leveling-".length)];
      const index = indices.get(`ChrClasses:${classId}:0`);
      assert.equal(summary.menuLabel, pack.values[index], `${language}: ${guide.id} class name`);
    }
  }
});
