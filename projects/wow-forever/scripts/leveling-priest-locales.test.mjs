import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { localizePriestAbilityTable } from "./lib/localize-priest-ability-table.mjs";
import { localizePriestQuestTable } from "./lib/localize-priest-quest-table.mjs";
import { localizePriestRacialTable } from "./lib/localize-priest-racial-table.mjs";
import { localizePriestTalentTables } from "./lib/localize-priest-talent-tables.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const original = await read("public/data/guides/leveling-priest.json");
const source = await read("public/data/locales/wow-forever/source.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const priestNpcCatalogs = await Promise.all(["pfquest-classic-names", "polestar-forever-names",
  "reviewed-priest-guide-names"]
  .map((name) => read(`data/npc-name-localization/${name}.json`)));
const indices = new Map(source.keys.map((key, index) => [key, index]));
const racialLabels = await read("data/guide-localization/priest-racial-table.json");
const questLabels = await read("data/guide-localization/priest-quest-table.json");
const talentLabels = await read("data/guide-localization/priest-talent-tables.json");
const abilityLabels = await read("data/guide-localization/hunter-ability-table.json");
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);
const section = (html, id, nextId) => html.slice(html.indexOf(`<h2 id="${id}"`),
  nextId ? html.indexOf(`<h2 id="${nextId}"`) : undefined);

test("Priest source uses client spell names and the correct Dwarf racial effect", () => {
  for (const [, id, label] of original.html.matchAll(/data-guide-link="spell:(\d+)"[^>]*>([^<]+)<\/a>/g)) {
    assert.equal(label, source.values[indices.get(`SpellName:${id}:0`)], `spell ${id}`);
  }
  assert.match(original.html, /Earth Fury<\/a> increases your critical strike bonus to damage and healing by 2%/);
  assert.doesNotMatch(original.html, /Mace Specialization|mace critical strike bonus/);
});

test("Priest tables preserve source rows, spell links and client race/area names", async () => {
  const race = section(original.html, "choosing-a-race", "how-a-priest-levels-mana-shields-and-wands");
  const abilities = section(original.html, "your-abilities-level-by-level", "talents-which-spec-to-level-with");
  const talents = section(original.html, "talents-which-spec-to-level-with", "what-to-press");
  const quests = section(original.html, "class-quests-up-to-30", "gear-wands-and-professions");
  const originalTables = [...talents.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([table]) => table);
  for (const [language, code] of Object.entries(codes)) {
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const entityLocale = await read(`public/data/locales/wow-forever/map-entity-${code}.json`);
    const racial = localizePriestRacialTable(race, racialLabels[language] ?? racialLabels.es, source, locale);
    const ability = localizePriestAbilityTable(abilities, abilityLabels[language] ?? abilityLabels.es);
    const talent = localizePriestTalentTables(talents, talentLabels[language] ?? talentLabels.es);
    const quest = localizePriestQuestTable(quests, questLabels[language] ?? questLabels.es,
      source, locale, entitySource, entityLocale, language, priestNpcCatalogs);
    for (const [table, count] of [[racial, 6], [ability, 86], [talent[0], 3],
      [talent[1], 3], [quest, 22]]) {
      assert.equal((table.match(/<tr><td>/g) ?? []).length, count, `${language}/${count}`);
    }
    assert.deepEqual(links(racial), links(race.match(/<table>[\s\S]*?<\/table>/)[0]), language);
    assert.deepEqual(links(ability), links(abilities.match(/<table>[\s\S]*?<\/table>/)[0]), language);
    assert.deepEqual(links(quest), links(quests.match(/<table>[\s\S]*?<\/table>/)[0]), language);
    for (const gameKey of ["Quest:5623:0", "Creature:375:0"]) {
      const index = entitySource.keys.indexOf(gameKey);
      assert.ok(quest.includes(entityLocale.values[index]), `${language}: ${gameKey}`);
    }
    for (let index = 0; index < 2; index += 1) {
      assert.deepEqual(links(talent[index]), links(originalTables[index]), `${language}/${index}`);
    }
    for (const key of ["ChrRaces:1:2", "ChrRaces:3:2", "ChrRaces:7:2",
      "AreaTable:12:1", "AreaTable:85:1"]) {
      assert.ok((racial + quest).includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
  }
});

test("eight complete Priest guides retain structure and localized client names", async () => {
  for (const [language, code] of Object.entries(codes)) {
    const guide = await read(`public/data/guides/locales/${language}/leveling-priest.json`);
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    assert.deepEqual(guide.headings.map(({ id, depth }) => ({ id, depth })),
      original.headings.map(({ id, depth }) => ({ id, depth })), language);
    assert.deepEqual(links(guide.html), links(original.html), language);
    assert.equal((guide.html.match(/<table>/g) ?? []).length, 5, language);
    assert.equal((guide.html.match(/<tr><td>/g) ?? []).length, 120, language);
    assert.ok(!guide.html.includes("{{"), `${language}: unresolved template`);
    for (const englishName of ["In Favor of the Light", "A Lack of Fear",
      "Devouring Plague", "Priestess Anetta"]) {
      assert.ok(!guide.html.includes(`>${englishName}<`), `${language}: untranslated ${englishName}`);
    }
    for (const key of ["SpellName:1259719:0", "SpellName:1277370:0",
      "SpellName:402174:0", "ChrRaces:7:2", "AreaTable:796:1",
      "DungeonEncounter:2775:0"]) {
      assert.ok(guide.html.includes(locale.values[indices.get(key)]), `${language}: ${key}`);
    }
    assert.ok(guide.html.includes("1.60.1.70205"), `${language}: beta build qualifier`);
  }
});
