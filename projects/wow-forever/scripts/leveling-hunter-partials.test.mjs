import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { localizeHunterRacialTable } from "./lib/localize-hunter-racial-table.mjs";
import { localizeHunterDungeonTable } from "./lib/localize-hunter-dungeon-table.mjs";
import { localizeHunterTalentTables } from "./lib/localize-hunter-talent-tables.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const readJson = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const guide = await readJson("public/data/guides/leveling-hunter.json");
const source = await readJson("public/data/locales/wow-forever/source.json");
const labels = await readJson("data/guide-localization/hunter-racial-table.json");
const dungeonLabels = await readJson("data/guide-localization/hunter-dungeon-table.json");
const talentLabels = await readJson("data/guide-localization/hunter-talent-tables.json");
const sourceSection = guide.html.slice(guide.html.indexOf('<h2 id="choosing-a-race">'),
  guide.html.indexOf('<h2 id="your-pet-taming-feeding-and-families">'));
const dungeonSection = guide.html.slice(guide.html.indexOf('<h2 id="groups-and-dungeons">'),
  guide.html.indexOf('<h2 id="common-beginner-mistakes">'));
const talentSection = guide.html.slice(guide.html.indexOf('<h2 id="talents-which-spec-to-level-with">'),
  guide.html.indexOf('<h2 id="what-to-press">'));
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };

test("Hunter racial links use the installed client's names and correct effects", () => {
  const indices = new Map(source.keys.map((key, index) => [key, index]));
  for (const [, id, label] of sourceSection.matchAll(/data-guide-link="spell:(\d+)"[^>]*>([^<]+)<\/a>/g)) {
    assert.equal(label, source.values[indices.get(`SpellName:${id}:0`)], `spell ${id}`);
  }
  assert.match(sourceSection, /Ruthless<\/a> \(more critical strike chance with all spells and attacks\)/);
  assert.match(sourceSection, /Savage<\/a> \(more critical strike chance with all spells and abilities\)/);
  assert.match(sourceSection, /Endurance<\/a> \(more Health and critical strike bonus to damage and healing\)/);
});

test("Hunter dungeon tables preserve nine routes, levels and client boss names", async () => {
  const links = [...dungeonSection.match(/<table>[\s\S]*?<\/table>/)?.[0]
    .matchAll(/data-guide-link="([^"]+)"/g)].map((match) => match[1]);
  for (const [language, code] of Object.entries(codes)) {
    const locale = await readJson(`public/data/locales/wow-forever/${code}.json`);
    const table = localizeHunterDungeonTable(dungeonSection,
      dungeonLabels[language] ?? dungeonLabels.es, source, locale);
    assert.equal((table.match(/<tr><td>/g) ?? []).length, 9, language);
    assert.deepEqual([...table.matchAll(/data-guide-link="([^"]+)"/g)].map((match) => match[1]),
      links, language);
    for (const id of [3480, 3481, 3644, 3482]) {
      const index = source.keys.indexOf(`DungeonEncounter:${id}:0`);
      assert.ok(table.includes(locale.values[index]), `${language}: boss ${id}`);
    }
  }
});

test("Hunter talent tables keep all six builds and every point allocation", () => {
  const original = [...talentSection.matchAll(/<table>[\s\S]*?<\/table>/g)].map(([table]) => table);
  for (const language of Object.keys(codes)) {
    const translated = localizeHunterTalentTables(talentSection,
      talentLabels[language] ?? talentLabels.es);
    assert.equal(translated.length, 2, language);
    for (let index = 0; index < 2; index += 1) {
      const extract = (table) => [...table.matchAll(/data-guide-link="spell:(\d+)"[^>]*>[^<]+<\/a>\s*(\d+)/g)]
        .map(([, id, points]) => [id, points]);
      assert.deepEqual(extract(translated[index]), extract(original[index]), `${language}/${index}`);
      assert.equal((translated[index].match(/<tr><td>/g) ?? []).length, 3, `${language}/${index}`);
    }
  }
});

test("Hunter racial tables retain every race and linked racial in eight languages", async () => {
  const sourceLinks = [...sourceSection.matchAll(/data-guide-link="spell:(\d+)"/g)].map((match) => match[1]);
  for (const [language, code] of Object.entries(codes)) {
    const locale = await readJson(`public/data/locales/wow-forever/${code}.json`);
    const table = localizeHunterRacialTable(sourceSection, labels[language] ?? labels.es, source, locale);
    assert.equal((table.match(/<tbody><tr>/g) ?? []).length, 1, language);
    assert.equal((table.match(/<tr><td>/g) ?? []).length, 8, language);
    assert.deepEqual([...table.matchAll(/data-guide-link="spell:(\d+)"/g)].map((match) => match[1]),
      sourceLinks, language);
    for (const id of [1, 3, 4, 95, 2, 6, 8, 96]) {
      const index = source.keys.indexOf(`ChrRaces:${id}:2`);
      assert.ok(table.includes(locale.values[index]), `${language}: race ${id}`);
    }
  }
});
