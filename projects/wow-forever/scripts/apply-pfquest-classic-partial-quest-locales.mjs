/** Fill missing quest marker titles from unambiguous ID-matched Classic names. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/quest-title-localization/pfquest-classic-partial-titles.json");
if (catalog.source.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("Classic partial quest source revision changed");
}
const used = new Set(Object.values(english.map.questMarkers).map((marker) => marker.name));
const languages = ["de", "es", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
for (const [name, record] of Object.entries(catalog.titles)) {
  if (!used.has(name) || !record.questIds?.length || languages.some((language) =>
    record[language] && (!record[language].trim() || record[language] === name))) {
    throw new Error(`Invalid partial Classic quest title: ${name}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const target = JSON.parse(raw);
  let added = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    const translation = catalog.titles[marker.name]?.[language];
    if (!translation) continue;
    const entry = target.map.questMarkers[id] ??= {};
    if (!entry.name) { entry.name = translation; added += 1; }
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: partial Classic titles are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} partial Classic quest titles added`);
}
