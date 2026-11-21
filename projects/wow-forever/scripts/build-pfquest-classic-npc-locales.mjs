/** Review exact English NPC names against the MIT-licensed pfQuest Classic locale tables. */
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = process.argv[2] && resolve(process.argv[2]);
if (!sourceRoot) throw new Error("Pass the checked-out pfQuest repository path");
const revision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: sourceRoot, encoding: "utf8" }).trim();
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const languages = { de: "deDE", es: "esES", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };

const parseNames = async (locale) => {
  const text = await readFile(join(sourceRoot, "db", locale, "units.lua"), "utf8");
  const names = new Map();
  for (const line of text.split(/\r?\n/)) {
    const row = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (!row) continue;
    try { names.set(row[1], JSON.parse(row[2].replace(/\\'/g, "'"))); }
    catch { /* Unsupported escapes are left out rather than guessed. */ }
  }
  return names;
};

const sourceNames = await parseNames("enUS");
const localized = Object.fromEntries(await Promise.all(Object.entries(languages)
  .map(async ([language, locale]) => [language, await parseNames(locale)])));
const idsByName = new Map();
for (const [id, name] of sourceNames) {
  const ids = idsByName.get(name) ?? [];
  ids.push(id);
  idsByName.set(name, ids);
}
const usedNames = new Set();
for (const marker of Object.values(english.map.questMarkers)) {
  for (const field of ["name", "startsAt", "endsAt"]) if (marker[field]) usedNames.add(marker[field]);
}
for (const field of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const record of Object.values(english.map[field])) if (record.name) usedNames.add(record.name);
}
for (const name of Object.values(english.map.repairVendors)) usedNames.add(name);
for (const name of Object.values(english.map.questNpcs.names)) usedNames.add(name);
const names = {};
for (const name of usedNames) {
  const ids = idsByName.get(name);
  if (!ids?.length) continue;
  const translations = {};
  let eligible = true;
  for (const language of Object.keys(languages)) {
    const values = new Set(ids.map((id) => localized[language].get(id)).filter(Boolean));
    if (values.size !== 1 || values.has(name)) {
      eligible = false;
      break;
    }
    translations[language] = [...values][0];
  }
  if (eligible) names[name] = { npcIds: ids.map(Number), ...translations };
}
const output = {
  source: { repository: "https://github.com/shagu/pfQuest", revision, license: "MIT" },
  names: Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "en"))),
};
await writeFile(join(root, "data/npc-name-localization/pfquest-classic-names.json"),
  JSON.stringify(output, null, 2) + "\n");
console.log(`${Object.keys(names).length} distinct Classic NPC names from pfQuest ${revision}`);
