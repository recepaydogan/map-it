import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localizePaladinRacialTable } from "./lib/localize-paladin-racial-table.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const guide = await read("public/data/guides/leveling-paladin.json");
const source = await read("public/data/locales/wow-forever/source.json");
const labels = await read("data/guide-localization/paladin-racial-table.json");
const raceSection = guide.html.split(/(?=<h2 id=)/)
  .find((section) => section.startsWith('<h2 id="choosing-a-race"'));
const sourceTable = raceSection.match(/<table>[\s\S]*?<\/table>/)?.[0];
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

test("Paladin racial tables keep client races and every racial link in all languages", async () => {
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const table = localizePaladinRacialTable(raceSection, labels[language], source, locale);
    assert.equal((table.match(/<tr><td>/g) ?? []).length, 3, language);
    assert.deepEqual(links(table), links(sourceTable), language);
    for (const id of [1, 3, 5]) {
      const index = source.keys.indexOf(`ChrRaces:${id}:2`);
      assert.ok(table.includes(locale.values[index]), `${language}: race ${id}`);
    }
    assert.ok(!table.includes("(more "), `${language}: English racial note`);
  }
});
