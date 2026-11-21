/** Fill map NPC names using exact entity IDs from the published quest-giver maps. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const catalog = await read("data/npc-name-localization/map-seeded-forever-names.json");
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
if (catalog.source.localizedNames.revision !== "1f5a2cfd221ce18f3333311562281e57f060070a") {
  throw new Error("Map-seeded Forever NPC source changed");
}
const idsByName = new Map();
for (const { path, sha256 } of catalog.source.englishIds.mapFiles) {
  const raw = await readFile(join(root, path), "utf8");
  if (createHash("sha256").update(raw).digest("hex") !== sha256) {
    throw new Error(`Map-seeded NPC source changed: ${path}`);
  }
  for (const point of JSON.parse(raw).locations) {
    if (!point.name || !/^\d+$/.test(point.entityId ?? "")) continue;
    const ids = idsByName.get(point.name) ?? new Set();
    ids.add(Number(point.entityId));
    idsByName.set(point.name, ids);
  }
}
for (const [name, record] of Object.entries(catalog.names)) {
  const ids = idsByName.get(name);
  if (!ids || !record.npcIds?.length || record.npcIds.some((id) => !ids.has(id)) ||
    languages.some((language) => record[language] &&
      (!record[language].trim() || record[language] === name))) {
    throw new Error(`Invalid map-seeded NPC name: ${name}`);
  }
}
const check = process.argv.includes("--check");
for (const language of languages) {
  const path = join(root, `src/i18n/locales/${language}.json`);
  const raw = await readFile(path, "utf8");
  const target = JSON.parse(raw);
  let added = 0;
  const fill = (parts, name) => {
    const value = catalog.names[name]?.[language];
    if (!value) return;
    let node = target;
    for (const key of parts.slice(0, -1)) node = node[key] ??= {};
    const key = parts.at(-1);
    if (!node[key]) { node[key] = value; added += 1; }
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
    if (output !== raw) throw new Error(`${language}: map-seeded NPC names are stale`);
  } else if (output !== raw) await writeFile(path, output);
  console.log(`${language}: ${added} map-seeded NPC fields added`);
}
