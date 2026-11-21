/** Apply exact reviewed client objective quantity corrections to locale packs. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { correctReviewedQuestObjectiveCounts } from "./lib/reviewed-quest-objective-counts.mjs";

const directory = new URL("../public/data/locales/wow-forever/", import.meta.url);
const source = JSON.parse(await readFile(new URL("quest-text-source.json", directory), "utf8"));
const index = new Map(source.keys.map((key, position) => [key, position]));
const rules = JSON.parse(await readFile(new URL(
  "../data/quest-text-localization/reviewed-objective-number-corrections.json",
  import.meta.url), "utf8"));
let corrected = 0;
for (const locale of new Set(rules.fields.map((rule) => rule.locale))) {
  const path = new URL(`quest-text-${locale}.json`, directory);
  const pack = JSON.parse(await readFile(path, "utf8"));
  let localeCorrected = 0;
  for (const rule of rules.fields.filter((entry) => entry.locale === locale)) {
    const position = index.get(`${rule.id}:objective`);
    if (position === undefined || !pack.values[position]) {
      throw new Error(`Missing client objective: ${rule.id}/${locale}`);
    }
    if (createHash("sha256").update(source.values[position]).digest("hex") !==
      rule.englishSha256) throw new Error(`Changed English objective: ${rule.id}`);
    const before = pack.values[position];
    const after = correctReviewedQuestObjectiveCounts(rule.id, locale,
      source.values[position], before);
    if (after !== before) { pack.values[position] = after; corrected++; localeCorrected++; }
    else if ((before.match(/\d+(?:[.,]\d+)?/g) ?? []).join("|") !==
      rule.to.join("|")) throw new Error(`Unreviewed objective counts: ${rule.id}/${locale}`);
  }
  if (!process.argv.includes("--check")) await writeFile(path, JSON.stringify(pack));
  else if (localeCorrected) throw new Error(`${locale} client objective counts are stale`);
}
console.log(`${corrected} reviewed client objective counts corrected`);
