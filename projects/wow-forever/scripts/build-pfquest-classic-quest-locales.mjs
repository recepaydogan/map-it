/** Review exact English Classic quest titles against the MIT-licensed pfQuest locale tables. */
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

const parseTitles = async (locale) => {
  const text = await readFile(join(sourceRoot, "db", locale, "quests.lua"), "utf8");
  const titles = new Map();
  let questId;
  for (const line of text.split(/\r?\n/)) {
    const row = /^  \[(\d+)\] = \{$/.exec(line);
    if (row) {
      questId = row[1];
      continue;
    }
    const title = /^    \["T"\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (title && questId) {
      // pfQuest uses Lua single-quote escapes inside double-quoted strings.
      try { titles.set(questId, JSON.parse(title[1].replace(/\\'/g, "'"))); }
      catch { /* Unsupported escapes are left out rather than guessed. */ }
    }
    if (/^  \},?$/.test(line)) questId = undefined;
  }
  return titles;
};

const sourceTitles = await parseTitles("enUS");
const normalizedTitle = (title) => title.replace(/\s+/g, " ").trim();
const localized = Object.fromEntries(await Promise.all(Object.entries(languages)
  .map(async ([language, locale]) => [language, await parseTitles(locale)])));
const idsByTitle = new Map();
for (const [id, title] of sourceTitles) {
  const key = normalizedTitle(title);
  const ids = idsByTitle.get(key) ?? [];
  ids.push(id);
  idsByTitle.set(key, ids);
}
const titles = {};
const partialTitles = {};
for (const name of new Set(Object.values(english.map.questMarkers).map((marker) => marker.name))) {
  const ids = idsByTitle.get(normalizedTitle(name));
  if (!ids?.length) continue;
  const translations = {};
  for (const language of Object.keys(languages)) {
    const values = new Set(ids.map((id) => localized[language].get(id)).filter(Boolean));
    if (values.size === 1 && normalizedTitle([...values][0]) !== normalizedTitle(name)) {
      const value = [...values][0];
      translations[language] = ids.some((id) => sourceTitles.get(id) !== name) ? value.trim() : value;
    }
  }
  if (Object.keys(translations).length === Object.keys(languages).length) {
    titles[name] = { questIds: ids.map(Number), ...translations };
  } else if (Object.keys(translations).length) {
    partialTitles[name] = { questIds: ids.map(Number), ...translations };
  }
}
const output = {
  source: { repository: "https://github.com/shagu/pfQuest", revision, license: "MIT" },
  titles: Object.fromEntries(Object.entries(titles).sort(([a], [b]) => a.localeCompare(b, "en"))),
};
const file = join(root, "data/quest-title-localization/pfquest-classic-titles.json");
await writeFile(file, JSON.stringify(output, null, 2) + "\n");
console.log(`${Object.keys(titles).length} distinct Classic quest titles from pfQuest ${revision}`);
await writeFile(join(root, "data/quest-title-localization/pfquest-classic-partial-titles.json"),
  JSON.stringify({ source: output.source,
    titles: Object.fromEntries(Object.entries(partialTitles).sort(([a], [b]) => a.localeCompare(b, "en"))) },
  null, 2) + "\n");
console.log(`${Object.keys(partialTitles).length} partially localized Classic quest titles`);
