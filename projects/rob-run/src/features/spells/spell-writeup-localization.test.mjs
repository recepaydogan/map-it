import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { applySpellWriteupText } from "./spell-writeup-localization.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];

test("Battle Shout guide prose resolves in every language while spell links retain their source keys", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const writeup = warrior.abilities["Battle Shout"];
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    assert.equal(pack.values.length, source.strings.length, language);
    const translations = Object.fromEntries(source.strings.map((text, index) => [text, pack.values[index]]));
    const localized = applySpellWriteupText(writeup, translations);
    assert.notEqual(localized.summary, writeup.summary, language);
    assert.notEqual(localized.forever, writeup.forever, language);
    for (const [index, text] of writeup.useWhen.entries()) {
      assert.notEqual(localized.useWhen[index], text, `${language} useWhen ${index}`);
    }
    assert.deepEqual(localized.pairsWith, writeup.pairsWith, language);
    assert.deepEqual(localized.specs, writeup.specs, language);
  }
});

test("Execute guide names come from the same client locale in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const gameSource = await read("public/data/locales/wow-forever/source.json");
  const nameIndex = gameSource.keys.indexOf("SpellName:5308:0");
  assert.equal(gameSource.values[nameIndex], "Execute");
  const prose = [
    "Fury builds that finish most fights with Execute",
    "Boss fights, where Execute is used many times at the end",
  ];
  const gameLocales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
  for (const [index, language] of languages.entries()) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    const gamePack = await read(`public/data/locales/wow-forever/${gameLocales[index]}.json`);
    for (const english of prose) {
      const translated = pack.values[source.strings.indexOf(english)];
      assert.ok(translated?.includes(gamePack.values[nameIndex]), `${language} Execute name`);
      assert.ok(!/\{\{|\[\[spell:/.test(translated), `${language} unresolved game token`);
    }
  }
});

test("reviewed warrior ability advice and summaries render in all eight languages", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const abilities = ["Charge", "Rend", "Thunder Clap", "Hamstring", "Bloodrage"];
  const visibleAdvice = [
    ["Charge", 0], ["Charge", 1], ["Rend", 0],
    ["Thunder Clap", 0], ["Thunder Clap", 1],
    ["Hamstring", 0], ["Hamstring", 1],
    ["Heroic Strike", 0], ["Improved Challenging Shout", 1],
    ["Battle Stance", 0],
    ["Heroic Strike", 1], ["Heroic Strike", 3],
    ["Charge", 2], ["Charge", 3], ["Rend", 2],
    ["Thunder Clap", 3], ["Hamstring", 2],
    ["Bloodrage", 2], ["Bloodrage", 3],
    ["Defensive Stance", 0], ["Defensive Stance", 1],
    ["Sunder Armor", 0], ["Sunder Armor", 1], ["Sunder Armor", 3],
    ["Taunt", 0], ["Taunt", 1], ["Taunt", 2],
    ["Overpower", 0], ["Overpower", 2], ["Shield Bash", 0],
    ["Shield Bash", 1], ["Shield Bash", 3],
    ["Demoralizing Shout", 0], ["Demoralizing Shout", 1],
    ["Demoralizing Shout", 3], ["Revenge", 0], ["Revenge", 2],
    ["Disarm", 0], ["Disarm", 1], ["Disarm", 2],
    ["Cleave", 0], ["Cleave", 1],
    ["Rend", 1], ["Thunder Clap", 2], ["Hamstring", 3],
    ["Defensive Stance", 2], ["Heroic Strike", 2], ["Slam", 0],
    ["Retaliation", 0], ["Retaliation", 1],
    ["Retaliation", 2], ["Retaliation", 3],
    ["Intimidating Shout", 0], ["Intimidating Shout", 1],
    ["Intimidating Shout", 2],
    ["Shield Wall", 0], ["Shield Wall", 1], ["Shield Wall", 2],
    ["Victory Rush", 0], ["Victory Rush", 1], ["Victory Rush", 2],
    ["Execute", 0], ["Execute", 2], ["Execute", 3],
    ["Challenging Shout", 0], ["Challenging Shout", 1],
    ["Shield Wall", 3], ["Berserker Stance", 0],
    ["Berserker Stance", 1], ["Berserker Stance", 2],
    ["Intercept", 0], ["Intercept", 1], ["Intercept", 2],
    ["Berserker Rage", 0], ["Berserker Rage", 1],
    ["Berserker Rage", 2], ["Whirlwind", 0], ["Whirlwind", 1],
    ["Pummel", 0], ["Pummel", 2],
    ["Recklessness", 0], ["Recklessness", 1], ["Recklessness", 2],
  ];
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    const translations = Object.fromEntries(source.strings.map((text, index) => [text, pack.values[index]]));
    for (const ability of abilities) {
      const writeup = warrior.abilities[ability];
      assert.notEqual(applySpellWriteupText(writeup, translations).summary, writeup.summary,
        `${language} ${ability} summary`);
    }
    for (const [ability, index] of visibleAdvice) {
      const writeup = warrior.abilities[ability];
      assert.notEqual(applySpellWriteupText(writeup, translations).useWhen[index],
        writeup.useWhen[index], `${language} ${ability} advice ${index}`);
    }
  }
});

test("Forever comparison prose uses same-ID client spell names and preserves values", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const gameSource = await read("public/data/locales/wow-forever/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const gameLocales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
  const examples = [["Thunder Clap", 6343], ["Tactical Mastery", 1310185], ["Shield Block", 2565]];
  const numbers = (text) => (text.match(/\d+(?:[.,]\d+)?/g) ?? [])
    .map((value) => value.replace(",", ".")).sort();
  for (const [index, language] of languages.entries()) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    const game = await read(`public/data/locales/wow-forever/${gameLocales[index]}.json`);
    for (const [ability, id] of examples) {
      const original = warrior.abilities[ability].forever;
      const translated = pack.values[source.strings.indexOf(original)];
      const nameIndex = gameSource.keys.indexOf(`SpellName:${id}:0`);
      assert.ok(translated?.includes(game.values[nameIndex]), `${language} ${ability} client name`);
      assert.deepEqual(numbers(translated), numbers(original), `${language} ${ability} values`);
      assert.doesNotMatch(translated, /\{\{CLIENT:|\[\[spell:/, `${language} unresolved token`);
    }
  }
});

test("every visible warrior ability writeup is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const visible = [...new Set(Object.values(warrior.abilities).flatMap((entry) =>
    [entry.forever, ...(entry.useWhen ?? [])]).filter(Boolean))];
  assert.equal(visible.length, 128);
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const english of visible) {
      const index = source.strings.indexOf(english);
      assert.ok(index >= 0, `${language} source: ${english}`);
      assert.ok(pack.values[index] && pack.values[index] !== english,
        `${language} untranslated: ${english}`);
      assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
        `${language} unresolved game name: ${english}`);
    }
  }
});

test("every warrior ability summary is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const summaries = [...new Set(Object.values(warrior.abilities)
    .map((entry) => entry.summary).filter(Boolean))];
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const english of summaries) {
      const index = source.strings.indexOf(english);
      assert.ok(index >= 0, `${language} missing ability summary: ${english}`);
      assert.ok(pack.values[index] && pack.values[index] !== english,
        `${language} untranslated ability summary: ${english}`);
      assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
        `${language} unresolved ability name: ${english}`);
    }
  }
});

test("every warrior talent summary is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const summaries = [...new Set(Object.values(warrior.talents)
    .map((entry) => entry.summary).filter(Boolean))];
  assert.ok(summaries.length > 0);
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const english of summaries) {
      const index = source.strings.indexOf(english);
      assert.ok(index >= 0, `${language} missing talent summary: ${english}`);
      assert.ok(pack.values[index] && pack.values[index] !== english,
        `${language} untranslated talent summary: ${english}`);
      assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
        `${language} unresolved talent term: ${english}`);
    }
  }
});

test("every visible warrior talent usage tip is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const tips = [...new Set(Object.values(warrior.talents).flatMap((entry) =>
    entry.useWhen ?? []))];
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const english of tips) {
      const index = source.strings.indexOf(english);
      assert.ok(index >= 0, `${language} missing talent tip: ${english}`);
      assert.ok(pack.values[index] && pack.values[index] !== english,
        `${language} untranslated talent tip: ${english}`);
      assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
        `${language} unresolved talent term: ${english}`);
    }
  }
});

test("every visible warrior talent comparison is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const warrior = await read("public/data/spells/writeups/warrior.json");
  const comparisons = [...new Set(Object.values(warrior.talents)
    .map((entry) => entry.forever).filter(Boolean))];
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const english of comparisons) {
      const index = source.strings.indexOf(english);
      assert.ok(index >= 0, `${language} missing talent comparison: ${english}`);
      assert.ok(pack.values[index] && pack.values[index] !== english,
        `${language} untranslated talent comparison: ${english}`);
      assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
        `${language} unresolved talent term: ${english}`);
    }
  }
});

test("every mage ability usage tip is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const mage = await read("public/data/spells/writeups/mage.json");
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const [ability, writeup] of Object.entries(mage.abilities)) {
      for (const english of writeup.useWhen ?? []) {
        const index = source.strings.indexOf(english);
        assert.ok(index >= 0, `${language} missing ${ability} advice: ${english}`);
        assert.ok(pack.values[index] && pack.values[index] !== english,
          `${language} untranslated ${ability} advice: ${english}`);
        assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
          `${language} unresolved ${ability} term: ${english}`);
      }
    }
  }
});

test("reviewed mage spell comparisons retain translated values", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const mage = await read("public/data/spells/writeups/mage.json");
  const abilities = ["Arcane Intellect", "Dampen Magic", "Amplify Magic",
    "Mage Armor", "Blizzard", "Fire Ward", "Frost Ward"];
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const ability of abilities) {
      const english = mage.abilities[ability].forever;
      const index = source.strings.indexOf(english);
      assert.ok(index >= 0, `${language} missing ${ability} comparison`);
      assert.ok(pack.values[index] && pack.values[index] !== english,
        `${language} untranslated ${ability} comparison`);
      const sourceNumbers = (english.match(/\d+/g) ?? []).sort();
      const translatedNumbers = (pack.values[index].match(/\d+/g) ?? []).sort();
      assert.deepEqual(translatedNumbers, sourceNumbers, `${language} ${ability} values changed`);
    }
  }
});

test("mage travel tips use the matching client city names", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const gameSource = await read("public/data/locales/wow-forever/source.json");
  const gameLocales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
    ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
  const cities = { Ironforge: 47, Orgrimmar: 76, Stormwind: 72, Undercity: 68,
    Darnassus: 69, "Thunder Bluff": 81, Dalaran: 61 };
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    const gamePack = await read(`public/data/locales/wow-forever/${gameLocales[language]}.json`);
    for (const [city, id] of Object.entries(cities)) {
      const key = `Faction:${id}:0`;
      const gameIndex = gameSource.keys.indexOf(key);
      assert.equal(gameSource.values[gameIndex], city, key);
      const cityName = gamePack.values[gameIndex];
      const english = city === "Dalaran"
        ? "Travelling to Dalaran once you reach level 50"
        : `Sending your dungeon group back to ${city} after a run`;
      const index = source.strings.indexOf(english);
      assert.ok(index >= 0, `${language} missing ${city} travel tip`);
      assert.ok(pack.values[index].includes(cityName), `${language} wrong ${city} name`);
    }
  }
});

test("every mage talent usage tip resolves in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const mage = await read("public/data/spells/writeups/mage.json");
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const [id, talent] of Object.entries(mage.talents)) {
      for (const english of talent.useWhen ?? []) {
        const index = source.strings.indexOf(english);
        assert.ok(index >= 0, `${language} missing ${id} advice: ${english}`);
        assert.ok(pack.values[index] && pack.values[index] !== english,
          `${language} untranslated ${id} advice: ${english}`);
        assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
          `${language} unresolved ${id} game term: ${english}`);
      }
    }
  }
});

test("every rogue ability usage tip and warning is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const rogue = await read("public/data/spells/writeups/rogue.json");
  const abilities = Object.keys(rogue.abilities);
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const ability of abilities) {
      for (const english of [...rogue.abilities[ability].useWhen ?? [],
        ...rogue.abilities[ability].avoidWhen ?? []]) {
        const index = source.strings.indexOf(english);
        assert.ok(index >= 0, `${language} missing ${ability} advice: ${english}`);
        assert.ok(pack.values[index] && pack.values[index] !== english,
          `${language} untranslated ${ability} advice: ${english}`);
        assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
          `${language} unresolved ${ability} term: ${english}`);
      }
    }
  }
});

test("every rogue ability summary and Forever note is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const rogue = await read("public/data/spells/writeups/rogue.json");
  const abilities = Object.keys(rogue.abilities);
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const ability of abilities) {
      for (const english of [rogue.abilities[ability].summary,
        rogue.abilities[ability].forever].filter(Boolean)) {
        const index = source.strings.indexOf(english);
        assert.ok(index >= 0, `${language} missing ${ability} prose`);
        assert.ok(pack.values[index] && pack.values[index] !== english,
          `${language} untranslated ${ability} prose`);
        assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
          `${language} unresolved ${ability} term`);
      }
    }
  }
});

test("every rogue talent summary, tip, warning and Forever note is translated in every language", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const rogue = await read("public/data/spells/writeups/rogue.json");
  const talentIds = Object.keys(rogue.talents);
  for (const language of languages) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    for (const id of talentIds) {
      for (const english of [rogue.talents[id].summary,
        ...rogue.talents[id].useWhen ?? [],
        ...rogue.talents[id].avoidWhen ?? [],
        rogue.talents[id].forever].filter(Boolean)) {
        const index = source.strings.indexOf(english);
        assert.ok(index >= 0, `${language} missing talent ${id} advice: ${english}`);
        assert.ok(pack.values[index] && pack.values[index] !== english,
          `${language} untranslated talent ${id} advice: ${english}`);
        assert.doesNotMatch(pack.values[index], /\{\{CLIENT:|\[\[spell:/,
          `${language} unresolved talent ${id} term: ${english}`);
      }
    }
  }
});

test("new-in-Forever notes use verified same-class game names", async () => {
  const reviewed = await read("data/spell-writeup-localization/reviewed-prose.json");
  const source = await read("public/data/spells/writeups/locales/source.json");
  const gameSource = await read("public/data/locales/wow-forever/source.json");
  const index = await read("public/data/spells/foreverdb/index.json");
  const classIds = { druid: 11, hunter: 3, mage: 8, paladin: 2, priest: 5,
    rogue: 4, shaman: 7, warlock: 9, warrior: 1 };
  const gameLocales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
  const generated = source.strings.slice(reviewed.entries.length);
  const patterns = [
    /^(.+) is new in Forever\.$/,
    /^(.+) is new in Forever; there is no Classic Era version to compare it against\.$/,
    /^(.+) is flagged as new in Forever\.$/,
    /^The client flags (.+) as new in Forever\.$/,
    /^(.+) is new in Forever, added with the 1 October build\.$/,
  ];
  assert.ok(generated.length > 0);
  assert.ok(generated.some((value) => patterns[0].test(value)));
  const sourceClasses = new Map();
  for (const [classId, numericId] of Object.entries(classIds)) {
    const writeups = await read(`public/data/spells/writeups/${classId}.json`);
    for (const entry of [...Object.values(writeups.abilities ?? {}),
      ...Object.values(writeups.talents ?? {})]) {
      if (entry.forever) sourceClasses.set(entry.forever, numericId);
    }
  }
  for (const [languageIndex, language] of languages.entries()) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    const game = await read(`public/data/locales/wow-forever/${gameLocales[languageIndex]}.json`);
    for (const english of generated) {
      const name = patterns.map((pattern) => pattern.exec(english)?.[1]).find(Boolean);
      assert.ok(name, english);
      const candidates = index.filter((row) => row[1] === name &&
        row[4] === sourceClasses.get(english)).map((row) =>
        gameSource.keys.indexOf(`SpellName:${row[0]}:0`)).filter((value) => value >= 0);
      const translated = pack.values[source.strings.indexOf(english)];
      assert.ok(candidates.some((candidate) => game.values[candidate] &&
        game.values[candidate] !== name && translated.includes(game.values[candidate])),
      `${language}: ${english}`);
      assert.notEqual(translated, english, `${language}: English fallback ${english}`);
    }
  }
  assert.ok(!generated.includes("Predatory Instincts is new in Forever."));
  assert.ok(!generated.includes("Quietus is new in Forever."));
  assert.ok(!generated.includes("Thunderstomp is flagged as new in Forever."));
  assert.ok(!generated.includes("Genesis is new in Forever; Classic Era had no such talent."));
});

test("reviewed exceptional introductions preserve client names and context", async () => {
  const source = await read("public/data/spells/writeups/locales/source.json");
  const gameSource = await read("public/data/locales/wow-forever/source.json");
  const examples = [
    ["Quietus is new in Forever.", 1310728],
    ["Genesis is new in Forever; Classic Era had no such talent.", 1223081],
    ["Thunderstomp is flagged as new in Forever.", 26094],
  ];
  const gameLocales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
  for (const [languageIndex, language] of languages.entries()) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    const game = await read(`public/data/locales/wow-forever/${gameLocales[languageIndex]}.json`);
    for (const [english, id] of examples) {
      const sourceIndex = source.strings.indexOf(english);
      const gameIndex = gameSource.keys.indexOf(`SpellName:${id}:0`);
      assert.ok(pack.values[sourceIndex]?.includes(game.values[gameIndex]),
        `${language}: ${english}`);
      assert.notEqual(pack.values[sourceIndex], english, `${language} English fallback`);
    }
    const predatory = pack.values[source.strings.indexOf("Predatory Instincts is new in Forever.")];
    const compound = game.values[gameSource.keys.indexOf("SpellName:1219937:0")];
    const expectedName = {
      de: "Räuberische Instinkte", es: "Instintos depredadores",
      "es-MX": "Instintos depredadores", fr: "Instincts prédateurs",
      ko: "포식자의 본능", "pt-BR": "Instintos Predatórios",
      "zh-Hans": "掠食本能", "zh-Hant": "掠食本能",
    }[language];
    const evidenceStem = language === "de" ? "räuberisch" : expectedName;
    assert.ok(compound.toLowerCase().includes(evidenceStem.toLowerCase()), language);
    assert.ok(predatory.includes(expectedName), `${language} Predatory Instincts`);
  }
  const chinese = await read("public/data/spells/writeups/locales/zh-Hans.json");
  assert.ok(chinese.values[source.strings.indexOf("Thunderstomp is flagged as new in Forever.")]
    .includes("雷霆践踏"));
});

test("reviewed game-name tokens resolve to the matching client locale", async () => {
  const reviewed = await read("data/spell-writeup-localization/reviewed-prose.json");
  const source = await read("public/data/spells/writeups/locales/source.json");
  const gameSource = await read("public/data/locales/wow-forever/source.json");
  const gameLocales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
  const keyIndex = new Map(gameSource.keys.map((key, index) => [key, index]));
  for (const [languageIndex, language] of languages.entries()) {
    const pack = await read(`public/data/spells/writeups/locales/${language}.json`);
    const game = await read(`public/data/locales/wow-forever/${gameLocales[languageIndex]}.json`);
    for (const entry of reviewed.entries) {
      const translated = pack.values[source.strings.indexOf(entry.en)];
      for (const [, key, englishName] of entry.locales[language]
        .matchAll(/\{\{CLIENT:([^|}]+)\|([^}]+)\}\}/g)) {
        const index = keyIndex.get(key);
        assert.ok(index !== undefined, `${language}: missing client key ${key}`);
        assert.equal(gameSource.values[index], englishName, `${language}: wrong source name ${key}`);
        assert.ok(entry.en.includes(englishName), `${language}: name absent from source ${key}`);
        assert.ok(game.values[index], `${language}: missing client name ${key}`);
        assert.ok(translated.includes(game.values[index]),
          `${language}: wrong localized name ${key}`);
      }
      assert.doesNotMatch(translated, /\{\{CLIENT:|\[\[spell:/,
        `${language}: unresolved game name in ${entry.en}`);
    }
  }
});
