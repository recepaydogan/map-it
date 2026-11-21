/** Select unambiguous Forever quest names by Classic ID and exact current English title. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pfQuestRoot = process.argv[2] && resolve(process.argv[2]);
const polestarRoot = process.argv[3] && resolve(process.argv[3]);
const esMXFile = process.argv[4] && resolve(process.argv[4]);
if (!pfQuestRoot || !polestarRoot || !esMXFile) {
  throw new Error("Pass pfQuest checkout, pinned Polestar locale directory and esMX Names.lua");
}
const pfQuestRevision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: pfQuestRoot, encoding: "utf8" }).trim();
if (pfQuestRevision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("pfQuest English quest IDs differ from the reviewed revision");
}
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const questDetails = JSON.parse(await readFile(join(root, "public/data/quests/quest-details.json"), "utf8"));
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };

const parseEnglishTitles = async () => {
  const source = await readFile(join(pfQuestRoot, "db/enUS/quests.lua"), "utf8");
  const idsByTitle = new Map();
  let questId;
  for (const line of source.split(/\r?\n/)) {
    const row = /^  \[(\d+)\] = \{$/.exec(line);
    if (row) { questId = Number(row[1]); continue; }
    const title = /^    \["T"\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
    if (title && questId) {
      try {
        const name = JSON.parse(title[1].replace(/\\'/g, "'"));
        const ids = idsByTitle.get(name) ?? [];
        ids.push(questId);
        idsByTitle.set(name, ids);
      } catch { /* Unsupported Lua escapes are excluded. */ }
    }
    if (/^  \},?$/.test(line)) questId = undefined;
  }
  return idsByTitle;
};
const parseNames = (content) => {
  const names = new Map();
  let questChunk = false;
  for (const line of content.split(/\r?\n/)) {
    const chunk = /^R\("([^"]+)", \d+, \d+, \[\[$/.exec(line);
    if (chunk) { questChunk = chunk[1] === "quest"; continue; }
    if (line === "]])") { questChunk = false; continue; }
    const row = questChunk && /^(\d+)\t(.*)$/.exec(line);
    if (!row) continue;
    try { names.set(Number(row[1]), decodeURIComponent(row[2])); }
    catch { /* Invalid escaped text is excluded. */ }
  }
  return names;
};
const idsByTitle = await parseEnglishTitles();
const sameQuestTitle = (a, b) => a === b || a.replace(/\.$/, "") === b.replace(/\.$/, "");
// Forever-only quests have no Classic ID. Their current English IDs come from
// the app's quest-details catalog, which was extracted from the same game.
const foreverIdsByTitle = new Map();
for (const [id, quest] of Object.entries(questDetails.quests)) {
  if (!quest.title || !Number.isInteger(Number(id))) continue;
  const ids = foreverIdsByTitle.get(quest.title) ?? [];
  ids.push(Number(id));
  foreverIdsByTitle.set(quest.title, ids);
}
const packs = {};
const hashes = {};
for (const [language, locale] of Object.entries(languages)) {
  const path = language === "es-MX" ? esMXFile : join(polestarRoot, locale, "Names.lua");
  const content = await readFile(path, "utf8");
  hashes[locale] = createHash("sha256").update(content).digest("hex");
  packs[language] = parseNames(content);
}
const titles = {};
for (const name of new Set(Object.values(english.map.questMarkers).map((marker) => marker.name))) {
  const ids = idsByTitle.get(name) ?? foreverIdsByTitle.get(name);
  if (!ids?.length || ids.some((id) => questDetails.quests[id]?.title &&
    !sameQuestTitle(questDetails.quests[id].title, name))) continue;
  const translations = {};
  let eligible = true;
  for (const language of Object.keys(languages)) {
    const values = new Set(ids.map((id) => packs[language].get(id)).filter(Boolean));
    if (values.size !== 1 || values.has(name) ||
      ([...values][0].match(/"/g) ?? []).length % 2 !== 0) {
      eligible = false;
      break;
    }
    translations[language] = [...values][0];
  }
  if (eligible) titles[name] = { questIds: ids,
    englishSource: idsByTitle.has(name) ? "pfquest" : "quest-details", ...translations };
}
const output = {
  source: {
    englishIds: { repository: "https://github.com/shagu/pfQuest", revision: pfQuestRevision },
    foreverEnglishIds: "public/data/quests/quest-details.json",
    localizedNames: { repository: "https://github.com/fitzforge/polestar",
      revision: "1f5a2cfd221ce18f3333311562281e57f060070a", sha256: hashes,
      noticeDirectory: "public/third-party" },
  },
  titles: Object.fromEntries(Object.entries(titles).sort(([a], [b]) => a.localeCompare(b, "en"))),
};
await writeFile(join(root, "data/quest-title-localization/polestar-forever-titles.json"),
  JSON.stringify(output, null, 2) + "\n");
console.log(`${Object.keys(titles).length} distinct Forever quest titles verified in all eight locales`);

const partialTitles = {};
const usedNames = new Set([
  ...Object.values(english.map.questMarkers).map((marker) => marker.name),
  ...Object.values(english.map.mapgenieCommunity).map((marker) => marker.name),
]);
for (const name of usedNames) {
  if (titles[name]) continue;
  const ids = idsByTitle.get(name) ?? foreverIdsByTitle.get(name);
  if (!ids?.length || ids.some((id) => questDetails.quests[id]?.title &&
    !sameQuestTitle(questDetails.quests[id].title, name))) continue;
  const translations = {};
  for (const language of Object.keys(languages)) {
    const values = new Set(ids.map((id) => packs[language].get(id)).filter(Boolean));
    if (values.size !== 1 || values.has(name) ||
      ([...values][0].match(/"/g) ?? []).length % 2 !== 0) continue;
    translations[language] = [...values][0];
  }
  if (Object.keys(translations).length) partialTitles[name] = { questIds: ids,
    englishSource: idsByTitle.has(name) ? "pfquest" : "quest-details", ...translations };
}
const partialOutput = { source: output.source,
  titles: Object.fromEntries(Object.entries(partialTitles).sort(([a], [b]) => a.localeCompare(b, "en"))) };
await writeFile(join(root, "data/quest-title-localization/polestar-forever-partial-titles.json"),
  JSON.stringify(partialOutput, null, 2) + "\n");
console.log(`${Object.keys(partialTitles).length} additional titles verified in at least one locale`);
