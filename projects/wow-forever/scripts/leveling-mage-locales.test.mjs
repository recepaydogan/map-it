import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/leveling-mage.json");
const source = await read("public/data/locales/wow-forever/source.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const questIndex = entitySource.keys.findIndex((key, index) =>
  key.startsWith("Quest:") && entitySource.values[index] === "Glyphic Letter");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);
const section = (html, id) => html.split(/(?=<h[23] id=)/)
  .find((part) => part.startsWith(`<h2 id="${id}"`) || part.startsWith(`<h3 id="${id}"`));
const rowCount = (html, id) => (section(html, id)?.match(/<tr><td>/g) ?? []).length;

test("Mage source spell links use the installed client's canonical names", () => {
  for (const [, id, label] of original.html.matchAll(/data-guide-link="spell:(\d+)"[^>]*>([^<]+)<\/a>/g)) {
    assert.equal(label, source.values[indices.get(`SpellName:${id}:0`)], `spell ${id}`);
  }
});

test("complete Mage guides retain client names and the source's technical content", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const guide = await read(`public/data/guides/locales/${language}/leveling-mage.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const entityLocale = await read(`public/data/locales/wow-forever/map-entity-${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length, 5, language);
    assert.ok(!guide.html.includes("{{"), `${language}: unresolved template`);
    for (const [id, expected] of [["choosing-a-race", 6], ["your-spells-level-by-level", 69],
      ["talents-which-spec-to-level", 6], ["class-quests-up-to-30", 9]]) {
      assert.equal(rowCount(guide.html, id), expected, `${language}: ${id}`);
    }
    for (const key of ["ChrRaces:95:2", "AreaTable:16593:1", "SpellName:400640:0",
      "SpellName:1312934:0", "ItemSparse:5514:4", "DungeonEncounter:3480:0"]) {
      assert.ok(guide.html.includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
    assert.ok(entityLocale.values[questIndex] && guide.html.includes(entityLocale.values[questIndex]),
      `${language}: localized Classic quest identity`);
    assert.ok(guide.html.includes("1.60.1.70205"), `${language}: beta build qualifier`);
  }
});
