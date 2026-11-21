/** Fill reviewed quest titles only where the game locale has no title. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const quests = (await read("public/data/quests/quest-details.json")).quests;
const classic = (await read("data/quest-title-localization/pfquest-classic-partial-titles.json")).titles;
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const records = await read("data/quest-title-localization/authored-partial-quest-titles.json");
const locales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const questKeyIndex = new Map(entitySource.keys.map((key, index) => [key, index]));
const idsUsed = new Set();
for (const [id, record] of Object.entries(records)) {
  const invariantLocales = new Set(record.invariantLocales ?? []);
  if (id !== record.markerIds?.[0] || !record.en || !record.locales ||
    !Object.keys(record.locales).length ||
    [...invariantLocales].some((language) => record.locales[language] !== record.en) ||
    Object.keys(record.locales).some((language) => !locales[language] ||
      typeof record.locales[language] !== "string" ||
      !record.locales[language].trim() ||
      (record.locales[language] === record.en && !invariantLocales.has(language)))) {
    throw new Error(`${id}: invalid authored quest title`);
  }
  if (record.questId && quests[record.questId]?.title !== record.en &&
    entitySource.values[questKeyIndex.get(`Quest:${record.questId}:0`)] !== record.en) {
    throw new Error(`${id}: quest ID does not match English title`);
  }
  if (record.classicQuestIds &&
    JSON.stringify(classic[record.en]?.questIds) !== JSON.stringify(record.classicQuestIds)) {
    throw new Error(`${id}: Classic quest IDs do not match English title`);
  }
  for (const markerId of record.markerIds) {
    const marker = english.map.questMarkers[markerId];
    if (idsUsed.has(markerId) || marker?.name !== record.en ||
      (record.expectedStartsAt?.[markerId] &&
        marker.startsAt !== record.expectedStartsAt[markerId]) ||
      (record.requiredClass && marker.requiredClass !== record.requiredClass)) {
      throw new Error(`${id}: map marker context changed at ${markerId}`);
    }
    idsUsed.add(markerId);
  }
}

const check = process.argv.includes("--check");
for (const [language, gameLocale] of Object.entries(locales)) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const app = JSON.parse(raw);
  const game = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
  let added = 0;
  for (const record of Object.values(records)) {
    const translated = record.locales[language];
    if (!translated) continue;
    const gameIndex = record.questId && questKeyIndex.get(`Quest:${record.questId}:0`);
    if (gameIndex !== undefined && game.values[gameIndex]) {
      throw new Error(`${language}: game already provides ${record.en}`);
    }
    for (const markerId of record.markerIds) {
      const marker = app.map.questMarkers[markerId] ??= {};
      if (marker.name && marker.name !== translated) {
        throw new Error(`${language}: existing ${record.en} differs at ${markerId}`);
      }
      if (!marker.name) { marker.name = translated; added += 1; }
    }
  }
  const output = JSON.stringify(app, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: authored quest titles are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} reviewed partial quest titles`);
}
