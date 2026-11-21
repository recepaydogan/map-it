/** Match captured Wowhead spell text to exact ForeverDB identities and values. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { description, hasEastAsianEnglishCarryover, numbers,
  resolveLocalizedGrammar, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "data/site-research");
const captures = (await readFile(join(directory, "wowhead-locale-captures.jsonl"), "utf8"))
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
  .filter((record) => record.kind === "spell");
const details = new Map((await Promise.all(Array.from({ length: 64 }, async (_, shard) =>
  JSON.parse(await readFile(join(root, `public/data/spells/foreverdb/${shard}.json`), "utf8")))))
  .flatMap(Object.values).map((detail) => [detail.id, detail]));
const localeNames = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const packs = Object.fromEntries(await Promise.all(Object.entries(localeNames).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/spell-tooltip-${gameLocale}.json`), "utf8"))])));
const reviewed = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/reviewed-overrides.json"), "utf8"));
const rejected = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/rejected-wowhead-candidates.json"), "utf8"));
if (rejected.version !== 1 || !rejected.entries) {
  throw new Error("Invalid rejected Wowhead candidates catalog");
}
const byId = new Map();
for (const capture of captures) {
  const records = byId.get(capture.id) ?? new Map();
  records.set(capture.locale, capture);
  byId.set(capture.id, records);
}

const candidates = [];
const skipped = [];
for (const [id, records] of byId) {
  const source = details.get(id);
  const english = records.get("en");
  const original = english && description(english);
  if (!source?.d || !original || english.name !== source.n ||
    !sameWords(original, source.d)) {
    skipped.push({ id, reason: "English source mismatch", source: source?.d,
      wowhead: original });
    continue;
  }
  for (const [locale, gameLocale] of Object.entries(localeNames)) {
    const capture = records.get(locale);
    if (!capture || packs[locale].entries[id]?.d) continue;
    const raw = description(capture);
    const translated = raw && resolveLocalizedGrammar(raw, gameLocale);
    const leadingEnglish = original.replace(/\s+/gu, " ").split(" ").slice(0, 4).join(" ");
    const englishCarryover = (leadingEnglish.length >= 15 &&
      translated?.replace(/\s+/gu, " ").startsWith(leadingEnglish)) ||
      hasEastAsianEnglishCarryover(translated ?? "", gameLocale);
    const rejection = rejected.entries[`${id}:${gameLocale}`];
    if (rejection) {
      skipped.push({ id, locale: gameLocale, reason: rejection });
      continue;
    }
    if (!translated || /\$[A-Za-z0-9{]/.test(translated) || englishCarryover ||
      sameWords(translated, original) ||
      numbers(translated) !== numbers(source.d)) {
      skipped.push({ id, locale: gameLocale, reason: !translated ? "Unsupported markup"
        : /\$[A-Za-z0-9{]/.test(translated) ? "Unresolved variable"
          : englishCarryover ? "English carryover"
            : sameWords(translated, original) ? "English fallback" : "Number mismatch" });
      continue;
    }
    candidates.push({ id, locale: gameLocale, source: source.d,
      translation: translated, evidence: capture.url });
  }
}
for (const candidate of candidates) {
  const recorded = reviewed.spells[candidate.id];
  if (recorded?.source === candidate.source && recorded.locales[candidate.locale] &&
    recorded.locales[candidate.locale] !== candidate.translation) {
    throw new Error(`Reviewed tooltip disagrees with capture: ${candidate.id}/${candidate.locale}`);
  }
}
const reviewedCount = candidates.filter((candidate) =>
  reviewed.spells[candidate.id]?.locales[candidate.locale] === candidate.translation).length;
const report = { version: 1, captured: captures.length, reviewedCount, candidates, skipped };
await writeFile(join(directory, "wowhead-spell-candidates.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`Captured ${captures.length} spell locale records; ${candidates.length} source-matched candidates; ${reviewedCount} reviewed; ${skipped.length} skipped.`);
for (const record of skipped.slice(0, 8)) console.log(`${record.id}/${record.locale ?? "en"}: ${record.reason}`);
