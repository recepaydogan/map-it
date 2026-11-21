/** Add reviewed, same-ID Wowhead quest objectives missed by tooltip capture. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (name) => JSON.parse(await readFile(join(root, name), "utf8"));
const review = await read("data/quest-text-localization/reviewed-wowhead-objective-pages.json");
const quests = (await read("public/data/quests/quest-details.json")).quests;
const localePaths = { frFR: "fr", koKR: "ko" };
const reviewedNumbers = {
  "8587:koKR": { source: ["500"], localized: ["250"] },
  "8620:koKR": { source: ["8"], localized: ["2"] },
};
const numericSequence = (value) => value.normalize("NFKC")
  .match(/\d+(?:[.,]\d+)?/g) ?? [];
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

if (review.version !== 1 || !Array.isArray(review.entries) ||
  new Set(review.entries.map(({ id, locale }) => `${id}:${locale}`)).size !==
    review.entries.length) throw new Error("Invalid reviewed Wowhead objective pages");

for (const locale of Object.keys(localePaths)) {
  const filename = `public/data/locales/wow-forever/quest-objective-wowhead-${locale}.json`;
  const pack = await read(filename);
  if (pack.version !== 1 || !pack.quests) throw new Error(`Invalid ${locale} objective pack`);
  const before = JSON.stringify(pack);
  let applied = 0;
  for (const entry of review.entries.filter((record) => record.locale === locale)) {
    const key = `${entry.id}:${locale}`;
    const exception = reviewedNumbers[key];
    if (!/^\d+$/.test(entry.id) || quests[entry.id]?.objective !== entry.english ||
      entry.sourceUrl !== `https://www.wowhead.com/forever/quest=${entry.id}` ||
      entry.localeUrl !==
        `https://www.wowhead.com/forever/${localePaths[locale]}/quest=${entry.id}` ||
      typeof entry.localized !== "string" || !entry.localized.trim() ||
      entry.localized === entry.english || /\$[A-Za-z]/.test(entry.localized) ||
      !same(numericSequence(entry.english), entry.sourceNumbers) ||
      !same(numericSequence(entry.localized), entry.localizedNumbers) ||
      (!same(entry.sourceNumbers, entry.localizedNumbers) &&
        (!exception || !same(entry.sourceNumbers, exception.source) ||
          !same(entry.localizedNumbers, exception.localized) ||
          !entry.numericReview?.trim())) ||
      (same(entry.sourceNumbers, entry.localizedNumbers) && entry.numericReview)) {
      throw new Error(`Unverified Wowhead objective: ${key}`);
    }
    const previous = pack.quests[entry.id];
    if (previous && (previous.sourceUrl !== entry.sourceUrl ||
      previous.english?.objective && previous.english.objective !== entry.english ||
      previous.locales?.[locale]?.objective &&
        previous.locales[locale].objective !== entry.localized)) {
      throw new Error(`Conflicting Wowhead objective: ${key}`);
    }
    pack.quests[entry.id] = {
      ...previous,
      sourceUrl: entry.sourceUrl,
      localeUrls: { ...previous?.localeUrls, [locale]: entry.localeUrl },
      pageUrls: { ...previous?.pageUrls, en: entry.sourceUrl,
        [locale]: entry.localeUrl },
      english: { ...previous?.english, objective: entry.english },
      locales: { ...previous?.locales,
        [locale]: { ...previous?.locales?.[locale], objective: entry.localized } },
      ...(entry.numericReview ? { reviewedNumericDifference: entry.numericReview } : {}),
    };
    applied++;
  }
  const after = JSON.stringify(pack);
  if (process.argv.includes("--check")) {
    if (before !== after) throw new Error(`${locale} reviewed objective pages not applied`);
  } else if (before !== after) {
    await writeFile(join(root, filename), after);
  }
  console.log(`${locale}: ${applied} reviewed Wowhead page objectives`);
}
