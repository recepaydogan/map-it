import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const directory = new URL("../public/data/locales/wow-forever/", import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, directory), "utf8"));

test("client game locale packs retain source row alignment and known game terms", async () => {
  const source = await read("source.json");
  const provenance = await read("provenance.json");
  assert.equal(source.version, 1);
  assert.equal(source.keys.length, source.values.length);
  assert.equal(source.keys.length, provenance.sourceStrings);
  assert.equal(new Set(source.keys).size, source.keys.length);
  const examples = {
    "SpellName:635:0": { enUS: "Holy Light", deDE: "Heiliges Licht", frFR: "Lumière sacrée", koKR: "성스러운 빛", zhCN: "圣光术", zhTW: "聖光術" },
    "AreaTable:1519:1": { enUS: "Stormwind City", deDE: "Sturmwind", frFR: "Hurlevent", ptBR: "Ventobravo" },
    "ChrClasses:1:0": { enUS: "Warrior", deDE: "Krieger", esES: "Guerrero", koKR: "전사" },
    "ItemSparse:25:4": { enUS: "Worn Shortsword", deDE: "Abgenutztes Kurzschwert", frFR: "Vieille épée courte" },
    "AuctionHouse:7:0": { enUS: "Blackwater Auction House", deDE: "Auktionshaus der Schwarzmeerräuber", esES: "Casa de subastas de Aguasnegras", zhTW: "黑水灣拍賣場" },
    "GameObjects:50484:0": { enUS: "Cloudweaver's Baskets", deDE: "Cloudweavers Körbe", frFR: "Paniers de Tissenuées", koKR: "구름매듭 바구니", zhCN: "织云者的篮子" },
    "AreaPOI:950:0": { enUS: "Maclure Vineyards", deDE: "Weinberge der Maclures" },
    "TaxiNodes:6:0": { enUS: "Ironforge, Dun Morogh", esES: "Forjaz, Dun Morogh", zhCN: "铁炉堡，丹莫罗" },
    "WMOAreaTable:144590:0": { enUS: "The Drowned City", deDE: "Die Versunkene Stadt", esMX: "La Ciudad Anegada" },
    "SpellFocusObject:283:0": { enUS: "Equinex Monolith", deDE: "Equinex-Monolith", koKR: "에퀴넥스 비석탑" },
  };
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  for (const [key, expected] of Object.entries(examples)) {
    const index = indices.get(key);
    assert.notEqual(index, undefined, key);
    assert.equal(source.values[index], expected.enUS, key);
  }
  for (const locale of provenance.locales.filter((value) => value !== "enUS")) {
    const pack = await read(`${locale}.json`);
    assert.equal(pack.version, 1, locale);
    assert.equal(pack.values.length, source.keys.length, locale);
    assert.equal(pack.values.filter(Boolean).length,
      provenance.counts[locale] + provenance.supplements.counts[locale], locale);
    assert.ok(pack.values.every((value) => typeof value === "string" && value.length),
      `${locale} has an empty client locale record`);
    for (const [key, expected] of Object.entries(examples)) {
      if (expected[locale]) assert.equal(pack.values[indices.get(key)], expected[locale], `${locale} ${key}`);
    }
  }
  const spanish = await read("esES.json");
  const mexicanSpanish = await read("esMX.json");
  for (const key of ["ItemSparse:12533:4", "ItemSparse:12736:4", "ItemSparse:20378:4"]) {
    assert.equal(spanish.values[indices.get(key)], mexicanSpanish.values[indices.get(key)], key);
  }
});
