import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/leveling-rogue.json");
const source = await read("public/data/locales/wow-forever/source.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const questIndex = entitySource.keys.findIndex((key, index) =>
  key.startsWith("Quest:") && entitySource.values[index] === "Mathias and the Defias");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);
const section = (html, id) => html.split(/(?=<h2 id=)/)
  .find((part) => part.startsWith(`<h2 id="${id}"`));

test("complete Rogue guides retain client references and published data", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const guide = await read(`public/data/guides/locales/${language}/leveling-rogue.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const entityLocale = await read(`public/data/locales/wow-forever/map-entity-${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length,
      (original.html.match(/<table>/g) ?? []).length, language);
    assert.ok(!guide.html.includes("{{"), `${language}: unresolved template`);
    for (const [id, expected] of [["choosing-a-race", 9], ["how-a-rogue-fights", 10],
      ["your-abilities-level-by-level", 43], ["class-quests-up-to-30", 30]]) {
      assert.equal((section(guide.html, id)?.match(/<tr><td>/g) ?? []).length,
        expected, `${language}: ${id}`);
    }
    for (const key of ["ChrRaces:4:2", "ChrRaces:95:2", "AreaTable:16593:1",
      "SpellName:13877:0", "ItemSparse:252490:4", "LFGDungeons:17:0"]) {
      assert.ok(guide.html.includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
    assert.ok(entityLocale.values[questIndex] && guide.html.includes(entityLocale.values[questIndex]),
      `${language}: localized Classic quest name`);
  }
});
