/** Review matching food and drink tooltips after removing an extra Wowhead XP effect. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { description, hasEastAsianEnglishCarryover, numbers,
  resolveLocalizedGrammar } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => readFile(join(root, path), "utf8");
const apply = process.argv.length === 3 && process.argv[2] === "--apply";
if (process.argv.length > (apply ? 3 : 2)) {
  throw new Error("Use --apply or no arguments");
}

const localeNames = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const extraXp = {
  en: "Additionally, experience gained from kills is increased by 5%.",
  de: "Außerdem wird die durch Siege erhaltene Erfahrung um 5% erhöht.",
  es: "Además, la experiencia obtenida al matar enemigos aumenta un 5%.",
  mx: "Además, la experiencia que ganas por eliminar enemigos aumenta un 5%.",
  fr: "L’expérience que vous gagnez en éliminant des adversaires est également augmentée de 5 %.",
  ko: "추가로, 적 처치 시 획득하는 경험치가 5%만큼 증가합니다.",
  pt: "Além disso, a experiência obtida com os abates é aumentada em 5%.",
  cn: "此外，击杀获得的经验值提高5%。",
  tw: "此外，擊殺敵人獲得的經驗值提高5%。",
};
const decimalCommaLocales = new Set(["de", "es", "mx", "fr", "pt"]);
const numberPattern = /\d+(?:[.,]\d+)?/g;
const canonical = (number) => number.replace(",", ".");
const shape = (text) => text.replace(numberPattern, "#")
  .replace(/\s+/gu, " ").trim();

const fallback = JSON.parse(await read("data/site-research/client-wowhead-fallback.json"));
const reviewed = JSON.parse(await read("data/spell-tooltip-localization/reviewed-overrides.json"));
const captures = new Map();
for (const line of (await read("data/site-research/wowhead-locale-captures.jsonl"))
  .split(/\r?\n/).filter(Boolean)) {
  const capture = JSON.parse(line);
  if (capture.kind !== "spell") continue;
  const byLocale = captures.get(capture.id) ?? new Map();
  byLocale.set(capture.locale, capture);
  captures.set(capture.id, byLocale);
}

const added = [];
for (const record of fallback.records) {
  if (!record.source.includes("Must remain seated while") ||
    !/If you spend at least 10 (?:sec|seconds) eating/.test(record.source) ||
    reviewed.spells[record.id]) continue;
  const byLocale = captures.get(record.id);
  const english = byLocale?.get("en");
  const englishTooltip = english && description(english);
  if (!englishTooltip?.endsWith(extraXp.en)) continue;
  const englishBody = englishTooltip.slice(0, -extraXp.en.length).trim();
  if (shape(englishBody) !== shape(record.source)) continue;
  const oldNumbers = englishBody.match(numberPattern) ?? [];
  const sourceNumbers = record.source.match(numberPattern) ?? [];
  if (oldNumbers.length !== sourceNumbers.length) continue;
  const replacements = new Map();
  let consistent = true;
  for (let index = 0; index < oldNumbers.length; index += 1) {
    const before = canonical(oldNumbers[index]);
    const after = canonical(sourceNumbers[index]);
    if (replacements.has(before) && replacements.get(before) !== after) {
      consistent = false;
    }
    replacements.set(before, after);
  }
  if (!consistent) continue;

  const locales = {};
  for (const [siteLocale, gameLocale] of Object.entries(localeNames)) {
    const capture = byLocale.get(siteLocale);
    const localized = capture && description(capture);
    if (!localized?.endsWith(extraXp[siteLocale])) break;
    let translation = localized.slice(0, -extraXp[siteLocale].length).trim();
    if (numbers(translation) !== numbers(englishBody)) break;
    translation = translation.replace(numberPattern, (token) => {
      const value = replacements.get(canonical(token)) ?? canonical(token);
      return decimalCommaLocales.has(siteLocale) ? value.replace(".", ",") : value;
    });
    if (siteLocale === "mx") {
      translation = translation
        .replace("Debes permanecer sentado mientras comes. Debes permanecer sentado mientras comes.",
          "Debes permanecer sentado mientras comes.")
        .replace("Debes permanecer sentado mientras bebes. Debes permanecer sentado mientras comes.",
          "Debes permanecer sentado mientras bebes.");
      if (record.source.includes("while drinking")) {
        translation = translation.replace("Si lo haces durante al menos 10 s",
          "Si comes durante al menos 10 s");
      }
    }
    if (siteLocale === "tw") {
      translation = translation.replace("如果進食時間超過10秒", "如果進食至少10秒");
    }
    translation = resolveLocalizedGrammar(translation, gameLocale);
    if (translation.includes("$") ||
      hasEastAsianEnglishCarryover(translation, gameLocale) ||
      numbers(translation) !== numbers(record.source)) break;
    locales[gameLocale] = translation;
  }
  if (Object.keys(locales).length !== Object.keys(localeNames).length) continue;
  reviewed.spells[record.id] = { source: record.source, locales,
    evidence: `https://nether.wowhead.com/forever/tooltip/spell/${record.id}`,
    correctionBasis: Object.fromEntries(Object.keys(locales).map((locale) =>
      [locale, "Same-ID Wowhead localized tooltip. Removed XP effect absent from " +
        "ForeverDB, resolved the source's numeric values, and corrected repeated " +
        "Mexican Spanish seating text and Traditional Chinese minimum duration."])) };
  added.push(record.id);
}

if (apply && added.length) {
  await writeFile(join(root, "data/spell-tooltip-localization/reviewed-overrides.json"),
    `${JSON.stringify(reviewed, null, 2)}\n`);
}
console.log(`${apply ? "Added" : "Eligible"} ${added.length} spell IDs / ` +
  `${added.length * Object.keys(localeNames).length} locale records.`);
console.log(`IDs: ${added.join(", ")}`);
