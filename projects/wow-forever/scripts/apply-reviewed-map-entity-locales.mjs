/** Fill repeated quest source names from reviewed object and NPC translations. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const entityNameByKey = new Map(entitySource.keys.map((key, index) => [key, entitySource.values[index]]));
const entityIndexByKey = new Map(entitySource.keys.map((key, index) => [key, index]));
const gameLocales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const entityPacks = Object.fromEntries(await Promise.all(Object.entries(gameLocales).map(async ([language, locale]) =>
  [language, await read(`public/data/locales/wow-forever/map-entity-${locale}.json`)])));
const catalogs = await Promise.all([
  read("data/quest-marker-localization/reviewed-entity-names.json"),
  read("data/quest-marker-localization/reviewed-classic-npc-gaps.json"),
  read("data/quest-marker-localization/reviewed-partial-entity-names.json"),
]);
const reviewed = {};
for (const catalog of catalogs) {
  for (const [name, entry] of Object.entries(catalog)) {
    if (reviewed[name]) throw new Error(`${name}: duplicate reviewed map entity`);
    reviewed[name] = entry;
  }
}
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const pathsByName = new Map();
const titlePathsByName = new Map();

for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  const titles = titlePathsByName.get(marker.name) ?? [];
  titles.push(["questMarkers", id, "name"]);
  titlePathsByName.set(marker.name, titles);
  for (const field of ["startsAt", "endsAt"]) {
    if (!marker[field]) continue;
    const paths = pathsByName.get(marker[field]) ?? [];
    paths.push(["questMarkers", id, field]);
    pathsByName.set(marker[field], paths);
  }
}
for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const [id, record] of Object.entries(english.map[group])) {
    for (const field of group === "mapgenieCommunity" ? ["name", "detail"] : ["name"]) {
      if (!record[field]) continue;
      const paths = pathsByName.get(record[field]) ?? [];
      paths.push([group, id, field]);
      pathsByName.set(record[field], paths);
    }
  }
}
for (const [group, records, suffix] of [
  ["repairVendors", english.map.repairVendors, []],
  ["questNpcs", english.map.questNpcs.names, ["names"]],
]) {
  for (const [id, name] of Object.entries(records)) {
    const paths = pathsByName.get(name) ?? [];
    paths.push([group, ...suffix, id]);
    pathsByName.set(name, paths);
  }
}
for (const [name, entry] of Object.entries(reviewed)) {
  if (!pathsByName.has(name) || !["object", "npc"].includes(entry.kind) ||
    Object.keys(entry).some((key) => !["kind", "includeQuestTitles", "invariantLanguages", "npcIds", "partial",
      "sourcePriority",
      "evidence", ...languages].includes(key)) ||
    (entry.sourcePriority !== undefined &&
      !["classic-fallback", "forever-site", "client-creature"].includes(entry.sourcePriority)) ||
    (entry.sourcePriority === "client-creature" && !entry.npcIds?.length) ||
    (entry.npcIds && (!Array.isArray(entry.npcIds) ||
      entry.npcIds.some((id) => !Number.isInteger(id) || id < 1))) ||
    (entry.includeQuestTitles !== undefined && entry.includeQuestTitles !== true) ||
    (entry.partial !== undefined && entry.partial !== true) ||
    (entry.invariantLanguages && (!Array.isArray(entry.invariantLanguages) ||
      entry.invariantLanguages.some((language) => !languages.includes(language)))) ||
    (entry.evidence && (typeof entry.evidence !== "object" ||
      Object.entries(entry.evidence).some(([language, url]) =>
        !languages.includes(language) || typeof url !== "string" ||
        !url.startsWith("https://"))))) {
    throw new Error(`${name}: invalid reviewed map entity`);
  }
  const providedLanguages = languages.filter((language) => entry[language] !== undefined);
  if ((!entry.partial && providedLanguages.length !== languages.length) ||
    (entry.partial && !providedLanguages.length) ||
    (entry.partial && (!entry.npcIds?.length ||
      (entry.sourcePriority === "forever-site"
        ? (providedLanguages.some((language) => !entry.evidence?.[language]) ||
          entry.npcIds.some((id) => entityNameByKey.has(`Creature:${id}:0`) &&
            entityNameByKey.get(`Creature:${id}:0`) !== name))
        : entry.npcIds.some((id) => entityNameByKey.get(`Creature:${id}:0`) !== name)))) ||
    entry.invariantLanguages?.some((language) => !providedLanguages.includes(language))) {
    throw new Error(`${name}: invalid reviewed language coverage`);
  }
  for (const language of providedLanguages) {
    if (typeof entry[language] !== "string" || !entry[language].trim() ||
      (entry[language] === name && (!entry.invariantLanguages?.includes(language) ||
        !entry.evidence?.[language]))) throw new Error(`${name}: missing ${language} translation`);
    if (entry.sourcePriority === "client-creature" && !entry.npcIds.every((id) =>
      entityPacks[language].values[entityIndexByKey.get(`Creature:${id}:0`)] === entry[language])) {
      throw new Error(`${name}: ${language} translation does not match the Forever creature record`);
    }
    if (entry.sourcePriority === "forever-site" && entry.npcIds?.some((id) => {
      const index = entityIndexByKey.get(`Creature:${id}:0`);
      const gameName = index === undefined ? null : entityPacks[language].values[index];
      return gameName && gameName !== entry[language];
    })) {
      throw new Error(`${name}: ${language} site name conflicts with the Forever creature record`);
    }
  }
}

const pendingWrites = [];
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  let added = 0;
  let skipped = 0;
  for (const [name, entry] of Object.entries(reviewed)) {
    if (!entry[language]) continue;
    const paths = entry.includeQuestTitles
      ? [...pathsByName.get(name), ...(titlePathsByName.get(name) ?? [])]
      : pathsByName.get(name);
    const existing = new Set(paths.map((pathParts) => pathParts.reduce((node, part) => node?.[part], locale.map))
      .filter(Boolean));
    if ([...existing].some((value) => value !== entry[language]) &&
      entry.sourcePriority !== "client-creature") {
      if (entry.sourcePriority === "classic-fallback") {
        skipped += paths.length;
        continue;
      }
      throw new Error(`${language}/${name}: existing game name conflicts with reviewed value`);
    }
    for (const pathParts of paths) {
      let target = locale.map;
      for (const part of pathParts.slice(0, -1)) target = target[part] ??= {};
      const field = pathParts.at(-1);
      if (!target[field] || (entry.sourcePriority === "client-creature" &&
        target[field] !== entry[language])) {
        target[field] = entry[language];
        added += 1;
      }
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: reviewed map entity names are stale`);
  } else if (output !== raw) pendingWrites.push([path, output]);
  console.log(`${language}: ${added} reviewed map entity fields; ${skipped} Classic fallback fields skipped for conflicting Forever names`);
}
for (const [path, output] of pendingWrites) await writeFile(path, output);
