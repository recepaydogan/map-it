import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { localizeProfessionsGatheringTable } from "./lib/localize-professions-gathering-table.mjs";
import { localizeProfessionsGatheringTrainers,
  localizeProfessionsTrainerLists } from "./lib/localize-professions-gathering-trainers.mjs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const guide = read("../public/data/guides/professions.json");
const source = read("../public/data/locales/wow-forever/source.json");
const labels = read("../data/guide-localization/professions-gathering-table.json");
const trainerLabels = read("../data/guide-localization/professions-gathering-trainers.json");
const locales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const section = guide.html.match(/<h2 id="gathering-herbalism-mining-and-skinning"[\s\S]*?(?=<h2 id=|$)/)?.[0];

test("gathering table preserves Classic levels and spawn counts with client resource names", () => {
  const sourceTable = section.match(/<table>[\s\S]*?<\/table>/)?.[0];
  const numbers = (html) => [...html.matchAll(/<td>(?:[^<]*? )(\d+)(?:, |<\/td>)/g)]
    .map(([, number]) => Number(number));
  for (const [language, code] of Object.entries(locales)) {
    const table = localizeProfessionsGatheringTable(section, labels[language] ?? labels.es,
      source, read(`../public/data/locales/wow-forever/${code}.json`));
    assert.equal([...table.matchAll(/<tr><td>/g)].length, 16, language);
    assert.deepEqual(numbers(table), numbers(sourceTable), language);
    assert.ok(!table.includes("<tr><td>Elwynn Forest</td>"), language);
    assert.ok(!table.includes("{{CLIENT:"), language);
  }
});

test("secondary-skill trainer lists preserve every map pin", () => {
  const secondary = guide.html.match(/<h2 id="secondary-skills-cooking-first-aid-and-fishing"[\s\S]*?(?=<h2 id=|$)/)?.[0];
  const sourceLinks = [...secondary.matchAll(/data-guide-link="([^"]+)"/g)].map(([, link]) => link);
  const expected = sourceLinks.map((link, index) => link.startsWith("map-pin:") ? index : null)
    .filter((index) => index !== null);
  for (const [language, code] of Object.entries(locales)) {
    const text = trainerLabels[language] ?? trainerLabels.es;
    const lists = localizeProfessionsTrainerLists(secondary,
      { alliance: text.alliance, horde: text.horde }, source,
      read(`../public/data/locales/wow-forever/${code}.json`));
    assert.equal(lists.length, 3, language);
    assert.deepEqual([...lists.join("").matchAll(/\{\{LINK:(\d+)\}\}/g)]
      .map(([, index]) => Number(index)), expected, language);
  }
});

test("six crafting trainer lists preserve every map pin", () => {
  const crafting = guide.html.match(/<h2 id="crafting-the-six-crafting-professions"[\s\S]*?(?=<h2 id=|$)/)?.[0];
  const sourceLinks = [...crafting.matchAll(/data-guide-link="([^"]+)"/g)].map(([, link]) => link);
  const expected = sourceLinks.map((link, index) => link.startsWith("map-pin:") ? index : null)
    .filter((index) => index !== null);
  for (const [language, code] of Object.entries(locales)) {
    const text = trainerLabels[language] ?? trainerLabels.es;
    const lists = localizeProfessionsTrainerLists(crafting,
      { alliance: text.alliance, horde: text.horde }, source,
      read(`../public/data/locales/wow-forever/${code}.json`), 6);
    assert.equal(lists.length, 6, language);
    assert.deepEqual([...lists.join("").matchAll(/\{\{LINK:(\d+)\}\}/g)]
      .map(([, index]) => Number(index)), expected, language);
  }
});

test("gathering trainer lists retain all Classic map pins and use client zone names", () => {
  const sourceLinks = [...section.matchAll(/data-guide-link="([^"]+)"/g)].map(([, link]) => link);
  const expected = sourceLinks.map((link, index) => link.startsWith("map-pin:") ? index : null)
    .filter((index) => index !== null);
  for (const [language, code] of Object.entries(locales)) {
    const lists = localizeProfessionsGatheringTrainers(section,
      trainerLabels[language] ?? trainerLabels.es, source,
      read(`../public/data/locales/wow-forever/${code}.json`));
    assert.equal(lists.length, 3, language);
    assert.deepEqual([...lists.join("").matchAll(/\{\{LINK:(\d+)\}\}/g)]
      .map(([, index]) => Number(index)), expected, language);
    assert.ok(lists[0].includes(trainerLabels[language]?.alliance ?? trainerLabels.es.alliance), language);
    assert.ok(lists[2].includes("{{CLIENT:AreaTable:12:1|Elwynn Forest}}"), language);
  }
});
