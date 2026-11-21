import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/making-money.json");
const source = await read("public/data/locales/wow-forever/source.json");
const indices = new Map(source.keys.map((key, index) => [key, index]));
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const links = (html) => [...html.matchAll(/<a\b[^>]*data-guide-link="([^"]+)"[^>]*>([^<]*)<\/a>/g)]
  .map(([, id, label]) => ({ id, label }));

test("money guides retain all links and use client item, spell and auction names", async () => {
  const sourceLinks = links(original.html);
  for (const [language, code] of Object.entries(codes)) {
    const guide = await read(`public/data/guides/locales/${language}/making-money.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const translatedLinks = links(guide.html);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(translatedLinks.map(({ id }) => id), sourceLinks.map(({ id }) => id), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length, 6, language);
    assert.ok(!guide.html.includes("{{"), language);
    sourceLinks.forEach(({ id, label }, position) => {
      const [kind, numericId] = id.split(":");
      if (kind !== "item" && kind !== "spell") return;
      const key = `${kind === "item" ? "ItemSparse" : "SpellName"}:${numericId}:${kind === "item" ? 4 : 0}`;
      const index = indices.get(key);
      if (index === undefined || source.values[index] !== label || !locale.values[index]) return;
      assert.equal(translatedLinks[position].label, locale.values[index], `${language}: ${id}`);
    });
    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      const index = indices.get(`AuctionHouse:${id}:0`);
      assert.ok(guide.html.includes(locale.values[index]), `${language}: auction house ${id}`);
    }
  }
});
