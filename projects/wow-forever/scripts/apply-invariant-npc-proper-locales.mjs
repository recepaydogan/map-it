/** Mark NPC proper names that are explicitly identical in pinned locale tables. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/npc-name-localization/invariant-proper-names.json");
if (catalog.source.englishIds.revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8" ||
  catalog.source.localizedNames.revision !== "1f5a2cfd221ce18f3333311562281e57f060070a") {
  throw new Error("Invariant NPC catalog source changed");
}
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
for (const [name, record] of Object.entries(catalog.names)) {
  if (!/^[A-Z][a-z]{2,}(?:'[A-Z]?[a-z]+)?$/.test(name) || !record.npcIds?.length ||
    languages.some((language) => record[language] && record[language] !== name)) {
    throw new Error(`Invalid invariant NPC proper name: ${name}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const target = await read(`src/i18n/locales/${language}.json`);
  let added = 0;
  const fill = (parts, name) => {
    if (catalog.names[name]?.[language] !== name) return;
    let node = target;
    for (const key of parts.slice(0, -1)) node = node[key] ??= {};
    const key = parts.at(-1);
    if (!node[key]) { node[key] = name; added += 1; }
  };
  for (const [id, marker] of Object.entries(english.map.questMarkers)) {
    for (const field of ["startsAt", "endsAt"]) if (marker[field]) {
      fill(["map", "questMarkers", id, field], marker[field]);
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
  const output = JSON.stringify(target, null, 2) + "\n";
  if (check) {
    if (output !== await readFile(path, "utf8")) throw new Error(`${language}: invariant NPC names are stale`);
  } else await writeFile(path, output);
  console.log(`${language}: ${added} invariant NPC proper-name fields added`);
}
