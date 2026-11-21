/** Fill reviewed quest-marker title gaps from the staged localized quest catalog. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = (await read("data/quest-title-localization/polestar-forever-titles.json")).titles;
const rows = await read("data/quest-title-localization/catalog-quest-title-gaps.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const seen = new Set();

for (const row of rows) {
  const source = catalog[row.name];
  if (Object.keys(row).sort().join(",") !== "languages,markerIds,name,questIds" ||
    !source || JSON.stringify(source.questIds) !== JSON.stringify(row.questIds) ||
    !Array.isArray(row.markerIds) || !row.markerIds.length ||
    !Array.isArray(row.languages) || !row.languages.length) {
    throw new Error(`Invalid catalog quest title row: ${JSON.stringify(row)}`);
  }
  for (const markerId of row.markerIds) {
    if (english.map.questMarkers[markerId]?.name !== row.name) {
      throw new Error(`${markerId}: English quest marker title changed`);
    }
    for (const language of row.languages) {
      const id = `${language}/${markerId}`;
      if (!languages.includes(language) || seen.has(id) ||
        !source[language] || source[language] === row.name) {
        throw new Error(`${id}: invalid catalog translation`);
      }
      seen.add(id);
    }
  }
}

for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  let changed = 0;
  for (const row of rows.filter((item) => item.languages.includes(language))) {
    const translated = catalog[row.name][language];
    for (const markerId of row.markerIds) {
      const marker = locale.map.questMarkers[markerId] ??= {};
      if (marker.name && marker.name !== row.name && marker.name !== translated) {
        throw new Error(`${language}/${markerId}: conflicting quest title`);
      }
      if (marker.name !== translated) {
        marker.name = translated;
        changed += 1;
      }
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: catalog quest title gaps are stale`);
  } else if (output !== raw) await writeFile(path, output);
  if (changed) console.log(`${language}: ${changed} catalog quest title gaps`);
}
