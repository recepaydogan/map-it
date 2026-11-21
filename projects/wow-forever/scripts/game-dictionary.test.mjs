import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { createGameDictionary, getKeyedGameText, normalizeReviewedItemDescription,
  REVIEWED_ITEM_DESCRIPTION_FORMAT_IDS, REVIEWED_ITEM_NAME_ALIASES } from "../src/i18n/game-dictionary.ts";

const base = new URL("../public/data/locales/wow-forever/", import.meta.url);
const read = async (name) => JSON.parse(await readFile(new URL(name, base), "utf8"));

test("name lookups use localized display fields while keyed lookups retain client values", async () => {
  const source = await read("source.json");
  const expectations = {
    deDE: { Darkshore: "Dunkelküste", Dwarf: "Zwerg", "Thunder Bluff": "Donnerfels" },
    frFR: { Darkshore: "Sombrivage", Dwarf: "Nain", "Thunder Bluff": "Pitons-du-Tonnerre" },
    koKR: { Darkshore: "어둠의 해안", Auberdine: "아우버다인", Dwarf: "드워프" },
    zhCN: { Darkshore: "黑海岸", Southshore: "南海镇", Dwarf: "矮人" },
  };
  for (const [language, expected] of Object.entries(expectations)) {
    const dictionary = createGameDictionary(source, await read(`${language}.json`));
    for (const [english, translated] of Object.entries(expected)) {
      assert.equal(dictionary.byEnglish.get(english), translated, `${language}: ${english}`);
    }
    if (expected["Thunder Bluff"]) {
      assert.equal(dictionary.byKey.get("AreaTable:1638:1"), expected["Thunder Bluff"],
        `${language}: alternate client city name`);
    }
    if (language === "frFR") {
      assert.equal(dictionary.byKey.get("AreaTable:16134:1"), "Sombre-Comté");
    }
    assert.equal(dictionary.byKey.get("AreaTable:148:0"), "Darkshore",
      `${language}: raw client field must remain available by key`);
    assert.equal(dictionary.byKey.get("AreaTable:148:1"), expected.Darkshore,
      `${language}: the visible area field must not retain an English gloss`);
  }
});

test("ambiguous unrelated names do not acquire a guessed translation", () => {
  const source = { version: 1, keys: ["SpellName:1:0", "SpellName:2:0"],
    values: ["Same", "Same"] };
  const locale = { version: 1, values: ["First", "Second"] };
  assert.equal(createGameDictionary(source, locale).byEnglish.get("Same"), undefined);
});

test("obsolete item text cannot borrow the new item's translated name", async () => {
  const dictionary = createGameDictionary(await read("source.json"), await read("zhCN.json"));
  assert.equal(getKeyedGameText(dictionary, "Concoction of Cleansing", "ItemSparse:267079:4"), undefined);
  assert.equal(dictionary.sourceByKey.get("ItemSparse:267079:4"), "Staff of the Mountain");
  assert.equal(getKeyedGameText(dictionary, "Staff of the Mountain", "ItemSparse:267079:4"),
    "山脉法杖");
  assert.equal(getKeyedGameText(dictionary, "Concoction of Cleansing", "ItemSparse:268298:4"),
    "净化混合剂");
  assert.equal(dictionary.byEnglish.get("Concoction of Cleansing"), "净化混合剂");
});

test("replaced quest items use current identities and native Blackthorne faction text", async () => {
  const catalog = JSON.parse(await readFile(new URL(
    "../public/data/items/catalog.json", import.meta.url), "utf8"));
  const glowing = catalog.items.find((item) => item.id === "273845");
  const mountain = catalog.items.find((item) => item.id === "267079");
  assert.equal(glowing.name, "Faintly Glowing Staff");
  assert.equal(glowing.description, undefined);
  assert.equal(glowing.icon, "data/items/site-icons/faintly-glowing-staff.webp");
  assert.equal(mountain.name, "Staff of the Mountain");
  assert.equal(mountain.icon, "data/items/site-icons/inv_staff_25.jpg");
  const effect = mountain.siteEffects[0].text;
  const source = await read("source.json");
  const factionNames = {
    deDE: "Blackthorne-Pakt", esES: "Pacto Endrino", esMX: "Pacto Puanegra",
    frFR: "Pacte Noirépine", koKR: "검은가시 서약단", ptBR: "Pacto dos Aguilhanegra",
    zhCN: "黑棘契约", zhTW: "黑荊教團",
  };
  for (const [locale, faction] of Object.entries(factionNames)) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    const pack = await read(`item-effects-${locale}.json`);
    const translation = pack.translations[effect];
    assert.ok(translation?.includes(faction), `${locale}: native faction in effect`);
    assert.ok(dictionary.byKey.get("ItemSparse:267079:4") !== mountain.name);
    assert.ok(dictionary.byKey.get("ItemSparse:273845:4") !== glowing.name);
  }
});

test("reviewed visible item gaps resolve by exact item and field identity", async () => {
  const source = await read("source.json");
  const catalog = JSON.parse(await readFile(new URL(
    "../public/data/items/catalog.json", import.meta.url), "utf8"));
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-visible-item-gaps.json", import.meta.url), "utf8"));
  const items = new Map(catalog.items.map((item) => [item.id, item]));
  for (const [id, record] of Object.entries(reviewed.items)) {
    const item = items.get(id);
    assert.equal(item?.name, record.name);
    for (const [field, entry] of Object.entries(record.fields)) {
      const key = `ItemSparse:${id}:${field}`;
      for (const [locale, translation] of Object.entries(entry.translations)) {
        const dictionary = createGameDictionary(source, await read(`${locale}.json`));
        assert.equal(dictionary.sourceByKey.get(key), entry.english);
        assert.equal(getKeyedGameText(dictionary,
          field === "4" ? item.name : item.description, key), translation.text);
      }
    }
  }
});

test("Chinese debug and deprecated items keep their exact native base names", async () => {
  const source = await read("source.json");
  for (const locale of ["zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const [targetId, baseId] of [["11613", "11147"], ["11616", "11148"],
      ["20487", "18715"], ["20488", "18713"]]) {
      const target = dictionary.byKey.get(`ItemSparse:${targetId}:4`);
      const base = dictionary.byKey.get(`ItemSparse:${baseId}:4`);
      assert.ok(target.includes(base), `${locale}: ${targetId} native base`);
      assert.notEqual(target, base, `${locale}: ${targetId} status marker`);
    }
    for (const id of ["3528", "3533", "3535", "3537", "3538"]) {
      assert.match(dictionary.byKey.get(`ItemSparse:${id}:4`), /(?:C03|D02)/);
    }
  }
});

test("German and Portuguese transmog placeholders use their native system term", async () => {
  const source = await read("source.json");
  for (const [locale, systemTerm] of [["deDE", "Transmogrifikation"],
    ["ptBR", "transmogrificação"]]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    assert.ok(dictionary.byKey.get("SpellName:1247613:0")
      .toLocaleLowerCase().includes(systemTerm.toLocaleLowerCase()));
    for (const id of ["135510", "135522", "135548", "135549", "135550"]) {
      assert.ok(dictionary.byKey.get(`ItemSparse:${id}:4`).includes(systemTerm),
        `${locale}: transmog placeholder ${id}`);
    }
  }
});

test("French musty missive follows native letter and missive terminology", async () => {
  const dictionary = createGameDictionary(await read("source.json"), await read("frFR.json"));
  assert.equal(dictionary.byKey.get("ItemSparse:6279:4"), "Lettre moisie");
  assert.equal(dictionary.byKey.get("ItemSparse:219918:4"), "Missive sanglante");
  assert.equal(dictionary.byKey.get("ItemSparse:6280:4"), "Missive moisie");
});

test("French Evoroot and Thornflinger preserve client quest and weapon meanings", async () => {
  const source = await read("source.json");
  const spanish = createGameDictionary(source, await read("esES.json"));
  const portuguese = createGameDictionary(source, await read("ptBR.json"));
  const french = createGameDictionary(source, await read("frFR.json"));
  assert.equal(spanish.byKey.get("ItemSparse:11242:4"), "Raíz del mal");
  assert.equal(portuguese.byKey.get("ItemSparse:11242:4"), "Raiz do Mal");
  assert.equal(french.byKey.get("ItemSparse:11242:4"), "Racine du mal");
  assert.equal(spanish.byKey.get("ItemSparse:16622:4"), "Lanzaespinas");
  assert.equal(portuguese.byKey.get("ItemSparse:16622:4"), "Taca-espinhos");
  assert.equal(french.byKey.get("ItemSparse:16622:4"), "Lance-épines");
});

test("reviewed catalog spelling aliases retain exact client item translations", async () => {
  const source = await read("source.json");
  const catalog = JSON.parse(await readFile(new URL("../public/data/items/catalog.json", import.meta.url), "utf8"));
  const catalogNames = new Map(catalog.items.map((item) => [item.id, item.name]));
  const dictionaries = Object.fromEntries(await Promise.all(
    ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"].map(async (locale) =>
      [locale, createGameDictionary(source, await read(`${locale}.json`))])));
  for (const [key, alias] of Object.entries(REVIEWED_ITEM_NAME_ALIASES)) {
    const id = key.split(":")[1];
    assert.equal(catalogNames.get(id), alias.catalog, `${key}: catalog identity`);
    assert.equal(source.values[source.keys.indexOf(key)], alias.client, `${key}: client identity`);
    for (const [locale, dictionary] of Object.entries(dictionaries)) {
      const localized = getKeyedGameText(dictionary, alias.catalog, key);
      assert.equal(localized, dictionary.byKey.get(key), `${locale}: ${key}`);
      assert.notEqual(localized, alias.client, `${locale}: untranslated ${key}`);
    }
  }
  assert.equal(getKeyedGameText(dictionaries.deDE, "Al'Alketh Cultist's Ear", "ItemSparse:258771:4"),
    "Ohr eines Al'Aketh-Kultisten");
});

test("renamed French items use reviewed client vocabulary", async () => {
  const source = await read("source.json");
  const dictionary = createGameDictionary(source, await read("frFR.json"));
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-fr-renamed-item-names.json",
    import.meta.url), "utf8"));
  for (const [id, record] of Object.entries(reviewed.items)) {
    assert.equal(dictionary.sourceByKey.get(`ItemSparse:${id}:4`), record.en);
    assert.equal(dictionary.byKey.get(record.referenceKey), record.referenceFrench);
    assert.equal(getKeyedGameText(dictionary, record.catalog, `ItemSparse:${id}:4`), record.fr);
  }
});

test("renamed tide idol retains its current level and matching effect", async () => {
  const catalog = JSON.parse(await readFile(new URL(
    "../public/data/items/catalog.json", import.meta.url), "utf8"));
  const idol = catalog.items.find((item) => item.id === "263411");
  assert.equal(idol.itemLevel, 16);
  assert.equal(idol.siteEffects?.[0]?.text,
    "Reduces the mana cost of shapeshifting spells by 40.");
});

test("renamed war painted cuffs display current armor and stats", async () => {
  const catalog = JSON.parse(await readFile(new URL(
    "../public/data/items/catalog.json", import.meta.url), "utf8"));
  const cuffs = catalog.items.find((item) => item.id === "277222");
  assert.equal(cuffs.itemLevel, 58);
  assert.equal(cuffs.usageLevel, undefined);
  assert.deepEqual(cuffs.sections[0].stats.map(({ label, value }) => [label, value]), [
    ["database.clientItem.stat.armor", "66"],
    ["Stamina", "+9"],
    ["Defense Rating", "+6"],
  ]);
});

test("renamed plain handwraps have current stats and localized healing effect", async () => {
  const catalog = JSON.parse(await readFile(new URL(
    "../public/data/items/catalog.json", import.meta.url), "utf8"));
  const gloves = catalog.items.find((item) => item.id === "277215");
  assert.equal(gloves.itemLevel, 58);
  assert.equal(gloves.usageLevel, undefined);
  assert.deepEqual(gloves.sections[0].stats.map(({ label, value }) => [label, value]), [
    ["database.clientItem.stat.armor", "47"],
    ["Stamina", "+17"],
  ]);
  const effect = gloves.siteEffects[0].text;
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const pack = await read(`item-effects-${locale}.json`);
    const translation = pack.translations[effect];
    assert.ok(translation && translation !== effect, `${locale}: healing effect`);
    assert.deepEqual(translation.match(/\d+/g), ["13", "4"], `${locale}: effect amounts`);
  }
});

test("renamed Shaman totem uses both native spell names in every effect locale", async () => {
  const catalog = JSON.parse(await readFile(new URL(
    "../public/data/items/catalog.json", import.meta.url), "utf8"));
  const totem = catalog.items.find((item) => item.id === "263412");
  assert.equal(totem.itemLevel, 10);
  assert.equal(totem.icon, "data/items/site-icons/inv_relics_totemofrage.jpg");
  const effect = totem.siteEffects[0].text;
  const source = await read("source.json");
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    const pack = await read(`item-effects-${locale}.json`);
    const translation = pack.translations[effect];
    assert.ok(translation && translation !== effect, `${locale}: totem effect`);
    assert.ok(translation.includes(dictionary.byKey.get("SpellName:403:0")), `${locale}: Lightning Bolt`);
    assert.ok(translation.includes(dictionary.byKey.get("SpellName:8050:0")), `${locale}: Flame Shock`);
    assert.deepEqual(translation.match(/\d+/g), ["5"], `${locale}: mana reduction`);
  }
});

test("harmless whitespace differences in item prose keep the exact client translation", async () => {
  const source = await read("source.json");
  const catalog = JSON.parse(await readFile(new URL("../public/data/items/catalog.json", import.meta.url), "utf8"));
  const item = catalog.items.find((entry) => entry.id === "286308");
  const dictionary = createGameDictionary(source, await read("deDE.json"));
  assert.notEqual(item.description, dictionary.sourceByKey.get("ItemSparse:286308:0"));
  assert.equal(getKeyedGameText(dictionary, item.description, "ItemSparse:286308:0"),
    "Kann ich einen bequemeren Sattel haben? Mein Hintern tut weh.");
});

test("reviewed item prose format differences use client translations in every locale", async () => {
  const source = await read("source.json");
  const catalog = JSON.parse(await readFile(new URL("../public/data/items/catalog.json", import.meta.url), "utf8"));
  const items = new Map(catalog.items.map((item) => [item.id, item]));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const id of REVIEWED_ITEM_DESCRIPTION_FORMAT_IDS) {
      const key = `ItemSparse:${id}:0`;
      const catalogText = items.get(id)?.description;
      const clientText = dictionary.sourceByKey.get(key);
      assert.ok(catalogText && clientText, `${id}: description identity`);
      assert.equal(normalizeReviewedItemDescription(catalogText),
        normalizeReviewedItemDescription(clientText), `${id}: same words and numbers`);
      const translated = getKeyedGameText(dictionary, catalogText, key);
      assert.ok(translated && translated !== clientText, `${locale}: ${id}`);
    }
  }
});

test("corrected catalog item prose uses the client translation in every locale", async () => {
  const ids = ["258771", "273310", "286265", "269233", "265141", "268815", "276909",
    "269008", "272025", "273308", "274396", "268813", "249494", "249477",
    "249495", "252881", "252917", "252852", "252903", "252848", "252902",
    "252851", "252901", "252900", "252926", "252850", "252884", "277673",
    "264239", "273002", "268814", "273309", "250999", "250998", "273115"];
  const source = await read("source.json");
  const catalog = JSON.parse(await readFile(new URL("../public/data/items/catalog.json", import.meta.url), "utf8"));
  const items = new Map(catalog.items.map((item) => [item.id, item]));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const id of ids) {
      const key = `ItemSparse:${id}:0`;
      const description = items.get(id)?.description;
      assert.ok(description, `${id}: catalog description`);
      assert.equal(description, dictionary.sourceByKey.get(key), `${id}: client identity`);
      const translated = getKeyedGameText(dictionary, description, key);
      assert.ok(translated && translated !== description, `${locale}: ${id}`);
    }
  }
});

test("obsolete item names reuse native base items without leaving English status labels", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-deprecated-item-names.json", import.meta.url), "utf8"));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const [kind, records] of Object.entries({
      deprecated: reviewed.deprecatedItems, old: reviewed.oldItems,
    })) {
      for (const [id, baseId] of Object.entries(records)) {
        const key = `ItemSparse:${id}:4`;
        const english = source.values[source.keys.indexOf(key)];
        const translated = dictionary.byKey.get(key);
        assert.ok(translated && translated !== english, `${locale}: ${key}`);
        if (kind === "old") {
          assert.ok(translated.includes(dictionary.byKey.get(`ItemSparse:${baseId}:4`)),
            `${locale}: native base for ${key}`);
        }
      }
    }
  }
});

test("same-item Spanish names fill only reviewed regional English gaps", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-spanish-cross-region-gaps.json", import.meta.url), "utf8"));
  for (const locale of ["esES", "esMX"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const key of locale === "esES"
      ? ["ItemSparse:8410:4", "ItemSparse:275736:4", "ItemSparse:275737:4", "ItemSparse:275738:4",
        "SpellName:1253772:0", "SpellName:365123:0"]
      : ["ItemSparse:1196:4", "ItemSparse:2209:4"]) {
      assert.equal(dictionary.byKey.get(key), reviewed.entries[locale][key].translated,
        `${locale}: ${key}`);
    }
  }
});

test("reviewed simplified Chinese item names follow exact traditional items and native spells", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-zh-cn-item-name-gaps.json", import.meta.url), "utf8"));
  const simplified = createGameDictionary(source, await read("zhCN.json"));
  const traditional = createGameDictionary(source, await read("zhTW.json"));
  for (const [id, record] of Object.entries(reviewed.items)) {
    const key = `ItemSparse:${id}:4`;
    assert.equal(source.values[source.keys.indexOf(key)], record.en);
    assert.equal(traditional.byKey.get(key), record.tw);
    assert.equal(simplified.byKey.get(key), record.zh);
    if (record.spellKey) assert.ok(record.zh.includes(simplified.byKey.get(record.spellKey)));
  }
});

test("reviewed traditional Chinese item names follow the matching native spell", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-zh-tw-item-name-gaps.json",
    import.meta.url), "utf8"));
  const simplified = createGameDictionary(source, await read("zhCN.json"));
  const traditional = createGameDictionary(source, await read("zhTW.json"));
  for (const [id, record] of Object.entries(reviewed.items)) {
    const key = `ItemSparse:${id}:4`;
    assert.equal(simplified.byKey.get(key), record.cn);
    assert.equal(traditional.byKey.get(key), record.tw);
    assert.equal(traditional.byKey.get(record.spellKey), record.spellTraditional);
  }
});

test("item descriptions use their exact client key when identical English text has regional variants", async () => {
  const source = await read("source.json");
  const key = "ItemSparse:208753:0";
  const index = source.keys.indexOf(key);
  assert.equal(source.values[index], "Teaches you a new Engraving ability.");
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const translated = await read(`${locale}.json`);
    const dictionary = createGameDictionary(source, translated);
    assert.notEqual(dictionary.byKey.get(key), source.values[index], `${locale}: item description`);
    assert.equal(dictionary.byKey.get(key), translated.values[index], `${locale}: keyed description`);
  }
  const mexican = createGameDictionary(source, await read("esMX.json"));
  assert.equal(mexican.byKey.get(key), "Te enseña una nueva habilidad de grabado.");
});

test("reused spell translations retain their meaning and numeric values", async () => {
  const source = await read("source.json");
  const chinese = await read("zhCN.json");
  const dictionary = createGameDictionary(source, chinese);
  assert.equal(dictionary.byKey.get("SpellName:2351:0"), "庇护");
  assert.equal(dictionary.byKey.get("SpellName:7520:0"), "单手剑技能提高");
  assert.equal(dictionary.byKey.get("SpellName:25065:0"), "Increase Fire Dam 20");
  assert.equal(dictionary.byKey.get("SpellName:9297:0"), "Increase Fire Dam 12");
});

test("Chinese books use matching client spell names and ranks", async () => {
  const source = await read("source.json");
  const chinese = createGameDictionary(source, await read("zhCN.json"));
  assert.equal(chinese.byKey.get("ItemSparse:967:0"),
    "教你学会施放防护冰霜结界（等级 5）。");
  assert.equal(chinese.byKey.get("ItemSparse:986:0"),
    "教你学会施放寒冰箭（等级 2）。");
  assert.equal(chinese.byKey.get("ItemSparse:1049:0"),
    "教你学会施放净化术。");
  assert.equal(chinese.byKey.get("ItemSparse:1091:0"),
    "教你学会施放圣光击（等级 2）。");
  assert.equal(chinese.byKey.get("ItemSparse:3143:4"), "魔典：燃灵术");
  assert.equal(chinese.byKey.get("ItemSparse:1229:0"), "教你学会制造灵魂石。");
  assert.equal(chinese.byKey.get("ItemSparse:4145:0"), "教你学会制造法术宝石。");
  assert.equal(chinese.byKey.get("ItemSparse:5713:0"), "教你学会施放雷霆箭。");
  assert.equal(chinese.byKey.get("ItemSparse:6222:0"),
    "教你学会暂时浸魔一件胸甲，使其获得+3精神，持续60分钟。");
  assert.equal(chinese.byKey.get("ItemSparse:23320:0"),
    "教你学会施放烈焰震击（等级 6）。");
});

test("Portuguese recipe descriptions use client spell and crafted item names", async () => {
  const source = await read("source.json");
  const portuguese = createGameDictionary(source, await read("ptBR.json"));
  assert.equal(portuguese.byKey.get("ItemSparse:1093:0"),
    "Ensina Remover Maldição (Grau 1).");
  assert.equal(portuguese.byKey.get("ItemSparse:14469:0"),
    "Ensina a confeccionar Veste de Runatrama.");
  assert.equal(portuguese.byKey.get("ItemSparse:7192:0"),
    "Ensina a fazer Botas-foguete Goblínicas.");
});

test("French potion, recipe and spell names share one reviewed client term", async () => {
  const source = await read("source.json");
  const french = createGameDictionary(source, await read("frFR.json"));
  assert.equal(french.byKey.get("ItemSparse:250327:4"), "Potion des sens prédateurs");
  assert.equal(french.byKey.get("ItemSparse:250363:4"),
    "Recette : Potion des sens prédateurs");
  assert.equal(french.byKey.get("ItemSparse:250363:0"),
    "Vous apprend à concocter une potion des sens prédateurs.");
  assert.equal(french.byKey.get("SpellName:1250776:0"), "Potion des sens prédateurs");
});

test("French update talent names use reviewed class spell terms", async () => {
  const source = await read("source.json");
  const french = createGameDictionary(source, await read("frFR.json"));
  assert.equal(french.byKey.get("SpellName:11078:0"), "Trait de feu amélioré");
  assert.equal(french.byKey.get("SpellName:1326159:0"), "Inspiration sombre");
  assert.equal(french.byKey.get("SpellName:1326168:0"), "Inspiration sombre");
});

test("reviewed item descriptions use every locale's wording and game name", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-shared-item-description-gaps.json",
    import.meta.url), "utf8"));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const [id, item] of Object.entries(reviewed.items)) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`), item.translations[locale]);
    }
    for (const [id, difficulty] of Object.entries(reviewed.lockpicks)) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`),
        reviewed.lockpickTemplates[locale].replace("{difficulty}", difficulty));
    }
    assert.equal(dictionary.byKey.get(`ItemSparse:${reviewed.notImplementedQuest.id}:0`),
      reviewed.notImplementedQuest.translations[locale]);
    for (const id of Object.keys(reviewed.notImplementedKeys.ids)) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`),
        reviewed.notImplementedKeys.translations[locale]);
    }
    const miscellaneous = dictionary.byKey.get(reviewed.invalidLoot.categoryKey);
    for (const id of Object.keys(reviewed.invalidLoot.ids)) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`),
        reviewed.invalidLoot.templates[locale].replace("{category}", miscellaneous));
    }
  }
});

test("deprecated item flavor keeps literal inscriptions and localized NPC names", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-legacy-item-flavor.json",
    import.meta.url), "utf8"));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const [id, item] of Object.entries(reviewed.items)) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`), item.translations[locale]);
    }
  }
});

test("quest item location notes reuse exact client area names", async () => {
  const source = await read("source.json");
  const german = createGameDictionary(source, await read("deDE.json"));
  const french = createGameDictionary(source, await read("frFR.json"));
  assert.equal(german.byKey.get("ItemSparse:21146:0"), "-Hinterland");
  assert.equal(french.byKey.get("ItemSparse:21146:0"), "-Les Hinterlands");
  assert.equal(french.byKey.get("ItemSparse:21147:0"), "-Orneval");
  assert.equal(french.byKey.get("ItemSparse:21149:0"), "-Bois de la Pénombre");
});

test("Chinese legacy item descriptions use native mount, mine and profession terms", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-zh-legacy-descriptions.json",
    import.meta.url), "utf8"));
  for (const locale of ["zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const id of reviewed.cooking.ids) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`),
        reviewed.cooking.translations[locale]);
    }
    assert.equal(dictionary.byKey.get(`ItemSparse:${reviewed.conjured.id}:0`),
      reviewed.conjured.translations[locale]);
    for (const [group, entries] of Object.entries({
      mounts: reviewed.mounts, souvenirs: reviewed.souvenirShirts,
      authoredSouvenirs: reviewed.authoredSouvenirShirts })) {
      for (const [id, record] of Object.entries(entries)) {
        assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`),
          record.translations[locale], `${group}/${id}/${locale}`);
      }
    }
  }
});

test("German Mage travel spells use reviewed capital names", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-de-travel-spells.json",
    import.meta.url), "utf8"));
  const dictionary = createGameDictionary(source, await read("deDE.json"));
  for (const record of Object.values(reviewed.cities)) {
    for (const id of record.teleports) {
      assert.equal(dictionary.byKey.get(`SpellName:${id}:0`),
        `Teleportieren: ${record.de}`);
    }
    for (const id of record.portals) {
      assert.equal(dictionary.byKey.get(`SpellName:${id}:0`),
        `Portal: ${record.de}`);
    }
  }
});

test("previously English-only active drinks have names in every client locale", async () => {
  const source = await read("source.json");
  const reviewed = JSON.parse(await readFile(new URL(
    "../data/client-locale-localization/reviewed-shared-consumable-names.json",
    import.meta.url), "utf8"));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const [id, record] of Object.entries(reviewed.items)) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:4`), record.translations[locale]);
    }
  }
});

test("authored item text replaces English only for its reviewed item identity", async () => {
  const source = await read("source.json");
  const catalog = JSON.parse(await readFile(new URL(
    "../data/item-name-localization/reviewed-client-english-gaps.json", import.meta.url), "utf8"));
  for (const locale of ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"]) {
    const dictionary = createGameDictionary(source, await read(`${locale}.json`));
    for (const [id, item] of Object.entries(catalog.items)) {
      assert.equal(dictionary.byKey.get(`ItemSparse:${id}:4`), item.translations[locale].name);
      if (item.description !== undefined) {
        assert.equal(dictionary.byKey.get(`ItemSparse:${id}:0`), item.translations[locale].description);
      }
      if (item.relatedItemIds?.length || item.relatedSpellIds?.length) {
        const localizedEnchant = item.translations[locale].name
          .replace(/^[^:：]+[:：]\s*/, "");
        for (const relatedId of item.relatedItemIds ?? []) {
          assert.equal(dictionary.byKey.get(`ItemSparse:${relatedId}:4`), localizedEnchant);
        }
        for (const relatedId of item.relatedSpellIds ?? []) {
          assert.equal(dictionary.byKey.get(`SpellName:${relatedId}:0`), localizedEnchant);
        }
      }
    }
  }
});
