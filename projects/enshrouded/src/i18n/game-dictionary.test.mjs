import assert from "node:assert/strict";
import test from "node:test";
import { createGameDictionary, getDictionaryText, translateDisplayValue } from "./game-dictionary.ts";

const source = (keys, values) => ({ version: 1, keys, values });
const translated = values => ({ version: 1, values });

test("reviewed display text fills an untranslated native label without changing the native export", () => {
  const english = "Investigate The Strange Letter";
  const native = createGameDictionary(source(["quest"], [english]), translated([english]));
  const content = createGameDictionary(source(["display"], [english]), translated(["謎の手紙を調べる"]));
  assert.equal(translateDisplayValue(english, native, content, "quest"), "謎の手紙を調べる");
  assert.equal(getDictionaryText(native, english, "quest"), english);
  assert.equal(translateDisplayValue("Commo"), "Common");
});

test("typography aliases preserve game identity, numbers, and safe text rendering", () => {
  const dictionary = createGameDictionary(source(["1", "2"], ["Alchemist's Workshop", "Flame 2"]),
    translated(["<b>Simyacının Atölyesi</b>", "Alev 2"]));
  assert.equal(getDictionaryText(dictionary, "Alchemist’s  Workshop"), "Simyacının Atölyesi");
  assert.equal(getDictionaryText(dictionary, "Flame 1"), "Flame 1");
});

test("explicit native keys honor reviewed display repairs while retaining unrelated homonyms", () => {
  const game = createGameDictionary(source(["pitcher", "action"], ["Bembel Pitcher", "Set"]),
    translated(["Bembel Sürahi", "Festlegen"]));
  const content = createGameDictionary(source(["display", "set"], ["Bembel Pitcher", "Set"]),
    { ...translated(["Глечик «Бембель»", "Set"]), nativeDisplayOverrides: ["Bembel Pitcher"] });
  assert.equal(translateDisplayValue("Bembel Pitcher", game, content, "pitcher"), "Глечик «Бембель»");
  assert.equal(getDictionaryText(game, "Bembel Pitcher", "pitcher"), "Bembel Sürahi");
  assert.equal(translateDisplayValue("Set", game, content, "action"), "Festlegen");
});

test("homonyms require a matching source key when translations differ", () => {
  const dictionary = createGameDictionary(source(["item", "action", "later"], ["Mine", "Mine", "Mine"]),
    translated(["Maden", "Kaz", "Maden"]));
  assert.equal(getDictionaryText(dictionary, "Mine"), "Mine");
  assert.equal(getDictionaryText(dictionary, "Mine", "item"), "Maden");
  assert.equal(getDictionaryText(dictionary, "Mine", "action"), "Kaz");
});

test("case and punctuation aliases are discarded when meanings conflict", () => {
  const dictionary = createGameDictionary(source(["a", "b"], ["Set", "set"]), translated(["Küme", "Ayarla"]));
  assert.equal(getDictionaryText(dictionary, "SET"), "SET");
  assert.equal(getDictionaryText(dictionary, "Set"), "Küme");
});

test("stale source keys and missing translations keep the supplied English", () => {
  const dictionary = createGameDictionary(source(["1", "2"], ["Axe", "Sword"]), translated(["Balta", null]));
  assert.equal(getDictionaryText(dictionary, "Bow", "1"), "Bow");
  assert.equal(getDictionaryText(dictionary, "Sword", "2"), "Sword");
});

test("malformed and misaligned dictionaries fail before a language becomes ready", () => {
  assert.throws(() => createGameDictionary(source(["a", "a"], ["A", "B"]), translated(["A", "B"])));
  assert.throws(() => createGameDictionary(source(["a"], ["A"]), translated([])));
  assert.throws(() => createGameDictionary(source(["a"], ["A"]), translated([4])));
  assert.throws(() => createGameDictionary({ ...source(["a"], ["A"]), sourceSha256: "new-source" },
    { ...translated(["A"]), sourceSha256: "old-source" }));
});

test("authored English-looking translations retain their context instead of becoming game actions", () => {
  const game = createGameDictionary(source(["action"], ["Set"]), translated(["Festlegen"]));
  const content = createGameDictionary(source(["collection"], ["Set"]), translated(["Set"]));
  assert.equal(translateDisplayValue("Set", game, content), "Set");
  assert.equal(translateDisplayValue("Set", game, content, "action"), "Festlegen");
  const original = { id: "Set", name: "Set" };
  assert.equal(translateDisplayValue(original, game, content), original);
  assert.deepEqual(original, { id: "Set", name: "Set" });
});

test("composed display labels localize their parts and preserve quantities", () => {
  const game = createGameDictionary(source(["place"], ["Revelwood"]), translated(["Neşe Ormanı"]));
  assert.equal(translateDisplayValue("Revelwood · 15", game), "Neşe Ormanı · 15");
  assert.equal(translateDisplayValue(15, game), 15);
});
