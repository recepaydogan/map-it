/** Apply reviewed service and place labels to community map markers. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const labels = await read("data/map-community-localization/service-labels.json");
const descriptions = await read("data/map-community-localization/reviewed-descriptions.json");
const npcDetails = await read("data/map-community-localization/reviewed-npc-details.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const gameLocales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const mapEntitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const mapEntityIndex = new Map(mapEntitySource.keys.map((key, index) => [key, index]));
const mapEntityPacks = Object.fromEntries(await Promise.all(languages.map(async (language) =>
  [language, await read(`public/data/locales/wow-forever/map-entity-${gameLocales[language]}.json`)])));
const known = new Set(Object.values(english.map.mapgenieCommunity).map((record) => record.name));
const knownDescriptions = new Set(Object.values(english.map.mapgenieCommunity)
  .map((record) => record.description).filter(Boolean));
const knownDetails = new Set(Object.values(english.map.mapgenieCommunity)
  .map((record) => record.detail).filter(Boolean));
for (const [name, translations] of Object.entries(labels)) {
  if (!known.has(name) || languages.some((language) =>
    typeof translations[language] !== "string" || !translations[language].trim())) {
    throw new Error(`Invalid community service label: ${name}`);
  }
}
for (const [description, translations] of Object.entries(descriptions)) {
  if (!knownDescriptions.has(description) || languages.some((language) =>
    typeof translations[language] !== "string" || !translations[language].trim())) {
    throw new Error(`Invalid community description: ${description}`);
  }
}
for (const [detail, translations] of Object.entries(npcDetails)) {
  const faction = detail.match(/^.+ · (Alliance|Horde)$/)?.[1];
  const englishName = faction ? detail.slice(0, -(` · ${faction}`).length) : "";
  if (!knownDetails.has(detail) || !faction || !Object.keys(translations).length ||
    Object.entries(translations).some(([language, record]) => {
      if (!languages.includes(language) || typeof record?.value !== "string" ||
        !record.value.endsWith(` · ${faction}`) || record.value === detail) return true;
      const webEvidence = typeof record.evidence === "string" &&
        record.evidence.startsWith("https://www.wowhead.com/forever/");
      const clientEvidence = Number.isInteger(record.clientCreatureId) &&
        record.clientCreatureId > 0;
      if (webEvidence === clientEvidence) return true;
      if (!clientEvidence) return false;
      const index = mapEntityIndex.get(`Creature:${record.clientCreatureId}:0`);
      return index === undefined || mapEntitySource.values[index] !== englishName ||
        mapEntityPacks[language].values[index] !== record.value.slice(0, -(` · ${faction}`).length);
    })) {
    throw new Error(`Invalid reviewed community NPC detail: ${detail}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const target = JSON.parse(raw);
  let added = 0;
  for (const [id, record] of Object.entries(english.map.mapgenieCommunity)) {
    if (!labels[record.name] && !descriptions[record.description] &&
      !npcDetails[record.detail]?.[language]) continue;
    const entry = target.map.mapgenieCommunity[id] ??= {};
    if (labels[record.name] && !entry.name) {
      entry.name = labels[record.name][language];
      added += 1;
    }
    if (descriptions[record.description] && !entry.description) {
      entry.description = descriptions[record.description][language];
      added += 1;
    }
    const reviewedDetail = npcDetails[record.detail]?.[language]?.value;
    if (reviewedDetail && entry.detail !== reviewedDetail) {
      if (entry.detail && entry.detail !== record.detail) {
        throw new Error(`${language}/mapgenieCommunity/${id}: conflicting NPC detail`);
      }
      entry.detail = reviewedDetail;
      added += 1;
    }
  }
  for (const [id, name] of Object.entries(english.map.instanceCoverage.names ?? {})) {
    if (!labels[name]) continue;
    const names = (target.map.instanceCoverage ??= {}).names ??= {};
    if (!names[id]) { names[id] = labels[name][language]; added += 1; }
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== raw) throw new Error(`${language}: community service labels are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} community service labels added`);
}
