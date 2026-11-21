/** Match map NPC entity IDs to pinned Forever locale records. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [polestarPath, esMXPath] = process.argv.slice(2);
if (!polestarPath || !esMXPath) throw new Error("Pass pinned Polestar locale directory and esMX Names.lua");
const polestarRoot = resolve(polestarPath);
const esMXFile = resolve(esMXPath);
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const prior = await read("data/npc-name-localization/polestar-forever-names.json");
const mapFiles = [
  "locations-forever-all-quest-givers.json",
  "locations-forever-all-new-quest-givers.json",
  "locations-forever-new-quest-givers.json",
  "locations-quest-givers.json",
  "locations-forever-all-new-trainers.json",
];
const idsByName = new Map();
const mapSources = [];
for (const file of mapFiles) {
  const path = `public/maps/world-atlas/${file}`;
  const raw = await readFile(join(root, path), "utf8");
  const map = JSON.parse(raw);
  mapSources.push({ path, sha256: createHash("sha256").update(raw).digest("hex") });
  for (const point of map.locations) {
    if (!point.name || !/^\d+$/.test(point.entityId ?? "")) continue;
    const ids = idsByName.get(point.name) ?? new Set();
    ids.add(Number(point.entityId));
    idsByName.set(point.name, ids);
  }
}
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const packs = {};
for (const [language, locale] of Object.entries(languages)) {
  const path = language === "es-MX" ? esMXFile : join(polestarRoot, locale, "Names.lua");
  const content = await readFile(path, "utf8");
  if (createHash("sha256").update(content).digest("hex") !== prior.source.localizedNames.sha256[locale]) {
    throw new Error(`${locale}: Forever NPC source hash changed`);
  }
  const names = new Map();
  let npcChunk = false;
  for (const line of content.split(/\r?\n/)) {
    const chunk = /^R\("([^"]+)", \d+, \d+, \[\[$/.exec(line);
    if (chunk) { npcChunk = chunk[1] === "npc"; continue; }
    if (line === "]])") { npcChunk = false; continue; }
    const row = npcChunk && /^(\d+)\t(.*)$/.exec(line);
    if (row) try { names.set(Number(row[1]), decodeURIComponent(row[2])); }
      catch { /* Ignore malformed locale records. */ }
  }
  packs[language] = names;
}
const usedNames = new Set();
for (const marker of Object.values(english.map.questMarkers)) {
  for (const field of ["startsAt", "endsAt"]) if (marker[field]) usedNames.add(marker[field]);
}
for (const field of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const record of Object.values(english.map[field])) if (record.name) usedNames.add(record.name);
}
for (const name of Object.values(english.map.repairVendors)) usedNames.add(name);
for (const name of Object.values(english.map.questNpcs.names)) usedNames.add(name);
const names = {};
for (const name of usedNames) {
  const ids = [...(idsByName.get(name) ?? [])];
  if (!ids.length) continue;
  const translations = {};
  for (const language of Object.keys(languages)) {
    const values = new Set(ids.map((id) => packs[language].get(id)).filter(Boolean));
    if (values.size !== 1 || values.has(name) ||
      ([...values][0].match(/"/g) ?? []).length % 2 !== 0) continue;
    translations[language] = [...values][0];
  }
  if (Object.keys(translations).length) names[name] = { npcIds: ids, ...translations };
}
const output = { source: { englishIds: { mapFiles: mapSources },
  localizedNames: prior.source.localizedNames },
  names: Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "en"))) };
await writeFile(join(root, "data/npc-name-localization/map-seeded-forever-names.json"),
  JSON.stringify(output, null, 2) + "\n");
for (const language of Object.keys(languages)) {
  console.log(`${language}: ${Object.values(names).filter((record) => record[language]).length} map-seeded NPC names`);
}
