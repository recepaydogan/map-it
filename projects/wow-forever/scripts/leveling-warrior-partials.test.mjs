import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { localizeWarriorAbilityTable } from "./lib/localize-warrior-ability-table.mjs";
import { localizeWarriorDungeonRoute } from "./lib/localize-warrior-dungeon-route.mjs";
import { localizeWarriorRacialTable } from "./lib/localize-warrior-racial-table.mjs";
import { localizeWarriorStanceCheatsheet } from "./lib/localize-warrior-stance-cheatsheet.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const guide = await read("public/data/guides/leveling-warrior.json");
const source = await read("public/data/locales/wow-forever/source.json");
const sections = new Map(guide.html.split(/(?=<h2 id=)/).slice(1)
  .map((section) => [section.match(/^<h2 id="([^"]+)"/)?.[1], section]));
const races = await read("data/guide-localization/warrior-racial-table.json");
const stances = await read("data/guide-localization/warrior-stance-cheatsheet.json");
const dungeons = await read("data/guide-localization/warrior-dungeon-route.json");
const abilities = await read("data/guide-localization/warrior-ability-table.json");
const codes = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const indices = new Map(source.keys.map((key, index) => [key, index]));
const ids = (html) => [...html.matchAll(/data-guide-link="([^"]+)"/g)].map(([, id]) => id);

test("Warrior tables and reference lists retain source data and client names", async () => {
  for (const [language, code] of Object.entries(codes)) {
    const locale = await read(`public/data/locales/wow-forever/${code}.json`);
    const racialSource = sections.get("choosing-a-race");
    const racial = localizeWarriorRacialTable(racialSource, races[language], source, locale);
    assert.equal((racial.match(/<tr><td>/g) ?? []).length, 10, language);
    assert.deepEqual(ids(racial), ids(racialSource.match(/<table>[\s\S]*?<\/table>/)?.[0] ?? ""), language);
    for (const id of [1, 3, 4, 7, 95, 2, 5, 6, 8, 96]) {
      assert.ok(racial.includes(locale.values[indices.get(`ChrRaces:${id}:2`)]), `${language}: race ${id}`);
    }
    const abilitySource = sections.get("abilities-by-level");
    const abilityTable = localizeWarriorAbilityTable(abilitySource, abilities[language]);
    assert.equal((abilityTable.match(/<tr><td>/g) ?? []).length, 53, language);
    assert.deepEqual(ids(abilityTable), ids(abilitySource.match(/<table>[\s\S]*?<\/table>/)?.[0] ?? ""), language);
    const dungeonSource = sections.get("groups-and-dungeons");
    const route = localizeWarriorDungeonRoute(dungeonSource, dungeons[language], source, locale);
    assert.deepEqual(ids(route), ids(dungeonSource).slice(0, 13), language);
    assert.ok(route.includes(locale.values[indices.get("LFGDungeons:17:0")]), language);
    const stance = localizeWarriorStanceCheatsheet(sections.get("rage-and-stances"),
      stances[language], source, locale);
    for (const spellId of [2457, 71, 2458, 100, 355, 845, 1310185]) {
      assert.ok(stance.includes(locale.values[indices.get(`SpellName:${spellId}:0`)]),
        `${language}: stance spell ${spellId}`);
    }
  }
});
