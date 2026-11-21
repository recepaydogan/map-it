import assert from "node:assert/strict";
import { test } from "node:test";
import { localizeGuideGameLinks } from "./localize-guide-game-links.mjs";

test("uses the client's item and spell names while keeping guide links intact", () => {
  const source = { keys: ["SpellName:71:0", "ItemSparse:1251:4"], values: ["Defensive Stance", "Linen Bandage"] };
  const locale = { values: ["Posture défensive", "Bandage en lin"] };
  const english = '<a href="#" data-guide-link="spell:71">Defensive Stance</a> and <a href="#" data-guide-link="item:1251">Linen Bandage</a>';
  const french = '<a href="#" data-guide-link="spell:71">Posture défensive</a> et <a href="#" data-guide-link="item:1251">bandage de lin</a>';
  assert.equal(localizeGuideGameLinks(english, french, source, locale),
    '<a href="#" data-guide-link="spell:71">Posture défensive</a> et <a href="#" data-guide-link="item:1251">Bandage en lin</a>');
});

test("does not replace a descriptive label and rejects reordered game links", () => {
  const source = { keys: ["SpellName:71:0", "ItemSparse:1251:4"], values: ["Defensive Stance", "Linen Bandage"] };
  const locale = { values: ["Posture défensive", "Bandage en lin"] };
  const original = '<a data-guide-link="spell:71">this stance</a><a data-guide-link="item:1251">Linen Bandage</a>';
  const translated = '<a data-guide-link="spell:71">cette posture</a><a data-guide-link="item:1251">bandage</a>';
  assert.equal(localizeGuideGameLinks(original, translated, source, locale),
    '<a data-guide-link="spell:71">cette posture</a><a data-guide-link="item:1251">Bandage en lin</a>');
  assert.throws(() => localizeGuideGameLinks(original,
    '<a data-guide-link="item:1251">bandage</a><a data-guide-link="spell:71">posture</a>', source, locale),
  /order changed/);
});

test("prefers dungeon-list names over ambiguous area labels for linked places", () => {
  const source = {
    keys: ["AreaTable:40:1", "AreaTable:16149:1", "LFGDungeons:59:0", "AreaTable:718:1", "Map:43:1"],
    values: ["Westfall", "Westfall", "Westfall", "Wailing Caverns", "Wailing Caverns"],
  };
  const locale = { values: ["Marche de l'Ouest (Westfall)", "Marche de l’Ouest",
    "Marche de l’Ouest", "Cavernes des lamentations", "Cavernes des Lamentations"] };
  const original = '<a data-guide-link="map-pin:1436:1:2">Westfall</a><a data-guide-link="dungeon:42">Wailing Caverns</a>';
  const translated = '<a data-guide-link="map-pin:1436:1:2">Westfall</a><a data-guide-link="dungeon:42">Wailing Caverns</a>';
  assert.equal(localizeGuideGameLinks(original, translated, source, locale),
    '<a data-guide-link="map-pin:1436:1:2">Marche de l’Ouest</a><a data-guide-link="dungeon:42">Cavernes des Lamentations</a>');
});

test("uses client names for a linked class guide and area view", () => {
  const source = { keys: ["ChrClasses:1:0", "AreaTable:16593:1"], values: ["Warrior", "Zephras Isle"] };
  const locale = { values: ["Krieger", "Die Insel Zephras"] };
  const original = '<a data-guide-link="guide:leveling-warrior">Warrior</a><a data-guide-link="map-view:zephras-isle">Zephras Isle</a>';
  const translated = '<a data-guide-link="guide:leveling-warrior">Krieger</a><a data-guide-link="map-view:zephras-isle">Insel</a>';
  assert.equal(localizeGuideGameLinks(original, translated, source, locale),
    '<a data-guide-link="guide:leveling-warrior">Krieger</a><a data-guide-link="map-view:zephras-isle">Die Insel Zephras</a>');
});

test("uses the client name when an older guide expands Salvation", () => {
  const source = { keys: ["SpellName:1038:0"], values: ["Salvation"] };
  const locale = { values: ["Rettung"] };
  const original = '<a data-guide-link="spell:1038">Blessing of Salvation</a>';
  assert.equal(localizeGuideGameLinks(original, original, source, locale),
    '<a data-guide-link="spell:1038">Rettung</a>');
});

test("uses a unique client label when a legacy link ID names a different Forever spell", () => {
  const source = { keys: ["SpellName:20574:0", "SpellName:4334:0", "SpellName:4335:0"],
    values: ["Savage", "Axe Specialization", "Axe Specialization"] };
  const locale = { values: ["Wild", "Axt-Spezialisierung", "Axt-Spezialisierung"] };
  const original = '<a data-guide-link="spell:20574">Axe Specialization</a>';
  assert.equal(localizeGuideGameLinks(original, original, source, locale),
    '<a data-guide-link="spell:20574">Axt-Spezialisierung</a>');
  const authored = '<a data-guide-link="spell:20574">Spezialisierung auf Äxte</a>';
  assert.equal(localizeGuideGameLinks(original, authored, source, locale), authored);
});
