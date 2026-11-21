/** Apply matching Wowhead NPC, quest, and objective text to raw locale gaps. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isEnglishQuestProseFallback } from "./lib/wowhead-quest-prose-page.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = "public/data/locales/wow-forever";
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const mapSource = await read(`${directory}/map-entity-source.json`);
const questSource = await read(`${directory}/quest-text-source.json`);
const mapPacks = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, await read(`${directory}/map-entity-${locale}.json`)])));
const questPacks = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, await read(`${directory}/quest-text-${locale}.json`)])));
const candidates = await read("data/site-research/wowhead-map-entity-name-candidates.json");
const fallbackPacks = await read(`${directory}/map-entity-app-fallbacks.json`);
const questFallbacks = await read(`${directory}/quest-text-app-fallbacks.json`);
if (mapSource.version !== 1 || questSource.version !== 1 ||
  candidates.version !== 1 || locales.some((locale) =>
    mapPacks[locale].values.length !== mapSource.keys.length ||
    questPacks[locale].values.length !== questSource.keys.length)) {
  throw new Error("Invalid map or quest locale source");
}
const mapIndex = new Map(mapSource.keys.map((key, index) => [key, index]));
const questIndex = new Map(questSource.keys.map((key, index) => [key, index]));
const counts = { namesApplied: 0, objectivesApplied: 0,
  sourceMismatchesSkipped: 0, placeholderNamesRemoved: 0, fallbackNamesRestored: 0,
  fallbackObjectivesRestored: 0 };
for (const candidate of candidates.candidates) {
  const key = `${candidate.kind === "npc" ? "Creature" : "Quest"}:${candidate.id}:0`;
  const index = mapIndex.get(key);
  if (index === undefined || !candidate.sourceMatches ||
    mapSource.values[index] !== candidate.source) {
    counts.sourceMismatchesSkipped++;
    continue;
  }
  for (const [locale, record] of Object.entries(candidate.names)) {
    if (record.status !== "translated") continue;
    if (!locales.includes(locale) || !record.value?.trim()) {
      throw new Error(`${key}: invalid Wowhead locale`);
    }
    const prior = mapPacks[locale].values[index];
    if (fallbackPacks.locales[locale]?.[key] || /^\[[^\]]+\]$/.test(record.value.trim())) {
      if (prior === record.value) {
        mapPacks[locale].values[index] = null;
        counts[fallbackPacks.locales[locale]?.[key]
          ? "fallbackNamesRestored" : "placeholderNamesRemoved"]++;
      }
      continue;
    }
    if (prior && prior !== candidate.source) continue;
    mapPacks[locale].values[index] = record.value;
    counts.namesApplied++;
  }
  if (candidate.kind !== "quest" || !candidate.objectiveSourceMatches) continue;
  const objectiveIndex = questIndex.get(`${candidate.id}:objective`);
  if (objectiveIndex === undefined ||
    questSource.values[objectiveIndex] !== candidate.objectiveSource) continue;
  for (const [locale, record] of Object.entries(candidate.objectives)) {
    if (record.status !== "translated") continue;
    if (!locales.includes(locale) || !record.value?.trim()) {
      throw new Error(`${key}: invalid Wowhead objective locale`);
    }
    const prior = questPacks[locale].values[objectiveIndex];
    if (isEnglishQuestProseFallback(record.value, candidate.objectiveSource)) {
      if (prior === record.value) {
        questPacks[locale].values[objectiveIndex] = null;
        counts.fallbackObjectivesRestored++;
      }
      continue;
    }
    if (questFallbacks.locales[locale]?.[`${candidate.id}:objective`]) {
      if (prior === record.value) {
        questPacks[locale].values[objectiveIndex] = null;
        counts.fallbackObjectivesRestored++;
      }
      continue;
    }
    if (prior === record.value) continue;
    questPacks[locale].values[objectiveIndex] = record.value;
    counts.objectivesApplied++;
  }
}
for (const locale of locales) {
  await writeFile(join(root, `${directory}/map-entity-${locale}.json`),
    JSON.stringify(mapPacks[locale]));
  await writeFile(join(root, `${directory}/quest-text-${locale}.json`),
    JSON.stringify(questPacks[locale]));
}
console.log(JSON.stringify(counts));
