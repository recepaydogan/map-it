/** Review unchanged character names against explicit Classic locale NPC IDs. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const classicRoot = process.argv[2] && resolve(process.argv[2]);
if (!classicRoot) throw new Error("Pass the pinned pfQuest checkout");
const revision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: classicRoot, encoding: "utf8" }).trim();
if (revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("Classic NPC source revision changed");
}
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const mapEntitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const evidence = await Promise.all([
  read("data/npc-name-localization/polestar-forever-names.json"),
  read("data/npc-name-localization/map-seeded-forever-names.json"),
  read("data/npc-name-localization/reviewed-client-evidence.json"),
]);
const languages = { de: "deDE", es: "esES", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const markerFields = [];
for (const [id, marker] of Object.entries(english.map.questMarkers)) {
  for (const field of ["startsAt", "endsAt"]) {
    if (marker[field]) markerFields.push({ name: marker[field], path: ["questMarkers", id, field] });
  }
}
for (const group of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const [id, marker] of Object.entries(english.map[group])) {
    if (marker.name) markerFields.push({ name: marker.name, path: [group, id, "name"] });
  }
}
for (const [id, name] of Object.entries(english.map.repairVendors)) {
  markerFields.push({ name, path: ["repairVendors", id] });
}
for (const [id, name] of Object.entries(english.map.questNpcs.names)) {
  markerFields.push({ name, path: ["questNpcs", "names", id] });
}
const parseNames = (content) => {
  const rows = new Map();
  for (const line of content.split(/\r?\n/)) {
    const row = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (row) try { rows.set(row[1], JSON.parse(row[2].replace(/\\'/g, "'"))); }
      catch { /* Exclude unsupported Lua escapes. */ }
  }
  return rows;
};
const englishRaw = await readFile(join(classicRoot, "db/enUS/units.lua"), "utf8");
const englishNames = parseNames(englishRaw);
const idsByName = new Map();
for (const [id, name] of englishNames) {
  const ids = idsByName.get(name) ?? [];
  ids.push(Number(id));
  idsByName.set(name, ids);
}
const localNames = {};
const localeHashes = {};
const currentLocales = {};
for (const [language, locale] of Object.entries(languages)) {
  const raw = await readFile(join(classicRoot, `db/${locale}/units.lua`), "utf8");
  localNames[language] = parseNames(raw);
  localeHashes[locale] = createHash("sha256").update(raw).digest("hex");
  currentLocales[language] = await read(`src/i18n/locales/${language}.json`);
}
const personName = /^[A-Z][a-z]{2,}(?:['-][A-Z]?[a-z]+)?(?: [A-Z][a-z]{2,}(?:['-][A-Z]?[a-z]+)?){1,2}$/;
const names = {};
const rolePrefix = /^(?:Baron|Boss|Cranky|General|Geolord|Lady|Lieutenant|Lord|Prince|Sergeant|The) /;
const mapCreatureNames = mapEntitySource.keys.flatMap((key, index) =>
  key.startsWith("Creature:") && !rolePrefix.test(mapEntitySource.values[index])
    ? [mapEntitySource.values[index]] : []);
for (const name of new Set([...markerFields.map((row) => row.name),
  ...mapCreatureNames])) {
  if (!personName.test(name)) continue;
  const ids = idsByName.get(name);
  if (!ids?.length) continue;
  const values = {};
  for (const language of Object.keys(languages)) {
    if (!ids.every((id) => localNames[language].get(String(id)) === name)) continue;
    if (evidence.some((catalog) => {
      const record = (catalog.names ?? catalog)[name];
      return record?.[language] && record[language] !== name;
    })) continue;
    if (markerFields.some((row) => row.name === name && (() => {
      const existing = row.path.reduce((node, key) => node?.[key], currentLocales[language].map);
      return existing && existing !== name;
    })())) continue;
    values[language] = name;
  }
  if (Object.keys(values).length) names[name] = { npcIds: ids, ...values };
}
const catalog = { source: { repository: "https://github.com/shagu/pfQuest",
  revision, license: "MIT", englishSha256: createHash("sha256").update(englishRaw).digest("hex"),
  localeSha256: localeHashes },
  selection: "Multiword character names explicitly unchanged for every matching Classic NPC ID, with no conflicting Forever or app translation",
  names: Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "en"))) };
const path = join(root, "data/npc-name-localization/invariant-multiword-names.json");
const output = JSON.stringify(catalog, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Multiword invariant NPC catalog is stale");
} else await writeFile(path, output);
for (const language of Object.keys(languages)) {
  console.log(`${language}: ${Object.values(names).filter((record) => record[language]).length} unchanged character names`);
}
