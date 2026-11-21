/** Fill still-missing map NPC fields from ID-matched Forever locale text. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/npc-name-localization/polestar-forever-names.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
if (catalog.source.englishIds.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8" ||
  catalog.source.localizedNames.revision !== "1f5a2cfd221ce18f3333311562281e57f060070a") {
  throw new Error("Forever NPC catalog provenance is invalid");
}
for (const [name, record] of Object.entries(catalog.names)) {
  if (!record.npcIds?.length || languages.some((language) => record[language] &&
    (!record[language].trim() || record[language] === name))) {
    throw new Error(`Invalid Forever NPC name ${name}`);
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
      if (field === "mapgenieCommunity" && record.detail) {
        fill(["map", field, id, "detail"], record.detail);
      }
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
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: Forever NPC names are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${added} Forever NPC fields added`);
}
