import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localizeFirstDungeonCrowdControlTable } from "./localize-first-dungeon-crowd-control-table.mjs";
import { localizeGuideGameLinks } from "./localize-guide-game-links.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read("public/data/locales/wow-forever/source.json");
const labels = await read("data/guide-localization/first-dungeon-crowd-control-table.json");
const original = (await read("public/data/guides/first-dungeon.json")).html
  .split(/(?=<h2 id=)/).find((section) => section.startsWith('<h2 id="how-a-pull-works"'));

test("crowd-control table keeps spell links and uses client class and spell names", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"], ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const table = localizeFirstDungeonCrowdControlTable(original, labels[language], source, locale);
    const rendered = localizeGuideGameLinks(original.match(/<table>[\s\S]*?<\/table>/)[0], table, source, locale);
    assert.equal((rendered.match(/<tr>/g) ?? []).length, 13, language);
    assert.equal((rendered.match(/data-guide-link=/g) ?? []).length, 12, language);
    assert.ok(!rendered.includes("Damage breaks it?"), language);
    const rogueIndex = source.keys.indexOf("ChrClasses:4:0");
    const gougeIndex = source.keys.indexOf("SpellName:1776:0");
    assert.ok(rendered.includes(locale.values[rogueIndex]), `${language}: Rogue`);
    assert.ok(rendered.includes(locale.values[gougeIndex]), `${language}: Gouge`);
  }
});
