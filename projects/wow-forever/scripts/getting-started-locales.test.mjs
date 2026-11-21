import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/getting-started.json");
const source = await read("public/data/locales/wow-forever/source.json");
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const raceIds = [1, 3, 4, 7, 95, 2, 5, 6, 8, 96];
const classIds = [1, 2, 3, 4, 5, 7, 8, 9, 11];
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map((match) => match[1]);
const clientName = (locale, key) => {
  const index = source.keys.indexOf(key);
  assert.ok(index >= 0, `Client key missing: ${key}`);
  assert.ok(locale.values[index], `Client locale missing: ${key}`);
  return locale.values[index];
};

test("all getting-started translations preserve every guide link and use client race/class names", async () => {
  for (const [language, code] of Object.entries(codes)) {
    const guide = await read(`public/data/guides/locales/${language}/getting-started.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length, 3, language);
    assert.ok(!guide.html.includes("{{"), language);
    for (const id of raceIds) {
      assert.ok(guide.html.includes(clientName(locale, `ChrRaces:${id}:2`)),
        `${language}: race ${id}`);
    }
    for (const id of classIds) {
      assert.ok(guide.html.includes(clientName(locale, `ChrClasses:${id}:0`)),
        `${language}: class ${id}`);
    }
    for (const id of [20597, 1259719, 20574]) {
      const linked = guide.html.match(new RegExp(`data-guide-link="spell:${id}">([^<]+)</a>`));
      assert.equal(linked?.[1], clientName(locale, `SpellName:${id}:0`),
        `${language}: current racial spell ${id}`);
    }
  }
});
