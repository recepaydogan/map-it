/** Fill reviewed quest marker titles from matching client text or Forever quest pages. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/quest-text-source.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const reviewed = await read("data/quest-marker-localization/reviewed-quest-text-titles.json");
const indexByKey = new Map(source.keys.map((key, index) => [key, index]));
const entityNameByKey = new Map(entitySource.keys.map((key, index) => [key, entitySource.values[index]]));
const entityIndexByKey = new Map(entitySource.keys.map((key, index) => [key, index]));
const locales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const usedMarkers = new Set();

for (const [name, record] of Object.entries(reviewed)) {
  const index = indexByKey.get(record.questTextKey);
  const site = record.sourcePriority === "forever-site";
  const questIds = record.gameQuestIds ?? [record.gameQuestId];
  const allowed = site
    ? ["sourcePriority", "gameQuestId", "gameQuestIds", "markerIds", "invariantLanguages", "evidence", "translations"]
    : ["questTextKey", "markerIds", "invariantLanguages"];
  if (Object.keys(record).some((key) =>
    !allowed.includes(key)) ||
    (site
      ? ((record.gameQuestId === undefined) === (record.gameQuestIds === undefined) ||
        !Array.isArray(questIds) || !questIds.length ||
        questIds.some((id) => !Number.isInteger(id) || id < 1 ||
          entityNameByKey.get(`Quest:${id}:0`) !== name) ||
        (record.gameQuestIds && questIds.length !== record.markerIds?.length) ||
        new Set(questIds).size !== questIds.length ||
        !record.translations || !record.evidence ||
        Object.keys(record.evidence).some((language) => !record.translations[language]) ||
        Object.keys(record.translations).some((language) => !locales[language] ||
          typeof record.translations[language] !== "string" ||
          !record.translations[language].trim() ||
          JSON.stringify(record.evidence[language]) !== JSON.stringify(
            record.gameQuestIds
              ? questIds.map((id) =>
                `https://bindonforever.com/${({ de: "de", es: "es", fr: "fr", ko: "ko", "pt-BR": "pt" })[language]}/quest/${id}`)
              : `https://bindonforever.com/${({ de: "de", es: "es", fr: "fr", ko: "ko", "pt-BR": "pt" })[language]}/quest/${questIds[0]}`)) ||
        !Object.keys(record.translations).length ||
        record.invariantLanguages?.some((language) => record.translations[language] !== name))
      : (index === undefined || !source.values[index]?.includes(name))) ||
    !Array.isArray(record.markerIds) || !record.markerIds.length ||
    !Array.isArray(record.invariantLanguages) || (!site && !record.invariantLanguages.length) ||
    new Set(record.markerIds).size !== record.markerIds.length ||
    new Set(record.invariantLanguages).size !== record.invariantLanguages.length ||
    record.invariantLanguages.some((language) => !locales[language])) {
    throw new Error(`${name}: invalid reviewed quest text title`);
  }
  for (const id of record.markerIds) {
    if (english.map.questMarkers[id]?.name !== name || usedMarkers.has(id)) {
      throw new Error(`${id}: reviewed quest title does not match its marker`);
    }
    usedMarkers.add(id);
  }
}

for (const [language, gameLocale] of Object.entries(locales)) {
  const file = `src/i18n/locales/${language}.json`;
  const path = join(root, file);
  const raw = await readFile(path, "utf8");
  const app = JSON.parse(raw);
  const game = await read(`public/data/locales/wow-forever/quest-text-${gameLocale}.json`);
  const entity = await read(`public/data/locales/wow-forever/map-entity-${gameLocale}.json`);
  if (game.values.length !== source.keys.length) throw new Error(`${language}: quest text pack length mismatch`);
  if (entity.values.length !== entitySource.keys.length) throw new Error(`${language}: map entity pack length mismatch`);
  let added = 0;
  for (const [name, record] of Object.entries(reviewed)) {
    const site = record.sourcePriority === "forever-site";
    if (site ? !record.translations[language] : !record.invariantLanguages.includes(language)) continue;
    const value = site ? record.translations[language] : name;
    if (site) {
      const questIds = record.gameQuestIds ?? [record.gameQuestId];
      if (questIds.some((id) => {
        const gameTitle = entity.values[entityIndexByKey.get(`Quest:${id}:0`)];
        return gameTitle && gameTitle !== value;
      })) {
        throw new Error(`${language}/${name}: site quest title conflicts with game locale pack`);
      }
    }
    if (!site && !game.values[indexByKey.get(record.questTextKey)]?.includes(name)) {
      throw new Error(`${language}/${name}: unchanged name is absent from client quest text`);
    }
    for (const id of record.markerIds) {
      const target = app.map.questMarkers[id] ??= {};
      if (target.name && target.name !== value) {
        throw new Error(`${language}/${id}: existing quest title conflicts with client text`);
      }
      if (!target.name) {
        target.name = value;
        added += 1;
      }
    }
  }
  const output = JSON.stringify(app, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: reviewed quest text titles are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} reviewed quest titles`);
}
