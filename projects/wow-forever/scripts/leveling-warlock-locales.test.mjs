import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/leveling-warlock.json");
const questTitles = await read("data/quest-title-localization/polestar-forever-partial-titles.json");
const source = await read("public/data/locales/wow-forever/source.json");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);
const section = (html, id) => html.split(/(?=<h[23] id=)/)
  .find((part) => part.startsWith(`<h2 id="${id}"`) || part.startsWith(`<h3 id="${id}"`));
const rowCount = (html, id) => (section(html, id)?.match(/<tr><td>/g) ?? []).length;

test("complete Warlock guides retain client terminology and published data", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const guide = await read(`public/data/guides/locales/${language}/leveling-warlock.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length,
      (original.html.match(/<table>/g) ?? []).length, language);
    assert.ok(!guide.html.includes("{{"), `${language}: unresolved template`);
    for (const [id, expected] of [["choosing-a-race", 5], ["your-spells-level-by-level", 61],
      ["your-demons-which-one-when", 4], ["talents-which-spec-to-level", 3],
      ["talents-at-30", 3], ["class-quests-up-to-30", 10],
      ["dungeons-from-20-to-30", 9]]) {
      assert.equal(rowCount(guide.html, id), expected, `${language}: ${id}`);
    }
    for (const key of ["ChrRaces:7:2", "SpellName:755:0", "SpellName:19028:0",
      "ItemSparse:6487:4", "LFGDungeons:17:0"]) {
      assert.ok(guide.html.includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
    const questTitle = language === "pt-BR" ? "Familiares Vis"
      : questTitles.titles["Vile Familiars"][language];
    assert.ok(section(guide.html, "class-quests-up-to-30")?.includes(questTitle),
      `${language}: ID-matched Durotar Warlock quest name`);
    assert.ok(!section(guide.html, "class-quests-up-to-30")?.includes("Vile Familiars"),
      `${language}: English Durotar Warlock quest name`);
  }
});
