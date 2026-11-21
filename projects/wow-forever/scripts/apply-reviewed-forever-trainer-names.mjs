/** Apply Forever trainer NPC names verified in localized game database guides. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/npc-name-localization/reviewed-forever-trainer-names.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const groups = ["classTrainers", "professionTrainers", "mapgenieCommunity"];
const pathsByName = new Map();
for (const group of groups) {
  for (const [id, record] of Object.entries(english.map[group])) {
    if (record.name) {
      const paths = pathsByName.get(record.name) ?? [];
      paths.push([group, id, "name"]);
      pathsByName.set(record.name, paths);
    }
  }
}
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  for (const field of ["startsAt", "endsAt"]) {
    if (marker[field]) {
      const paths = pathsByName.get(marker[field]) ?? [];
      paths.push(["questMarkers", id, field]);
      pathsByName.set(marker[field], paths);
    }
  }
}
for (const [name, entry] of Object.entries(catalog)) {
  if (!Number.isInteger(entry.npcId) || entry.npcId < 1 ||
    typeof entry.guide !== "string" ||
    !(entry.guide.startsWith("professions/") || entry.guide === "zephras-isle-zone-overview") ||
    pathsByName.get(name)?.length !== entry.expectedFields ||
    Object.keys(entry).some((key) => ![...languages, "expectedFields", "guide", "npcId"].includes(key)) ||
    !languages.some((language) => entry[language]) ||
    languages.some((language) => entry[language] !== undefined &&
      (typeof entry[language] !== "string" || !entry[language].trim())) ||
    (entry["es-MX"] !== undefined && entry["es-MX"] !== entry.es)) {
    throw new Error(`${name}: invalid reviewed trainer name`);
  }
}

for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const locale = JSON.parse(raw);
  let added = 0;
  for (const [name, entry] of Object.entries(catalog)) {
    if (!entry[language]) continue;
    for (const parts of pathsByName.get(name)) {
      const [group, id, field] = parts;
      locale.map[group][id] ??= {};
      const current = locale.map[group][id][field];
      if (current && current !== entry[language]) {
        throw new Error(`${language}/${name}: conflicting existing name`);
      }
      if (!current) {
        locale.map[group][id][field] = entry[language];
        added += 1;
      }
    }
    for (const [id, marker] of Object.entries(english.map.mapgenieCommunity)) {
      if (!marker.description?.includes(name)) continue;
      const localized = locale.map.mapgenieCommunity[id];
      if (typeof localized?.description !== "string") continue;
      const translated = localized.description.replaceAll(name, entry[language]);
      if (translated !== localized.description) {
        localized.description = translated;
        added += 1;
      }
    }
  }
  const output = JSON.stringify(locale, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (output !== raw) throw new Error(`${language}: reviewed trainer names are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} reviewed trainer name fields`);
}
