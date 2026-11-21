/** Fill unresolved Mexican Spanish map names from the same reviewed Spanish marker. */
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const spanish = await read("src/i18n/locales/es.json");
const targetPath = join(root, "src/i18n/locales/es-MX.json");
const targetRaw = await readFile(targetPath, "utf8");
const mexican = JSON.parse(targetRaw);
const provenancePath = join(root, "data/app-localization/esmx-regional-map-fallback.json");
let provenance;
try { provenance = JSON.parse(await readFile(provenancePath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
provenance ??= { sourceLanguage: "es", targetLanguage: "es-MX",
  reason: "Same map marker context when no distinct Mexican Spanish game name is known",
  fields: {} };
if (provenance.sourceLanguage !== "es" || provenance.targetLanguage !== "es-MX") {
  throw new Error("Invalid Mexican Spanish regional fallback provenance");
}
const get = (object, path) => path.reduce((node, key) => node?.[key], object);
const set = (object, path, value) => {
  let node = object;
  for (const key of path.slice(0, -1)) node = node[key] ??= {};
  node[path.at(-1)] = value;
};
const directNpc = [
  (await read("data/npc-name-localization/polestar-forever-names.json")).names,
  (await read("data/npc-name-localization/map-seeded-forever-names.json")).names,
  await read("data/npc-name-localization/reviewed-client-evidence.json"),
  await read("data/quest-marker-localization/reviewed-partial-entity-names.json"),
];
const questDirectory = join(root, "data/quest-title-localization");
const directQuest = [];
for (const file of await readdir(questDirectory)) {
  if (!file.endsWith(".json")) continue;
  const catalog = await read(`data/quest-title-localization/${file}`);
  if (catalog.titles) directQuest.push(catalog.titles);
}
const knownVariant = (name, spanishValue, quest) => (quest ? directQuest : directNpc)
  .some((catalog) => catalog[name]?.["es-MX"] && catalog[name]["es-MX"] !== spanishValue);
const rows = [];
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  for (const field of ["name", "startsAt", "endsAt"]) {
    if (marker[field]) rows.push({ path: ["map", "questMarkers", id, field], quest: field === "name" });
  }
}
for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const [id, marker] of Object.entries(english.map[group])) {
    if (marker.name) rows.push({ path: ["map", group, id, "name"], quest: false });
    if (group === "mapgenieCommunity" && marker.detail &&
      directNpc.some((catalog) => catalog[marker.detail])) {
      rows.push({ path: ["map", group, id, "detail"], quest: false });
    }
  }
}
for (const id of Object.keys(english.map.repairVendors)) {
  rows.push({ path: ["map", "repairVendors", id], quest: false });
}
for (const id of Object.keys(english.map.questNpcs.names)) {
  rows.push({ path: ["map", "questNpcs", "names", id], quest: false });
}
for (const [key, record] of Object.entries(provenance.fields)) {
  const path = key.split(".");
  if (get(english, path) !== record.english || get(spanish, path) !== record.spanish
    || get(mexican, path) !== record.spanish) {
    throw new Error(`Regional Spanish fallback changed: ${key}`);
  }
}
let added = 0;
let withheld = 0;
for (const { path, quest } of rows) {
  if (get(mexican, path)) continue;
  const name = get(english, path);
  const value = get(spanish, path);
  if (!value) continue;
  if (knownVariant(name, value, quest)) { withheld += 1; continue; }
  const key = path.join(".");
  set(mexican, path, value);
  provenance.fields[key] = { english: name, spanish: value };
  added += 1;
}
const output = JSON.stringify(mexican, null, 2) + "\n";
const provenanceOutput = JSON.stringify(provenance, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (output !== targetRaw || provenanceOutput !== await readFile(provenancePath, "utf8")) {
    throw new Error("Mexican Spanish map fallback is stale");
  }
} else {
  if (output !== targetRaw) await writeFile(targetPath, output);
  await writeFile(provenancePath, provenanceOutput);
}
console.log(`${added} Mexican Spanish map fields filled from reviewed Spanish; ${withheld} known variants withheld`);
