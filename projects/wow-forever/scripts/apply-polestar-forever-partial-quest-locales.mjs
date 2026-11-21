/** Fill quest titles only in locales with an unambiguous ID-matched game name. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const questDetails = await read("public/data/quests/quest-details.json");
const catalog = await read("data/quest-title-localization/polestar-forever-partial-titles.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const sameQuestTitle = (a, b) => a === b || a.replace(/\.$/, "") === b.replace(/\.$/, "");
if (catalog.source.englishIds.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8" ||
  catalog.source.localizedNames.revision !== "1f5a2cfd221ce18f3333311562281e57f060070a") {
  throw new Error("Partial Forever quest catalog source changed");
}
const usedNames = new Set([
  ...Object.values(english.map.questMarkers).map((marker) => marker.name),
  ...Object.values(english.map.mapgenieCommunity).map((marker) => marker.name),
]);
for (const [name, record] of Object.entries(catalog.titles)) {
  if (!usedNames.has(name) || !record.questIds?.length ||
    !["pfquest", "quest-details"].includes(record.englishSource) ||
    record.questIds.some((id) => questDetails.quests[id]?.title &&
      !sameQuestTitle(questDetails.quests[id].title, name)) ||
    languages.some((language) => record[language] && (!record[language].trim() ||
      record[language] === name))) {
    throw new Error(`Invalid partial Forever quest title: ${name}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const target = JSON.parse(raw);
  let added = 0;
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    const translated = catalog.titles[marker.name]?.[language];
    if (!translated) continue;
    const entry = target.map.questMarkers[id] ??= {};
    if (!entry.name) { entry.name = translated; added += 1; }
  }
  for (const [id, marker] of Object.entries(english.map.mapgenieCommunity)) {
    const translated = catalog.titles[marker.name]?.[language];
    if (!translated) continue;
    const entry = target.map.mapgenieCommunity[id] ??= {};
    if (!entry.name) { entry.name = translated; added += 1; }
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: partial Forever quest titles are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} partial Forever quest fields added`);
}
