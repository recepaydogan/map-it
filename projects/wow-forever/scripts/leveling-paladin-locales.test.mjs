import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/leveling-paladin.json");
const source = await read("public/data/locales/wow-forever/source.json");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

test("complete Paladin guides preserve progression, links and client terms", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const guide = await read(`public/data/guides/locales/${language}/leveling-paladin.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length,
      (original.html.match(/<table>/g) ?? []).length, language);
    assert.ok(!guide.html.includes("{{"), `${language}: unresolved template`);
    for (const key of ["SpellName:679:0", "SpellName:1311606:0", "SpellName:20375:0",
      "SpellName:1038:0", "SkillLine:184:0", "ChrRaces:1:2", "LFGDungeons:17:0"]) {
      assert.ok(guide.html.includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
    const abilityTable = guide.html.match(/<h2 id="abilities-by-level">[\s\S]*?<\/table>/)?.[0];
    assert.equal((abilityTable?.match(/<tr><td>/g) ?? []).length, 58, language);
  }
});
