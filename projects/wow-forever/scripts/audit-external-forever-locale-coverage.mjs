/** Count exact-name coverage from a separately checked-out Forever locale source.
 *  This audit reads third-party files but does not copy their text into the app.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = process.argv[2];
if (!sourceRoot) throw new Error("Pass the path to an external QuestieDB checkout");
const read = async (path) => readFile(join(sourceRoot, path), "utf8");
const rows = (lua) => {
  const values = new Map();
  for (const line of lua.split(/\r?\n/)) {
    const match = /^\[(\d+)\]\s*=\s*\{(["'])(.*?)\2\s*,/.exec(line);
    if (match) values.set(Number(match[1]), match[3].replace(/\\(["'\\])/g, "$1"));
  }
  return values;
};
const uniqueNameIds = (table) => {
  const names = new Map();
  for (const [id, name] of table) {
    const ids = names.get(name) ?? [];
    ids.push(id);
    names.set(name, ids);
  }
  return names;
};
const questNames = uniqueNameIds(rows(await read("data/Forever/foreverQuestDB.lua")));
const npcNames = uniqueNameIds(rows(await read("data/Forever/foreverNpcDB.lua")));
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const markers = Object.values(english.map.questMarkers);
const quest = markers.map((marker) => marker.name);
const npc = markers.flatMap((marker) => [marker.startsAt, marker.endsAt].filter(Boolean));
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const appLocales = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];

for (const [localeIndex, locale] of locales.entries()) {
  const questTranslated = rows(await read(`l10n/Forever/lookupQuests/${locale}.lua`));
  const npcTranslated = rows(await read(`l10n/Forever/lookupNpcs/${locale}.lua`));
  const count = (labels, englishIds, translated) => {
    let uniqueMatches = 0;
    let localeMatches = 0;
    let changedTranslations = 0;
    for (const label of labels) {
      const ids = englishIds.get(label);
      if (ids?.length !== 1) continue;
      uniqueMatches += 1;
      if (translated.has(ids[0])) {
        localeMatches += 1;
        if (translated.get(ids[0]) !== label) changedTranslations += 1;
      }
    }
    return `${changedTranslations} changed / ${localeMatches} present / ${uniqueMatches} unique matches / ${labels.length} fields`;
  };
  console.log(`${locale}: quests ${count(quest, questNames, questTranslated)}; NPCs ${count(npc, npcNames, npcTranslated)}`);
  const app = JSON.parse(await readFile(join(root, `src/i18n/locales/${appLocales[localeIndex]}.json`), "utf8"));
  const outstanding = { quests: [], npcs: [] };
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    if (!app.map.questMarkers[id]?.name) {
      const ids = questNames.get(marker.name);
      const value = ids?.length === 1 && questTranslated.get(ids[0]);
      if (value && value !== marker.name) outstanding.quests.push(`${id}:${marker.name}`);
    }
    for (const field of ["startsAt", "endsAt"]) {
      if (!marker[field] || app.map.questMarkers[id]?.[field]) continue;
      const ids = npcNames.get(marker[field]);
      const value = ids?.length === 1 && npcTranslated.get(ids[0]);
      if (value && value !== marker[field]) outstanding.npcs.push(`${id}.${field}:${marker[field]}`);
    }
  }
  console.log(`  missing app fields with unique external match: ${outstanding.quests.length} quest titles, ${outstanding.npcs.length} NPC names`);
  console.log(`  examples: ${[...outstanding.quests, ...outstanding.npcs].slice(0, 8).join(" | ")}`);
}
