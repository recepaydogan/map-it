import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read("public/data/locales/wow-forever/source.json");
const original = await read("public/data/guides/first-dungeon.json");
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const bossNames = ["Oggleflint", "Taragaman the Hungerer", "Jergosh the Invoker", "Bazzalan",
  "Rhahk'Zor", "Sneed", "Miner Johnson", "Gilnid", "Mr. Smite", "Captain Greenskin",
  "Cookie", "Edwin VanCleef", "Lady Anacondra", "Lord Cobrahn", "Lord Pythas",
  "Lord Serpentis", "Skum", "Kresh", "Verdan the Everliving", "Mutanus the Devourer",
  "Faldrim Anvilmar", "Infurnus", "Plunder", "Durgen Dirgehammer", "Witherfang",
  "The Abandoned", "The Butcher", "Rath'mael", "Lordaeron Captain", "Viktor the Vile",
  "Bjork", "Saltspine", "Shadetooth", "Highland Horror", "Relic Guardian"];
const reviewedClientTerms = ["SpellName:1225500:0", "SpellName:1225497:0",
  "WMOAreaTable:144590:0", "WMOAreaTable:137677:0"];
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map((match) => match[1]);

test("all first-dungeon translations preserve guide structure and use client boss names", async () => {
  for (const [language, code] of Object.entries(codes)) {
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const guide = await read(`public/data/guides/locales/${language}/first-dungeon.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length, 5, language);
    assert.ok(!guide.html.includes("{{"), language);
    for (const english of bossNames) {
      const index = source.keys.findIndex((key, position) =>
        key.startsWith("DungeonEncounter:") && source.values[position] === english);
      assert.ok(index >= 0, `Missing client boss: ${english}`);
      assert.ok(guide.html.includes(locale.values[index]), `${language}: ${english}`);
    }
    for (const key of reviewedClientTerms) {
      const index = source.keys.indexOf(key);
      assert.ok(index >= 0 && locale.values[index], `Missing client term: ${key}`);
      assert.ok(guide.html.includes(locale.values[index]), `${language}: ${key}`);
      assert.ok(!guide.html.includes(source.values[index]),
        `${language}: English client term remains for ${key}`);
    }
  }
});
