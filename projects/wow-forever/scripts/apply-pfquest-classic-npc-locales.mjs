/** Fill missing map NPC fields from exact English pfQuest Classic name matches. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/npc-name-localization/pfquest-classic-names.json");
const sourceLanguages = ["de", "es", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const languages = [...sourceLanguages, "es-MX"];
if (catalog.source.repository !== "https://github.com/shagu/pfQuest" ||
  !/^[0-9a-f]{40}$/.test(catalog.source.revision) || catalog.source.license !== "MIT") {
  throw new Error("Classic NPC catalog provenance is invalid");
}
for (const [name, record] of Object.entries(catalog.names)) {
  if (!Array.isArray(record.npcIds) || !record.npcIds.length ||
    sourceLanguages.some((language) => !record[language]?.trim() || record[language] === name) ||
    (record["es-MX"] && (!record["es-MX"].trim() || record["es-MX"] === name))) {
    throw new Error(`Invalid reviewed Classic NPC name: ${name}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const file = `src/i18n/locales/${language}.json`;
  const target = await read(file);
  let added = 0;
  const fill = (path, name) => {
    const value = catalog.names[name]?.[language];
    if (!value) return;
    let node = target;
    for (const part of path.slice(0, -1)) node = node[part] ??= {};
    const key = path.at(-1);
    if (!node[key]) {
      node[key] = value;
      added += 1;
    }
  };
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    for (const field of ["name", "startsAt", "endsAt"]) {
      if (marker[field]) fill(["map", "questMarkers", id, field], marker[field]);
    }
  }
  for (const field of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
    for (const [id, record] of Object.entries(english.map[field])) {
      if (record.name) fill(["map", field, id, "name"], record.name);
    }
  }
  for (const [id, name] of Object.entries(english.map.repairVendors)) {
    fill(["map", "repairVendors", id], name);
  }
  for (const [id, name] of Object.entries(english.map.questNpcs.names)) {
    fill(["map", "questNpcs", "names", id], name);
  }
  const path = join(root, file);
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: Classic NPC names are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${added} Classic NPC fields added`);
}
