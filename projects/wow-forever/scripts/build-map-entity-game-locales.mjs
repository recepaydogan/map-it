/** Pack ID-matched Forever quest and NPC names for runtime map localization. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [polestarArg, esMXArg, pfQuestArg] = process.argv.slice(2);
if (!polestarArg || !esMXArg || !pfQuestArg) {
  throw new Error("Pass pinned Polestar locales, esMX Names.lua and pfQuest checkout");
}
const polestarRoot = resolve(polestarArg);
const esMXFile = resolve(esMXArg);
const pfQuestRoot = resolve(pfQuestArg);
const check = process.argv.includes("--check");
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const verifyOrWrite = async (path, content) => {
  if (check) {
    if (await readFile(path, "utf8") !== content) throw new Error(`Map entity locale stale: ${path}`);
  } else await writeFile(path, content);
};
const reference = await read("data/npc-name-localization/polestar-forever-names.json");
const pfQuestRevision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: pfQuestRoot, encoding: "utf8" }).trim();
if (pfQuestRevision !== reference.source.englishIds.revision) {
  throw new Error("Classic English entity IDs differ from the pinned revision");
}
const directory = join(root, "public/data/locales/wow-forever");
const questFiles = ["locations-forever-all-quests.json", "locations-forever-new-quests.json"];
const npcFiles = [
  "locations-forever-all-quest-givers.json", "locations-forever-all-new-quest-givers.json",
  "locations-forever-new-quest-givers.json", "locations-quest-givers.json",
  "locations-forever-all-new-trainers.json", "locations-forever-all-rares.json",
  "locations-forever-new-rares.json", "locations-rares.json",
  "locations-forever-all-updates.json", "locations-mapgenie-community.json",
];
const names = new Map();
const conflicts = new Set();
const mapFiles = [];
for (const [type, files, field] of [["Quest", questFiles, "questId"],
  ["Creature", npcFiles, "entityId"]]) {
  for (const file of files) {
    const path = `public/maps/world-atlas/${file}`;
    const raw = await readFile(join(root, path), "utf8");
    const map = JSON.parse(raw);
    if (!Array.isArray(map.locations)) throw new Error(`Invalid map locations: ${path}`);
    mapFiles.push({ path, sha256: createHash("sha256").update(raw).digest("hex") });
    for (const point of map.locations) {
      if (!/^\d+$/.test(point[field] ?? "") || !point.name?.trim()) continue;
      const key = `${type}:${point[field]}:0`;
      if (names.has(key) && names.get(key) !== point.name) conflicts.add(key);
      else names.set(key, point.name);
    }
  }
}
for (const key of conflicts) names.delete(key);
const classicNames = new Map();
const npcSource = await readFile(join(pfQuestRoot, "db/enUS/units.lua"), "utf8");
for (const line of npcSource.split(/\r?\n/)) {
  const row = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
  if (row) try { classicNames.set(`Creature:${row[1]}:0`, JSON.parse(row[2].replace(/\\'/g, "'"))); }
    catch { /* Unsupported Lua escapes are excluded from comparison. */ }
}
const questSource = await readFile(join(pfQuestRoot, "db/enUS/quests.lua"), "utf8");
let questId;
for (const line of questSource.split(/\r?\n/)) {
  const id = /^  \[(\d+)\] = \{$/.exec(line);
  if (id) { questId = id[1]; continue; }
  const title = /^    \["T"\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
  if (title && questId) try {
    classicNames.set(`Quest:${questId}:0`, JSON.parse(title[1].replace(/\\'/g, "'")));
  } catch { /* Unsupported Lua escapes are excluded from comparison. */ }
  if (/^  \},?$/.test(line)) questId = undefined;
}
const normalizeName = (name) => name.toLocaleLowerCase("en").replace(/[’]/g, "'")
  .replace(/\s+/g, " ").trim();
const classicMismatches = [];
for (const [key, name] of names) {
  const classic = classicNames.get(key);
  if (classic && normalizeName(classic) !== normalizeName(name)) {
    classicMismatches.push(key);
    names.delete(key);
  }
}
const keys = [...names.keys()].sort((a, b) => {
  const [typeA, idA] = a.split(":");
  const [typeB, idB] = b.split(":");
  return typeA.localeCompare(typeB, "en") || Number(idA) - Number(idB);
});
const source = { version: 1, keys, values: keys.map((key) => names.get(key)),
  provenance: { mapFiles, excludedConflicts: conflicts.size,
    excludedClassicMismatches: classicMismatches,
    classicEnglish: { repository: "https://github.com/shagu/pfQuest", revision: pfQuestRevision,
      unitSha256: createHash("sha256").update(npcSource).digest("hex"),
      questSha256: createHash("sha256").update(questSource).digest("hex") },
    localizedNames: reference.source.localizedNames } };
await verifyOrWrite(join(directory, "map-entity-source.json"), JSON.stringify(source));
const locales = { deDE: "de", esES: "es", esMX: "es-MX", frFR: "fr", koKR: "ko",
  ptBR: "pt-BR", zhCN: "zh-Hans", zhTW: "zh-Hant" };
for (const [gameLocale] of Object.entries(locales)) {
  const file = gameLocale === "esMX" ? esMXFile : join(polestarRoot, gameLocale, "Names.lua");
  const content = await readFile(file, "utf8");
  if (createHash("sha256").update(content).digest("hex") !==
    reference.source.localizedNames.sha256[gameLocale]) {
    throw new Error(`${gameLocale}: Forever entity source hash changed`);
  }
  const localized = new Map();
  let type;
  for (const line of content.split(/\r?\n/)) {
    const chunk = /^R\("([^"]+)", \d+, \d+, \[\[$/.exec(line);
    if (chunk) { type = chunk[1] === "npc" ? "Creature" : chunk[1] === "quest" ? "Quest" : undefined; continue; }
    if (line === "]])") { type = undefined; continue; }
    const row = type && /^(\d+)\t(.*)$/.exec(line);
    if (row) try { localized.set(`${type}:${row[1]}:0`, decodeURIComponent(row[2])); }
      catch { /* Ignore malformed locale records. */ }
  }
  const values = keys.map((key, index) => {
    const value = localized.get(key);
    return value && value !== source.values[index] ? value : null;
  });
  await verifyOrWrite(join(directory, `map-entity-${gameLocale}.json`),
    JSON.stringify({ version: 1, values }));
  console.log(`${gameLocale}: ${values.filter(Boolean).length} ID-matched map names`);
}
console.log(`${keys.length} unambiguous map entities; ${conflicts.size} conflicting IDs and ${classicMismatches.length} mismatched Classic IDs excluded`);
await import("./apply-wowhead-map-quest-locales.mjs");
