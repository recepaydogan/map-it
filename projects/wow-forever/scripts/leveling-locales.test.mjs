import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/leveling.json");
const source = await read("public/data/locales/wow-forever/source.json");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const tableRows = (html) => [...html.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([table]) =>
  [...table.matchAll(/<tr><td>([\s\S]*?)<\/tr>/g)].map(([row]) =>
    [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map(([, cell]) => cell)));
const links = (html) => [...html.matchAll(/<a\b[^>]*data-guide-link="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
  .map(([, id, label]) => ({ id, label }));

test("leveling routes retain numbers and links while using installed-client names", async () => {
  const sourceRows = tableRows(original.html);
  const sourceLinks = links(original.html);
  assert.deepEqual(sourceRows.map((rows) => rows.length), [8, 13, 10, 14, 9]);
  for (const [language, code] of Object.entries(codes)) {
    const guide = await read(`public/data/guides/locales/${language}/leveling.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const rows = tableRows(guide.html);
    const translatedLinks = links(guide.html);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(translatedLinks.map(({ id }) => id), sourceLinks.map(({ id }) => id), language);
    assert.deepEqual(rows.map((entries) => entries.length), [8, 13, 10, 14, 9], language);
    assert.ok(!guide.html.includes("{{"), language);
    for (const tableIndex of [1, 2]) {
      rows[tableIndex].forEach((cells, position) => {
        assert.equal(cells[0], sourceRows[tableIndex][position][0], `${language}: route level`);
        if (/^\d+$/.test(sourceRows[tableIndex][position][2])) {
          assert.equal(cells[2], sourceRows[tableIndex][position][2], `${language}: quest count`);
        }
      });
    }
    rows[3].forEach((cells, position) => {
      assert.equal(cells[3], sourceRows[3][position][3], `${language}: player limit`);
    });
    for (const [position, id] of [1, 2, 3, 4, 5, 7, 8, 9, 11].entries()) {
      const index = indices.get(`ChrClasses:${id}:0`);
      assert.equal(rows[4][position][0], locale.values[index], `${language}: class ${id}`);
    }
    for (const [linkId, key] of [
      ["dungeon:mapgenie-instance-949820", "Map:3065:1"],
      ["map-pin:1453:50.35:66.18", "AreaTable:1519:1"],
    ]) {
      const match = translatedLinks.find(({ id }) => id === linkId);
      assert.equal(match?.label, locale.values[indices.get(key)], `${language}: ${linkId}`);
    }
    assert.ok(guide.html.includes(locale.values[indices.get("LFGDungeons:17:0")]),
      `${language}: Scarlet Monastery`);
    for (const [english, key, row] of [
      ["Tidegear Coast", "TaxiNodes:3205:0", 2],
      ["Fishing Village", "TaxiNodes:57:0", 3],
    ]) {
      const native = locale.values[indices.get(key)].split(/, |，| - | \(/)[0];
      assert.ok(native && native !== english && rows[1][row][4].includes(native) &&
        !rows[1][row][4].includes(english),
        `${language}: client flight point ${english}`);
    }
  }
});
