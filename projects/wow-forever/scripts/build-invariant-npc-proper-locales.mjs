/** Select unchanged single-word NPC proper names verified in pinned game-name tables. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [classicPath, polestarPath, esMXPath] = process.argv.slice(2);
if (!classicPath || !polestarPath || !esMXPath) {
  throw new Error("Pass pfQuest checkout, pinned Polestar locale directory and esMX Names.lua");
}
const classicRoot = resolve(classicPath);
const polestarRoot = resolve(polestarPath);
const esMXFile = resolve(esMXPath);
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const mapEntitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const eastAsianMapPacks = await Promise.all(["koKR", "zhCN", "zhTW"].map((locale) =>
  read(`public/data/locales/wow-forever/map-entity-${locale}.json`)));
const prior = await read("data/npc-name-localization/polestar-forever-names.json");
const classicRevision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: classicRoot, encoding: "utf8" }).trim();
if (classicRevision !== prior.source.englishIds.revision) throw new Error("Classic NPC revision changed");
const source = await readFile(join(classicRoot, "db/enUS/units.lua"), "utf8");
const ids = new Map();
for (const line of source.split(/\r?\n/)) {
  const row = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
  if (!row) continue;
  try {
    const name = JSON.parse(row[2].replace(/\\'/g, "'"));
    const list = ids.get(name) ?? [];
    list.push(Number(row[1]));
    ids.set(name, list);
  } catch { /* Unsupported Lua escapes. */ }
}
const packs = {};
const classicPacks = {};
for (const [language, locale] of Object.entries({ de: "deDE", es: "esES", "es-MX": "esMX",
  fr: "frFR", ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" })) {
  if (language !== "es-MX") {
    const classic = await readFile(join(classicRoot, `db/${locale}/units.lua`), "utf8");
    const values = new Map();
    for (const line of classic.split(/\r?\n/)) {
      const row = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
      if (!row) continue;
      try { values.set(Number(row[1]), JSON.parse(row[2].replace(/\\'/g, "'"))); }
      catch { /* Unsupported Lua escapes. */ }
    }
    classicPacks[language] = values;
  }
  const path = language === "es-MX" ? esMXFile : join(polestarRoot, locale, "Names.lua");
  const content = await readFile(path, "utf8");
  if (createHash("sha256").update(content).digest("hex") !== prior.source.localizedNames.sha256[locale]) {
    throw new Error(`${locale}: Forever NPC source hash changed`);
  }
  const names = new Map();
  let inNpc = false;
  for (const line of content.split(/\r?\n/)) {
    const chunk = /^R\("([^"]+)", \d+, \d+, \[\[$/.exec(line);
    if (chunk) { inNpc = chunk[1] === "npc"; continue; }
    if (line === "]])") { inNpc = false; continue; }
    const row = inNpc && /^(\d+)\t(.*)$/.exec(line);
    if (row) try { names.set(Number(row[1]), decodeURIComponent(row[2])); } catch { /* Skip. */ }
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
for (let index = 0; index < mapEntitySource.keys.length; index += 1) {
  const key = mapEntitySource.keys[index];
  if (!key.startsWith("Creature:") ||
    !eastAsianMapPacks.some((pack) => pack.values[index])) continue;
  const name = mapEntitySource.values[index];
  if (ids.get(name)?.includes(Number(key.split(":")[1]))) usedNames.add(name);
}
const names = {};
for (const name of usedNames) {
  if (!/^[A-Z][a-z]{2,}(?:'[A-Z]?[a-z]+)?$/.test(name)) continue;
  const npcIds = ids.get(name);
  if (!npcIds?.length) continue;
  const translations = {};
  for (const language of Object.keys(packs)) {
    if (language === "es-MX") {
      if (npcIds.every((id) => packs[language].get(id) === name)) translations[language] = name;
    } else if (npcIds.every((id) => classicPacks[language].get(id) === name &&
      (!packs[language].has(id) || packs[language].get(id) === name))) {
      translations[language] = name;
    }
  }
  if (Object.keys(translations).length) names[name] = { npcIds, ...translations };
}
const output = { source: prior.source, selection: "Exact NPC ID, explicit locale value, single-word proper name",
  names: Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "en"))) };
const path = join(root, "data/npc-name-localization/invariant-proper-names.json");
const content = JSON.stringify(output, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== content) {
    throw new Error("Invariant proper-name catalog is stale");
  }
} else await writeFile(path, content);
for (const language of Object.keys(packs)) {
  console.log(`${language}: ${Object.values(names).filter((record) => record[language]).length} verified invariant NPC proper names`);
}
