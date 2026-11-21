/** Stage Wowhead translations when only resolved numbers differ from ForeverDB. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { aura, description, hasEastAsianEnglishCarryover, numbers,
  resolveLocalizedGrammar, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const classic = process.argv.includes("--classic");
const auraMode = process.argv.includes("--aura");
if (classic && auraMode || process.argv.length !== (classic || auraMode ? 3 : 2)) {
  throw new Error("Use --classic, --aura, or no arguments");
}
const field = auraMode ? "a" : classic ? "old" : "d";
const read = async (path) => readFile(join(root, path), "utf8");
const localeNames = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const captures = (await read(`data/site-research/wowhead-${classic ? "classic-" : ""}locale-captures.jsonl`))
  .split(/\r?\n/).filter(Boolean).map(JSON.parse).filter((record) => record.kind === "spell");
const details = new Map((await Promise.all(Array.from({ length: 64 }, async (_, shard) =>
  JSON.parse(await read(`public/data/spells/foreverdb/${shard}.json`)))))
  .flatMap(Object.values).map((detail) => [detail.id, detail]));
const packs = Object.fromEntries(await Promise.all(Object.entries(localeNames).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await read(
    `public/data/locales/wow-forever/spell-tooltip-${gameLocale}.json`))])));
const reviewed = JSON.parse(await read(`data/spell-tooltip-localization/${auraMode ?
  "reviewed-aura-spells.json" : `reviewed-${classic ? "classic-" : ""}overrides.json`}`));
const sharedAuras = auraMode ? (JSON.parse(await read(
  "data/spell-tooltip-localization/reviewed-overrides.json"))).reviewedAuras ?? {} : {};
const rejected = JSON.parse(await read(
  `data/spell-tooltip-localization/rejected-wowhead-${classic ? "classic-" :
    auraMode ? "aura-" : ""}candidates.json`));
const byId = new Map();
for (const capture of captures) {
  const records = byId.get(capture.id) ?? new Map();
  records.set(capture.locale, capture);
  byId.set(capture.id, records);
}

const numberPattern = /\d+(?:[.,]\d+)?/g;
const canonical = (number) => number.replace(",", ".");
const decimalCommaLocales = new Set(["deDE", "esES", "esMX", "frFR", "ptBR"]);
const shape = (text) => text.replace(numberPattern, "#")
  .replace(/\s+/gu, " ").trim();
const candidates = [];
const skipped = [];
let matchedIds = 0;
for (const [id, records] of byId) {
  const detail = details.get(id);
  const english = records.get("en");
  const original = english && (auraMode ? english.buff && aura(english) :
    description(english));
  if (!detail?.[field] || (classic && detail.old === detail.d) || !original ||
    (auraMode && /[?$]/.test(detail.a)) ||
    english.name !== detail.n || sameWords(original, detail[field]) ||
    shape(original) !== shape(detail[field])) continue;
  const oldNumbers = original.match(numberPattern) ?? [];
  const newNumbers = detail[field].match(numberPattern) ?? [];
  if (oldNumbers.length !== newNumbers.length) continue;
  const replacements = new Map();
  let consistent = true;
  for (let index = 0; index < oldNumbers.length; index += 1) {
    const before = canonical(oldNumbers[index]);
    const after = canonical(newNumbers[index]);
    if (replacements.has(before) && replacements.get(before) !== after) consistent = false;
    replacements.set(before, after);
  }
  if (!consistent || [...replacements].every(([before, after]) => before === after)) continue;
  matchedIds += 1;
  for (const [locale, gameLocale] of Object.entries(localeNames)) {
    if (packs[locale].entries[id]?.[field] ||
      reviewed.spells[id]?.locales[gameLocale] ||
      (auraMode && sharedAuras[detail.a]?.ids.includes(id) &&
        sharedAuras[detail.a].locales[gameLocale])) continue;
    if (rejected?.entries[`${id}:${gameLocale}`]) {
      skipped.push({ id, locale: gameLocale, reason: "Reviewed rejection" });
      continue;
    }
    const capture = records.get(locale);
    if (!capture) continue;
    const localized = resolveLocalizedGrammar((auraMode ?
      capture?.buff && aura(capture) : capture && description(capture)) ?? "", gameLocale);
    if (!localized || numbers(localized) !== numbers(original)) {
      skipped.push({ id, locale: gameLocale, reason: !localized
        ? "Unsupported localized markup" : "Localized numbers differ from Wowhead English" });
      continue;
    }
    const translation = localized.replace(numberPattern, (token) => {
      const value = replacements.get(canonical(token)) ?? canonical(token);
      return decimalCommaLocales.has(gameLocale) ? value.replace(".", ",") : value;
    });
    if (/\$[A-Za-z0-9{]/.test(translation) ||
      hasEastAsianEnglishCarryover(translation, gameLocale) ||
      sameWords(translation, detail[field]) ||
      numbers(translation) !== numbers(detail[field])) {
      skipped.push({ id, locale: gameLocale, reason: "Rendered text failed review checks" });
      continue;
    }
    candidates.push({ id, locale: gameLocale, source: detail[field], translation,
      evidence: capture.url, numericSource: original });
  }
}
const report = { version: 1, matchedIds, candidates, skipped };
await writeFile(join(root, `data/site-research/wowhead-${classic ? "classic-" :
  auraMode ? "aura-" : ""}numeric-drift-candidates.json`),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`${matchedIds} source texts differ only in numbers; ${candidates.length} locale candidates; ${skipped.length} skipped.`);
