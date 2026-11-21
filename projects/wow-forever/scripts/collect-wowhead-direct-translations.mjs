/** Collect available Wowhead text for every unresolved spell locale in one pass. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { aura, description, numbers, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => readFile(join(root, path), "utf8");
const localeCodes = {
  deDE: "de", esES: "es", esMX: "mx", frFR: "fr",
  koKR: "ko", ptBR: "pt", zhCN: "cn", zhTW: "tw",
};
const fields = ["d", "a", "old"];
const gaps = JSON.parse(await read("data/site-research/spell-tooltip-post-review-gaps.json"));
const items = JSON.parse(await read("data/site-research/wowhead-item-name-candidates.json"));
const shards = await Promise.all(Array.from({ length: 64 }, (_, shard) =>
  read(`public/data/spells/foreverdb/${shard}.json`).then(JSON.parse)));
const captured = async (path) => {
  const records = new Map();
  for (const line of (await read(path)).split(/\r?\n/)) {
    if (!line) continue;
    const record = JSON.parse(line);
    if (record.kind === "spell" || path.includes("classic")) {
      records.set(`${record.id}:${record.locale}`, record);
    }
  }
  return records;
};
const [forever, classic] = await Promise.all([
  captured("data/site-research/wowhead-locale-captures.jsonl"),
  captured("data/site-research/wowhead-classic-locale-captures.jsonl"),
]);
const translations = [];
const missing = [];
const summary = { version: 1, locales: {}, totals: {
  spellGaps: 0, wowheadTranslated: 0, wowheadEnglishFallback: 0,
  wowheadMissing: 0, numericDifferences: 0, englishSourceDifferences: 0,
  rankGaps: 0,
}, itemNames: {
  candidateIds: items.candidates.length,
  translatedLocales: items.counts.translated,
  englishFallbackLocales: items.counts.englishFallback,
  unavailableLocales: items.counts.unavailableLocale,
  pendingLocales: items.counts.pendingLocale,
  byLocale: Object.fromEntries(Object.keys(localeCodes).map((locale) => [locale,
    items.candidates.filter((candidate) => candidate.translations?.[locale]).length])),
  candidateFile: "data/site-research/wowhead-item-name-candidates.json",
} };
for (const [locale, fieldsMissing] of Object.entries(gaps.locales)) {
  const short = localeCodes[locale];
  if (!short) throw new Error(`Unexpected locale: ${locale}`);
  const counts = { rankGaps: fieldsMissing.r.length };
  summary.totals.rankGaps += counts.rankGaps;
  for (const field of fields) {
    const records = field === "old" ? classic : forever;
    const text = field === "a" ? aura : description;
    const tally = { gaps: 0, wowheadTranslated: 0, wowheadEnglishFallback: 0,
      wowheadMissing: 0, numericDifferences: 0, englishSourceDifferences: 0 };
    for (const id of fieldsMissing[field]) {
      const source = shards[id % 64][id]?.[field];
      if (!source) throw new Error(`Missing spell source: ${id}/${field}`);
      tally.gaps++;
      summary.totals.spellGaps++;
      const capture = records.get(`${id}:${short}`);
      const english = records.get(`${id}:en`);
      const value = capture && text(capture);
      const original = english && text(english);
      if (!value) {
        tally.wowheadMissing++;
        summary.totals.wowheadMissing++;
        missing.push({ id, field, locale, source, reason: "no-readable-wowhead-text" });
      } else if (original && sameWords(value, original)) {
        tally.wowheadEnglishFallback++;
        summary.totals.wowheadEnglishFallback++;
        missing.push({ id, field, locale, source, reason: "wowhead-english-fallback" });
      } else {
        const numericDifference = numbers(value) !== numbers(source);
        const englishSourceDifference = !original || !sameWords(original, source);
        tally.wowheadTranslated++;
        summary.totals.wowheadTranslated++;
        if (numericDifference) {
          tally.numericDifferences++;
          summary.totals.numericDifferences++;
        }
        if (englishSourceDifference) {
          tally.englishSourceDifferences++;
          summary.totals.englishSourceDifferences++;
        }
        translations.push({ id, field, locale, source, wowheadEnglish: original,
          translation: value, evidence: capture.url,
          numericDifference, englishSourceDifference });
      }
    }
    counts[field] = tally;
  }
  summary.locales[locale] = counts;
}
const output = {
  version: 1,
  source: "Wowhead batch tooltip captures; client locale fallback not applied",
  translations,
  missing,
  summary,
};
await writeFile(join(root,
  "data/spell-tooltip-localization/wowhead-direct-review.json"),
`${JSON.stringify(output, null, 2)}\n`);
const rows = Object.entries(summary.locales).map(([locale, counts]) => {
  const translated = fields.reduce((total, field) => total + counts[field].wowheadTranslated, 0);
  const fallback = fields.reduce((total, field) => total + counts[field].wowheadEnglishFallback, 0);
  const absent = fields.reduce((total, field) => total + counts[field].wowheadMissing, 0);
  return `| ${locale} | ${translated} | ${fallback} | ${absent} | ${counts.rankGaps} | ${summary.itemNames.byLocale[locale]} |`;
});
const report = [
  "# Wowhead direct translation batch report",
  "",
  "Scope: the remaining spell tooltip gaps in `spell-tooltip-post-review-gaps.json`,",
  "plus the already captured item name candidates. This is a review corpus;",
  "it does not modify application locale packs.",
  "",
  "| Locale | Spell texts found | English fallback | No readable text | Rank gaps | Item names found |",
  "| --- | ---: | ---: | ---: | ---: | ---: |",
  ...rows,
  "",
  `Spell texts: ${summary.totals.wowheadTranslated} localized, ${summary.totals.wowheadEnglishFallback} English fallbacks, ${summary.totals.wowheadMissing} with no readable Wowhead text.`,
  `Rank labels: ${summary.totals.rankGaps} gaps were not included in the existing bulk fetch.`,
  `Item names: ${summary.itemNames.translatedLocales} localized entries across ${summary.itemNames.candidateIds} IDs; ${summary.itemNames.englishFallbackLocales} English fallbacks and ${summary.itemNames.unavailableLocales} unavailable locales.`,
  `Among the ${summary.totals.wowheadTranslated} spell texts, ${summary.totals.numericDifferences} have numbers differing from ForeverDB and ${summary.totals.englishSourceDifferences} have English source text differing from ForeverDB. These are flags, not automatic corrections.`,
  "",
  "Detailed records: `data/spell-tooltip-localization/wowhead-direct-review.json` and `data/site-research/wowhead-item-name-candidates.json`.",
  "",
].join("\n");
await writeFile(join(root, "data/site-research/wowhead-direct-gap-report.md"), report);
console.log(JSON.stringify(summary.totals));
