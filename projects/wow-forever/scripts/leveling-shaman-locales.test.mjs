import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/leveling-shaman.json");
const source = await read("public/data/locales/wow-forever/source.json");
const shamanQuestNames = await read("data/guide-localization/shaman-quest-names.json");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);
const section = (html, id) => html.split(/(?=<h2 id=)/)
  .find((part) => part.startsWith(`<h2 id="${id}"`));

test("complete Shaman guides keep client terms, quest caveats, and published structure", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const guide = await read(`public/data/guides/locales/${language}/leveling-shaman.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length,
      (original.html.match(/<table>/g) ?? []).length, language);
    assert.ok(!guide.html.includes("{{"), `${language}: unresolved template`);
    for (const [id, expected] of [["choosing-a-race", 5],
      ["totems-shocks-and-weapon-imbues", 15], ["your-abilities-level-by-level", 74],
      ["talents-which-spec-to-level-with", 6], ["class-quests-up-to-30", 9],
      ["what-forever-changed-for-shamans", 5]]) {
      assert.equal((section(guide.html, id)?.match(/<tr><td>/g) ?? []).length,
        expected, `${language}: ${id}`);
    }
    for (const key of ["ChrRaces:96:2", "AreaTable:16593:1", "SpellName:8177:0",
      "ItemSparse:5175:4", "DungeonEncounter:3480:0", "LFGDungeons:17:0"]) {
      assert.ok(guide.html.includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
    assert.ok(guide.html.includes(shamanQuestNames[language]["Call of Earth"]),
      `${language}: localized Classic quest name`);
  }
});
