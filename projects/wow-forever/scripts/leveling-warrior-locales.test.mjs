import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read("public/data/guides/leveling-warrior.json");
const glossary = await read("public/data/locales/wow-forever/source.json");
const indices = new Map(glossary.keys.map((key, index) => [key, index]));
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

test("complete Warrior guides retain all source references and client terms", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const guide = await read(`public/data/guides/locales/${language}/leveling-warrior.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      source.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(source.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length,
      (source.html.match(/<table>/g) ?? []).length, language);
    assert.ok(!guide.html.includes("{{"), `${language}: unresolved template`);
    for (const sourceOnly of [">changes tab</a>", ">Warrior outlook</a>",
      ">talent calculator</a>", ">Warrior Specs, builds &amp; PvP tab</a>"]) {
      assert.ok(!guide.html.includes(sourceOnly), `${language}: ${sourceOnly}`);
    }
    for (const key of ["SpellName:100:0", "SpellName:1310185:0", "ChrRaces:1:2",
      "ItemSparse:9542:4", "AreaTable:16593:1", "LFGDungeons:17:0"]) {
      assert.ok(guide.html.includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
  }
});
