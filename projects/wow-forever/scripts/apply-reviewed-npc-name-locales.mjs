/** Apply NPC names verified in the installed Forever client's localized text. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const source = await read("public/data/locales/wow-forever/source.json");
const evidence = await read("data/npc-name-localization/reviewed-client-evidence.json");
const creatureNames = await read("data/quest-marker-localization/reviewed-partial-entity-names.json");
const sourceIndices = new Map(source.keys.map((key, index) => [key, index]));
const locales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };

for (const [name, record] of Object.entries(evidence)) {
  const index = sourceIndices.get(record.sourceKey);
  if (index === undefined || !source.values[index].includes(name)) {
    throw new Error(`${name}: client evidence does not contain the English NPC name`);
  }
  if (Object.keys(record).some((key) => !["sourceKey", "clientAnchors"].includes(key) &&
    !Object.hasOwn(locales, key))) {
    throw new Error(`${name}: unexpected locale or metadata`);
  }
  if (record.clientAnchors && Object.keys(record.clientAnchors)
    .some((language) => !Object.hasOwn(locales, language))) {
    throw new Error(`${name}: unknown client evidence locale`);
  }
  for (const language of Object.keys(locales)) {
    if (typeof record[language] !== "string" || !record[language].trim()) {
      throw new Error(`${name}: missing ${language} name`);
    }
  }
}

const check = process.argv.includes("--check");
for (const [language, gameLocale] of Object.entries(locales)) {
  const file = `src/i18n/locales/${language}.json`;
  const target = await read(file);
  const pack = await read(`public/data/locales/wow-forever/${gameLocale}.json`);
  let added = 0;
  const set = (path, name, localized) => {
    if (creatureNames[name]?.sourcePriority === "client-creature" && creatureNames[name][language]) return;
    const original = path.reduce((node, key) => node?.[key], english);
    if (original !== name) return;
    let node = target;
    for (const key of path.slice(0, -1)) node = node[key] ??= {};
    const key = path.at(-1);
    if (node[key] && node[key] !== localized) {
      throw new Error(`${language}/${path.join(".")}: existing NPC name conflicts with client evidence`);
    }
    if (!node[key]) {
      node[key] = localized;
      added += 1;
    }
  };
  for (const [name, record] of Object.entries(evidence)) {
    const index = sourceIndices.get(record.sourceKey);
    const localized = record[language];
    const anchor = record.clientAnchors?.[language] ?? localized;
    if (!anchor || !localized.toLocaleLowerCase(language).includes(anchor.toLocaleLowerCase(language)) ||
      !pack.values[index]?.toLocaleLowerCase(language).includes(anchor.toLocaleLowerCase(language))) {
      throw new Error(`${language}/${name}: client evidence does not contain the localized NPC name`);
    }
    for (const [id, marker] of Object.entries(english.map.questMarkers)) {
      for (const field of ["startsAt", "endsAt"]) {
        if (marker[field] === name) set(["map", "questMarkers", id, field], name, localized);
      }
    }
    for (const [id, value] of Object.entries(english.map.questNpcs.names)) {
      if (value === name) set(["map", "questNpcs", "names", id], name, localized);
    }
    for (const field of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
      for (const [id, value] of Object.entries(english.map[field])) {
        if (value.name === name) set(["map", field, id, "name"], name, localized);
      }
    }
    for (const [id, value] of Object.entries(english.map.repairVendors)) {
      if (value === name) set(["map", "repairVendors", id], name, localized);
    }
  }
  const output = JSON.stringify(target, null, 2) + "\n";
  const path = join(root, file);
  if (check) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: NPC names are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${added} client-verified NPC name fields`);
}
