/** Match captured Wowhead buff text to exact ForeverDB aura sources. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { aura, fullAura, hasEastAsianEnglishCarryover, numbers,
  resolveLocalizedGrammar, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "data/site-research");
const records = new Map();
for (const line of (await readFile(join(directory, "wowhead-locale-captures.jsonl"), "utf8"))
  .split(/\r?\n/).filter(Boolean)) {
  const capture = JSON.parse(line);
  if (capture.kind === "spell") records.set(`${capture.id}:${capture.locale}`, capture);
}
const details = (await Promise.all(Array.from({ length: 64 }, async (_, shard) =>
  JSON.parse(await readFile(join(root, `public/data/spells/foreverdb/${shard}.json`), "utf8")))))
  .flatMap(Object.values);
const localeNames = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const packs = Object.fromEntries(await Promise.all(Object.entries(localeNames).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await readFile(join(root,
    `public/data/locales/wow-forever/spell-tooltip-${gameLocale}.json`), "utf8"))])));
const reviewed = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/reviewed-overrides.json"), "utf8"));
const reviewedSpells = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/reviewed-aura-spells.json"), "utf8"));
const rejected = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/rejected-wowhead-aura-candidates.json"), "utf8"));
if (rejected.version !== 1 || !rejected.entries) {
  throw new Error("Invalid rejected Wowhead aura candidates catalog");
}
const candidates = [];
const skipped = [];
for (const detail of details) {
  if (!detail.a) continue;
  const english = records.get(`${detail.id}:en`);
  if (!english?.buff) continue;
  const original = [aura(english), fullAura(english)]
    .find((text) => text && sameWords(text, detail.a));
  if (english.name !== detail.n || !original || !sameWords(original, detail.a) ||
    /[?$]/.test(detail.a)) {
    skipped.push({ id: detail.id, reason: "English aura source mismatch" });
    continue;
  }
  for (const [locale, gameLocale] of Object.entries(localeNames)) {
    const capture = records.get(`${detail.id}:${locale}`);
    if (!capture?.buff || packs[locale].entries[detail.id]?.a) continue;
    const raw = original && sameWords(aura(english), original)
      ? aura(capture) : fullAura(capture);
    const translated = raw && resolveLocalizedGrammar(raw, gameLocale);
    const rejection = rejected.entries[`${detail.id}:${gameLocale}`];
    if (rejection) {
      skipped.push({ id: detail.id, locale: gameLocale, reason: rejection });
      continue;
    }
    const leadingEnglish = original.replace(/\s+/gu, " ").split(" ").slice(0, 4).join(" ");
    const englishCarryover = (leadingEnglish.length >= 15 &&
      translated?.replace(/\s+/gu, " ").startsWith(leadingEnglish)) ||
      hasEastAsianEnglishCarryover(translated ?? "", gameLocale);
    if (!translated || /\$[A-Za-z0-9{]/.test(translated) || englishCarryover ||
      sameWords(translated, original) || numbers(translated) !== numbers(detail.a)) {
      skipped.push({ id: detail.id, locale: gameLocale, reason: !translated ? "Unsupported markup"
        : /\$[A-Za-z0-9{]/.test(translated) ? "Unresolved variable"
          : englishCarryover ? "English carryover"
            : sameWords(translated, original) ? "English fallback" : "Number mismatch" });
      continue;
    }
    const reviewedAura = reviewed.reviewedAuras?.[detail.a];
    if (reviewedAura?.ids.includes(detail.id) && reviewedAura.locales[gameLocale] &&
      reviewedAura.locales[gameLocale] !== translated) {
      throw new Error(`Reviewed aura disagrees with Wowhead: ${detail.id}/${gameLocale}`);
    }
    const reviewedSpell = reviewedSpells.spells[detail.id];
    if (reviewedSpell?.source === detail.a && reviewedSpell.locales[gameLocale] &&
      reviewedSpell.locales[gameLocale] !== translated) {
      throw new Error(`Reviewed aura spell disagrees with Wowhead: ${detail.id}/${gameLocale}`);
    }
    candidates.push({ id: detail.id, locale: gameLocale, source: detail.a,
      translation: translated, evidence: capture.url });
  }
}
const reviewedCount = candidates.filter((candidate) => {
  const record = reviewed.reviewedAuras?.[candidate.source];
  return (record?.ids.includes(candidate.id) &&
    record.locales[candidate.locale] === candidate.translation) ||
    reviewedSpells.spells[candidate.id]?.locales[candidate.locale] === candidate.translation;
}).length;
const report = { version: 1, reviewedCount, candidates, skipped };
await writeFile(join(directory, "wowhead-aura-candidates.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`${candidates.length} aura candidates; ${reviewedCount} reviewed; ${skipped.length} skipped.`);
