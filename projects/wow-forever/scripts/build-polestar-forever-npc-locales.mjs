/** Select Forever NPC translations by exact NPC ID and English name. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pfQuestRoot = process.argv[2] && resolve(process.argv[2]);
const polestarRoot = process.argv[3] && resolve(process.argv[3]);
const esMXFile = process.argv[4] && resolve(process.argv[4]);
const foreverDbFile = process.argv[5] && resolve(process.argv[5]);
if (!pfQuestRoot || !polestarRoot || !esMXFile || !foreverDbFile) {
  throw new Error("Pass pfQuest checkout, pinned Polestar locale directory, esMX Names.lua and Forever DB npc.jsonl");
}
const pfQuestRevision = execFileSync("git", ["rev-parse", "HEAD"],
  { cwd: pfQuestRoot, encoding: "utf8" }).trim();
if (pfQuestRevision !== "104f35678ca39ab1fb78b655f815cc7016f5e0c8") {
  throw new Error("pfQuest English NPC IDs differ from the reviewed revision");
}
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const languages = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR", ko: "koKR",
  "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const source = await readFile(join(pfQuestRoot, "db/enUS/units.lua"), "utf8");
const idsByName = new Map();
for (const line of source.split(/\r?\n/)) {
  const row = /^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/.exec(line);
  if (!row) continue;
  try {
    const name = JSON.parse(row[2].replace(/\\'/g, "'"));
    const ids = idsByName.get(name) ?? [];
    ids.push(Number(row[1]));
    idsByName.set(name, ids);
  } catch { /* Unsupported Lua escapes are excluded. */ }
}
const parseNames = (content) => {
  const names = new Map();
  let npcChunk = false;
  for (const line of content.split(/\r?\n/)) {
    const chunk = /^R\("([^"]+)", \d+, \d+, \[\[$/.exec(line);
    if (chunk) { npcChunk = chunk[1] === "npc"; continue; }
    if (line === "]])") { npcChunk = false; continue; }
    const row = npcChunk && /^(\d+)\t(.*)$/.exec(line);
    if (!row) continue;
    try { names.set(Number(row[1]), decodeURIComponent(row[2])); }
    catch { /* Invalid escaped text is excluded. */ }
  }
  return names;
};
const packs = {};
const hashes = {};
for (const [language, locale] of Object.entries(languages)) {
  const path = language === "es-MX" ? esMXFile : join(polestarRoot, locale, "Names.lua");
  const content = await readFile(path, "utf8");
  hashes[locale] = createHash("sha256").update(content).digest("hex");
  packs[language] = parseNames(content);
}
const usedNames = new Set();
for (const marker of Object.values(english.map.questMarkers)) {
  for (const field of ["name", "startsAt", "endsAt"]) if (marker[field]) usedNames.add(marker[field]);
}
for (const field of ["classTrainers", "professionTrainers", "mapgenieCommunity"]) {
  for (const record of Object.values(english.map[field])) {
    if (record.name) usedNames.add(record.name);
    if (field === "mapgenieCommunity" && record.detail) usedNames.add(record.detail);
  }
}
for (const name of Object.values(english.map.repairVendors)) usedNames.add(name);
for (const name of Object.values(english.map.questNpcs.names)) usedNames.add(name);
const foreverDbBytes = await readFile(foreverDbFile);
const foreverDbHash = createHash("sha256").update(foreverDbBytes).digest("hex");
if (foreverDbHash !== "8d6c0773b778381012bc453118ece647ecde08760483d53bbe24d04e9cd13c0b") {
  throw new Error("Forever DB NPC identities differ from the reviewed Polestar revision");
}
const foreverIdsByName = new Map();
for (const line of foreverDbBytes.toString("utf8").split(/\r?\n/)) {
  if (!line) continue;
  const { id, name } = JSON.parse(line);
  if (!usedNames.has(name) || !Number.isInteger(id) || id < 1) continue;
  const ids = foreverIdsByName.get(name) ?? [];
  ids.push(id);
  foreverIdsByName.set(name, ids);
}
for (const [name, ids] of foreverIdsByName) {
  if (!idsByName.has(name) && ids.length === 1) idsByName.set(name, ids);
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
  if (Object.keys(translations).length) names[name] = { npcIds: ids, ...translations };
}
const output = {
  source: {
    englishIds: {
      repository: "https://github.com/shagu/pfQuest", revision: pfQuestRevision,
      foreverDb: {
        repository: "https://github.com/fitzforge/polestar",
        revision: "1f5a2cfd221ce18f3333311562281e57f060070a",
        path: "forever-db/data/npc.jsonl", sha256: foreverDbHash,
      },
    },
    localizedNames: { repository: "https://github.com/fitzforge/polestar",
      revision: "1f5a2cfd221ce18f3333311562281e57f060070a", sha256: hashes,
      noticeDirectory: "public/third-party" },
  },
  names: Object.fromEntries(Object.entries(names).sort(([a], [b]) => a.localeCompare(b, "en"))),
};
await writeFile(join(root, "data/npc-name-localization/polestar-forever-names.json"),
  JSON.stringify(output, null, 2) + "\n");
console.log(`${Object.keys(names).length} distinct Forever NPC names with at least one verified locale`);
