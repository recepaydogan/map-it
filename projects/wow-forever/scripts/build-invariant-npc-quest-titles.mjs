/** Find quest titles that are NPC proper names unchanged in both Classic locale tables. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = process.argv[2] && resolve(process.argv[2]);
if (!sourceRoot) throw new Error("Pass the pinned pfQuest checkout");
const revision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: sourceRoot, encoding: "utf8" }).trim();
if (revision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("Classic locale source revision changed");
}
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const english = await read("src/i18n/locales/en.json");
const entitySource = await read("public/data/locales/wow-forever/map-entity-source.json");
const languages = { de: "deDE", es: "esES", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const parseQuestTitles = (raw) => {
  const titles = new Map();
  let id;
  for (const line of raw.split(/\r?\n/)) {
    const entry = /^  \[(\d+)\] = \{$/.exec(line);
    if (entry) { id = entry[1]; continue; }
    const title = /^    \["T"\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (title && id) try { titles.set(id, JSON.parse(title[1].replace(/\\'/g, "'"))); }
      catch { /* Leave unsupported Lua escapes out. */ }
    if (/^  \},?$/.test(line)) id = undefined;
  }
  return titles;
};
const parseNpcNames = (raw) => {
  const names = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const entry = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (entry) try { names.set(entry[1], JSON.parse(entry[2].replace(/\\'/g, "'"))); }
      catch { /* Leave unsupported Lua escapes out. */ }
  }
  return names;
};
const readTables = async (locale) => {
  const questRaw = await readFile(join(sourceRoot, `db/${locale}/quests.lua`), "utf8");
  const npcRaw = await readFile(join(sourceRoot, `db/${locale}/units.lua`), "utf8");
  return { quests: parseQuestTitles(questRaw), npcs: parseNpcNames(npcRaw),
    hashes: [questRaw, npcRaw].map((raw) => createHash("sha256").update(raw).digest("hex")) };
};
const source = await readTables("enUS");
const idsByName = (rows) => {
  const result = new Map();
  for (const [id, name] of rows) result.set(name, [...(result.get(name) ?? []), id]);
  return result;
};
const questIds = idsByName(source.quests);
const npcIds = idsByName(source.npcs);
const mapQuestNames = entitySource.keys.flatMap((key, index) =>
  key.startsWith("Quest:") ? [entitySource.values[index]] : []);
const candidateNames = new Set([
  ...Object.values(english.map.questMarkers).map((marker) => marker.name),
  ...mapQuestNames,
]);
const embeddedNpcIds = new Map([...candidateNames]
  .filter((name) => name.length >= 5 && !npcIds.has(name))
  .map((name) => [name, [...source.npcs].flatMap(([id, npc]) =>
    npc.startsWith(`${name} `) || npc.endsWith(` ${name}`) ||
      npc.includes(` ${name} `) ? [id] : [])]));
const names = {};
const localHashes = {};
for (const [language, locale] of Object.entries(languages)) {
  const localized = await readTables(locale);
  const app = await read(`src/i18n/locales/${language}.json`);
  const entityPack = await read(`public/data/locales/wow-forever/map-entity-${locale}.json`);
  localHashes[locale] = localized.hashes;
  for (const name of candidateNames) {
    const quests = questIds.get(name);
    const exactNpcIds = npcIds.get(name);
    const npcs = exactNpcIds ?? embeddedNpcIds.get(name);
    if (!quests?.length || !npcs?.length ||
      !quests.every((id) => localized.quests.get(id) === name) ||
      !npcs.every((id) => exactNpcIds
        ? localized.npcs.get(id) === name
        : localized.npcs.get(id)?.includes(name))) continue;
    if (Object.entries(english.map.questMarkers).some(([id, marker]) => marker.name === name &&
      app.map.questMarkers[id]?.name && app.map.questMarkers[id].name !== name)) continue;
    if (entitySource.keys.some((key, index) => key.startsWith("Quest:") &&
      entitySource.values[index] === name && entityPack.values[index] &&
      entityPack.values[index] !== name)) continue;
    names[name] ??= { questIds: quests.map(Number), npcIds: npcs.map(Number) };
    names[name][language] = name;
  }
}
const catalog = { source: { repository: "https://github.com/shagu/pfQuest", revision,
  license: "MIT", englishSha256: source.hashes, localeSha256: localHashes },
selection: "Quest title and matching NPC proper name are unchanged for every Classic ID, with no conflicting app or Forever entity translation",
  names: Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "en"))) };
const path = join(root, "data/quest-title-localization/invariant-npc-quest-titles.json");
const output = JSON.stringify(catalog, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (await readFile(path, "utf8") !== output) throw new Error("Invariant quest title catalog is stale");
} else await writeFile(path, output);
for (const language of Object.keys(languages)) {
  console.log(`${language}: ${Object.values(names).filter((record) => record[language]).length} invariant NPC quest titles`);
}
