/** Join exact English game-object IDs to pinned Forever localized object names. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const [pfQuestArg, polestarArg, esMXArg] = process.argv.slice(2);
if (!pfQuestArg || !polestarArg || !esMXArg) {
  throw new Error("Pass pinned pfQuest checkout, Polestar locale directory and esMX Names.lua");
}
const pfQuestRoot = resolve(pfQuestArg);
const polestarRoot = resolve(polestarArg);
const esMXFile = resolve(esMXArg);
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const reference = await read("data/npc-name-localization/polestar-forever-names.json");
const pfQuestRevision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: pfQuestRoot, encoding: "utf8" }).trim();
if (pfQuestRevision !== reference.source.englishIds.revision) {
  throw new Error("English game-object IDs are not from the pinned pfQuest revision");
}
const english = await read("src/i18n/locales/en.json");
const idsByName = new Map();
const objectSource = await readFile(join(pfQuestRoot, "db/enUS/objects.lua"), "utf8");
for (const line of objectSource.split(/\r?\n/)) {
  const row = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
  if (!row) continue;
  try {
    const name = JSON.parse(row[2].replace(/\\'/g, "'"));
    const ids = idsByName.get(name) ?? [];
    ids.push(Number(row[1]));
    idsByName.set(name, ids);
  } catch { /* Unsupported Lua escapes cannot be matched safely. */ }
}
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const packs = {};
for (const [language, gameLocale] of Object.entries(languages)) {
  const file = language === "es-MX" ? esMXFile : join(polestarRoot, gameLocale, "Names.lua");
  const content = await readFile(file, "utf8");
  const hash = createHash("sha256").update(content).digest("hex");
  if (hash !== reference.source.localizedNames.sha256[gameLocale]) {
    throw new Error(`${gameLocale}: Forever object source hash changed`);
  }
  const names = new Map();
  let inObjectChunk = false;
  for (const line of content.split(/\r?\n/)) {
    const chunk = /^R\("([^"]+)", \d+, \d+, \[\[$/.exec(line);
    if (chunk) { inObjectChunk = chunk[1] === "object"; continue; }
    if (line === "]])") { inObjectChunk = false; continue; }
    const row = inObjectChunk && /^(\d+)\t(.*)$/.exec(line);
    if (row) try { names.set(Number(row[1]), decodeURIComponent(row[2])); }
      catch { /* Invalid percent-escaped names are excluded. */ }
  }
  packs[language] = names;
}
const usedNames = new Set();
for (const marker of Object.values(english.map.questMarkers)) {
  for (const field of ["startsAt", "endsAt"]) if (marker[field]) usedNames.add(marker[field]);
}
const names = {};
for (const name of usedNames) {
  const ids = idsByName.get(name);
  if (!ids?.length) continue;
  const translations = {};
  for (const language of Object.keys(languages)) {
    const values = new Set(ids.map((id) => packs[language].get(id)).filter(Boolean));
    if (values.size !== 1 || values.has(name) ||
      ([...values][0].match(/"/g) ?? []).length % 2 !== 0) continue;
    translations[language] = [...values][0];
  }
  if (Object.keys(translations).length) names[name] = { objectIds: ids, ...translations };
}
const output = {
  source: { englishIds: { repository: "https://github.com/shagu/pfQuest",
    revision: pfQuestRevision, file: "db/enUS/objects.lua",
    sha256: createHash("sha256").update(objectSource).digest("hex") },
  localizedNames: reference.source.localizedNames },
  names: Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "en"))),
};
const directory = join(root, "data/object-name-localization");
await mkdir(directory, { recursive: true });
await writeFile(join(directory, "polestar-forever-objects.json"), JSON.stringify(output, null, 2) + "\n");
for (const language of Object.keys(languages)) {
  console.log(`${language}: ${Object.values(names).filter((entry) => entry[language]).length} ID-matched objects`);
}
