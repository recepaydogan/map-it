import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localizeMageRacialTable } from "./lib/localize-mage-racial-table.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const sections = [
  ["common-beginner-mistakes", 11, 0],
  ["staying-alive-kiting-and-control", 10, 6],
  ["what-forever-changed-for-mages", 10, 5],
];
const source = JSON.parse(await readFile(join(root, "public/data/guides/leveling-mage.json"), "utf8"));
const clientSource = JSON.parse(await readFile(join(root, "public/data/locales/wow-forever/source.json"), "utf8"));
const racialLabels = JSON.parse(await readFile(join(root, "data/guide-localization/mage-racial-table.json"), "utf8"));
const questTitles = (JSON.parse(await readFile(join(root,
  "data/quest-title-localization/polestar-forever-titles.json"), "utf8"))).titles;
const sourceSections = new Map(source.html.split(/(?=<h2 id=)/).slice(1)
  .map((html) => [html.match(/^<h2 id="([^"]+)"/)?.[1], html]));

test("Mage partials retain each source point and linked spell in every language", async () => {
  for (const language of languages) {
    for (const [id, itemCount, linkCount] of sections) {
      const path = join(root, "data/guide-localization", language, "leveling-mage", `${id}.html`);
      const html = await readFile(path, "utf8");
      assert.ok(html.startsWith(`<h2 id="${id}">`), `${language}/${id}: heading`);
      assert.equal((html.match(/<li>/g) ?? []).length, itemCount, `${language}/${id}: points`);
      assert.equal((html.match(/{{LINK:\d+}}/g) ?? []).length, linkCount, `${language}/${id}: links`);
      assert.equal((sourceSections.get(id).match(/<li>/g) ?? []).length, itemCount, `${id}: source points`);
    }
    const kiting = await readFile(join(root, "data/guide-localization", language,
      "leveling-mage/staying-alive-kiting-and-control.html"), "utf8");
    assert.ok(kiting.includes("{{CLIENT:SpellName:400640:0|Ice Lance}}"), `${language}: Forever Ice Lance ID`);
    const changes = await readFile(join(root, "data/guide-localization", language,
      "leveling-mage/what-forever-changed-for-mages.html"), "utf8");
    assert.match(changes, /0[.,]123.*0[.,]429/s, `${language}: spell coefficient`);
    assert.ok(changes.includes("1.60.1.70205"), `${language}: beta build qualifier`);
    assert.ok(changes.includes("{{CLIENT:ChrRaces:95:2|High Order Skyborne}}"),
      `${language}: client race`);
  }
});

test("Mage race table keeps six source rows and all racial links", async () => {
  const original = sourceSections.get("choosing-a-race");
  const sourceTable = original.match(/<table>[\s\S]*?<\/table>/)?.[0];
  const links = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);
  for (const [language, code] of [["de", "deDE"], ["es", "esES"], ["es-MX", "esMX"],
    ["fr", "frFR"], ["ko", "koKR"], ["pt-BR", "ptBR"],
    ["zh-Hans", "zhCN"], ["zh-Hant", "zhTW"]]) {
    const locale = JSON.parse(await readFile(join(root,
      `public/data/locales/wow-forever/${code}.json`), "utf8"));
    const table = localizeMageRacialTable(original, racialLabels[language] ?? racialLabels.es,
      clientSource, locale);
    assert.equal((table.match(/<tr><td>/g) ?? []).length, 6, language);
    assert.deepEqual(links(table), links(sourceTable), language);
    for (const race of [1, 7, 95, 2, 5, 8]) {
      const index = clientSource.keys.indexOf(`ChrRaces:${race}:2`);
      assert.ok(table.includes(locale.values[index]), `${language}: race ${race}`);
    }
  }
});

test("Mage quest routes and reward conjunctions use each guide language", async () => {
  const sourceTable = sourceSections.get("class-quests-up-to-30").match(/<table>[\s\S]*?<\/table>/)?.[0];
  const questCells = (html) => [...html.matchAll(/<tr><td>[^<]*<\/td><td>([^<]*)<\/td>/g)]
    .map((match) => match[1]);
  const originals = questCells(sourceTable);
  assert.equal(originals.length, 9);
  for (const language of languages) {
    const guide = JSON.parse(await readFile(join(root,
      `public/data/guides/locales/${language}/leveling-mage.json`), "utf8"));
    const section = guide.html.split('<h2 id="class-quests-up-to-30">')[1].split("</table>")[0];
    const localized = questCells(section);
    assert.equal(localized.length, originals.length, `${language}: quest rows`);
    assert.doesNotMatch(section, /\bthen\b|\bor\b/, `${language}: English route connector`);
    for (const [index, original] of originals.entries()) {
      for (const part of original.split(", ")) {
        const name = part.replace(/^then /, "")
          .replace(/ \((Human|Gnome|Undead|Troll|Alliance|Horde|28)\)$/, "");
        const translated = questTitles[name]?.[language];
        assert.ok(translated && localized[index].includes(translated),
          `${language}: quest ${name}`);
      }
    }
  }
});
