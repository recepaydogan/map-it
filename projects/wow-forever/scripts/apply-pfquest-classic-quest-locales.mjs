/** Fill missing Classic quest marker names from exact English pfQuest title matches. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/quest-title-localization/pfquest-classic-titles.json");
const sourceLanguages = ["de", "es", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const languages = [...sourceLanguages, "es-MX"];
if (catalog.source.repository !== "https://github.com/shagu/pfQuest" ||
  !/^[0-9a-f]{40}$/.test(catalog.source.revision) || catalog.source.license !== "MIT") {
  throw new Error("Classic quest catalog provenance is invalid");
}
for (const [name, record] of Object.entries(catalog.titles)) {
  if (!Object.values(english.map.questMarkers).some((marker) => marker.name === name) ||
    !Array.isArray(record.questIds) || !record.questIds.length ||
    sourceLanguages.some((language) => !record[language]?.trim() || record[language] === name) ||
    (record["es-MX"] && (!record["es-MX"].trim() || record["es-MX"] === name))) {
    throw new Error(`Invalid reviewed Classic quest title: ${name}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const file = `src/i18n/locales/${language}.json`;
  const target = await read(file);
  let added = 0;
  let preserved = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    const record = catalog.titles[marker.name];
    if (!record?.[language]) continue;
    const localized = target.map.questMarkers[id] ??= {};
    if (localized.name) {
      preserved += 1;
      continue;
    }
    localized.name = record[language];
    added += 1;
    if (english.map.mapgenieCommunity[id]?.name === marker.name) {
      const community = target.map.mapgenieCommunity[id] ??= {};
      if (!community.name) community.name = record[language];
    }
  }
  const path = join(root, file);
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: Classic quest names are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${added} Classic quest names added, ${preserved} prior names preserved`);
}
