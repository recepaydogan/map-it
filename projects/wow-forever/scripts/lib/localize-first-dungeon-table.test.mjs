import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localizeFirstDungeonTable } from "./localize-first-dungeon-table.mjs";
import { localizeGuideGameLinks } from "./localize-guide-game-links.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = (await read("public/data/guides/first-dungeon.json")).html
  .split(/(?=<h2 id=)/).find((section) => section.startsWith('<h2 id="dungeons-you-can-run-now"'));
const source = await read("public/data/locales/wow-forever/source.json");
const labels = await read("data/guide-localization/first-dungeon-table.json");
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };

test("every localized dungeon table preserves rows and links while translating its labels", async () => {
  for (const [language, gameLocale] of Object.entries(codes)) {
    const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
    const table = localizeFirstDungeonTable(original, labels[language], source, pack);
    const rendered = localizeGuideGameLinks(original.match(/<table>[\s\S]*?<\/table>/)[0], table, source, pack);
    assert.equal((rendered.match(/<tr>/g) ?? []).length, 15, language);
    assert.equal((rendered.match(/data-guide-link=/g) ?? []).length,
      (table.match(/data-guide-link=/g) ?? []).length, language);
    assert.ok(!/None in our data yet|Not on the client's map yet|new in Forever/.test(rendered), language);
    assert.ok(!rendered.includes("Scarlet Monastery"), language);
    const digSiteIndex = source.keys.indexOf("AreaTable:118:1");
    assert.ok(rendered.includes(pack.values[digSiteIndex]), `${language}: Whelgar's Excavation Site`);
  }
});
