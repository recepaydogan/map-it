/** Fill still-missing quest marker names from exact ID-matched Forever locale text. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/quest-title-localization/polestar-forever-titles.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
if (catalog.source.englishIds.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8" ||
  catalog.source.localizedNames.revision !== "1f5a2cfd221ce18f3333311562281e57f060070a") {
  throw new Error("Forever quest catalog provenance is invalid");
}
for (const [name, record] of Object.entries(catalog.titles)) {
  if (!Object.values(english.map.questMarkers).some((marker) => marker.name === name) ||
    !record.questIds?.length || languages.some((language) => !record[language]?.trim() ||
      record[language] === name)) throw new Error(`Invalid Forever quest title ${name}`);
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const file = `src/i18n/locales/${language}.json`;
  const target = await read(file);
  let added = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    const record = catalog.titles[marker.name];
    if (!record) continue;
    const localized = target.map.questMarkers[id] ??= {};
    if (localized.name) continue;
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
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: Forever quest names are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${added} Forever quest names added`);
}
