import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localizeMakingMoneyAuctionTable } from "./lib/localize-making-money-auction-table.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = await read("public/data/locales/wow-forever/source.json");
const guide = await read("public/data/guides/making-money.json");
const labels = await read("data/guide-localization/making-money-auction-table.json");
const section = guide.html.split(/(?=<h2 id=)/)
  .find((part) => part.startsWith('<h2 id="where-the-auction-houses-are">'));
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };

test("auction table uses each installed locale's house names and retains the client rates", async () => {
  for (const [language, code] of Object.entries(codes)) {
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const html = localizeMakingMoneyAuctionTable(section, labels[language], source, locale, language);
    assert.equal((html.match(/<tr><td>/g) ?? []).length, 3, language);
    assert.ok(html.includes("<td>25%</td><td>15%</td>"), language);
    for (const id of [1, 2, 3, 4, 5, 6, 7]) {
      const index = source.keys.indexOf(`AuctionHouse:${id}:0`);
      assert.ok(html.includes(locale.values[index]), `${language}: auction house ${id}`);
    }
  }
});
