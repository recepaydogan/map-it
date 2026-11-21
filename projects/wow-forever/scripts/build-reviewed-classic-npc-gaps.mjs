/** Pin partial Classic NPC names that fill Forever map gaps without replacing Forever names. */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const source = (await read("data/npc-name-localization/invariant-multiword-names.json")).source;
const forever = (await read("data/npc-name-localization/polestar-forever-names.json")).names;
const selected = {
  "Sir S. J. Erlgadin": 718,
  "Tundra MacGrann": 1266,
  "Foggy MacKreel": 2696,
  "Ak'Zeloth": 3521,
  "Tapoke \"Slim\" Jahn": 4962,
  "Do'gol": 5087,
  "Drusilla La Salle": 459,
  "Lyria Du Lac": 913,
  "Wu Shen": 5479,
  "Austil de Mon": 2131,
  "Un'Thuwa": 5880,
  "Onin MacHammar": 6886,
  "McGavan": 7794,
  "Ag'tor Bloodfist": 8576,
  "A-Me 01": 9623,
  "Se'Jib": 7871,
  "Bibbly F'utzbuckle": 11438,
  "Doctor Gustaf VanHowzen": 12939,
  "Sergeant De Vries": 955,
  "Ug'thok": 10266,
  "X'yera": 6014,
};
const locales = { en: "enUS", de: "deDE", es: "esES", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const parse = (raw) => {
  const names = new Map();
  for (const match of raw.matchAll(/^  \[(\d+)\] = ("(?:\\.|[^"\\])*"),?$/gm)) {
    try { names.set(Number(match[1]), JSON.parse(match[2].replace(/\\'/g, "'"))); }
    catch { /* Exclude unsupported Lua escapes. */ }
  }
  return names;
};
const namesByLocale = {};
for (const [language, locale] of Object.entries(locales)) {
  const url = `https://raw.githubusercontent.com/shagu/pfQuest/${source.revision}/db/${locale}/units.lua`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${locale}: source download failed (${response.status})`);
  const raw = await response.text();
  const sha256 = createHash("sha256").update(raw.replace(/\n/g, "\r\n")).digest("hex");
  const expected = language === "en" ? source.englishSha256 : source.localeSha256[locale];
  if (sha256 !== expected) throw new Error(`${locale}: pinned source hash changed`);
  namesByLocale[language] = parse(raw);
}

const result = {};
for (const [name, id] of Object.entries(selected)) {
  if (namesByLocale.en.get(id) !== name ||
    (forever[name]?.npcIds && !forever[name].npcIds.includes(id))) {
    throw new Error(`${name}: Classic NPC identity changed`);
  }
  const entry = { kind: "npc", npcIds: [id], sourcePriority: "classic-fallback",
    invariantLanguages: [], evidence: {} };
  for (const language of ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"]) {
    const sourceLanguage = language === "es-MX" ? "es" : language;
    const value = forever[name]?.[language] ?? namesByLocale[sourceLanguage].get(id);
    if (typeof value !== "string" || !value.trim()) throw new Error(`${name}: missing ${language}`);
    entry[language] = value;
    if (value === name) {
      if (namesByLocale[sourceLanguage].get(id) !== name) {
        throw new Error(`${name}: unverified ${language} invariant`);
      }
      entry.invariantLanguages.push(language);
      const locale = locales[sourceLanguage];
      entry.evidence[language] = `https://raw.githubusercontent.com/shagu/pfQuest/${source.revision}/db/${locale}/units.lua`;
    }
  }
  if (!entry.invariantLanguages.length) delete entry.invariantLanguages;
  if (!Object.keys(entry.evidence).length) delete entry.evidence;
  result[name] = entry;
}
const path = join(root, "data/quest-marker-localization/reviewed-classic-npc-gaps.json");
const output = JSON.stringify(result, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (output !== await readFile(path, "utf8")) throw new Error("Reviewed Classic NPC gap catalog is stale");
} else await writeFile(path, output);
console.log(`${Object.keys(result).length} ID-matched NPC names from pinned Classic locale files`);
