/** Add explicitly selected, source-matched Wowhead spell descriptions to review data. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ids = process.argv.filter((arg) => /^\d+$/.test(arg)).map(Number);
if (!ids.length || new Set(ids).size !== ids.length) {
  throw new Error("Pass unique spell IDs to review");
}
const apply = process.argv.includes("--apply");
const classic = process.argv.includes("--classic");
const direct = process.argv.includes("--direct");
if (classic && direct) throw new Error("--direct is only for Forever spell descriptions");
const exclusions = new Set((process.argv.find((argument) =>
  argument.startsWith("--exclude="))?.slice("--exclude=".length) ?? "")
  .split(",").filter(Boolean));
const report = JSON.parse(await readFile(join(root,
  classic ? "data/site-research/wowhead-classic-spell-candidates.json" :
    "data/site-research/wowhead-spell-candidates.json"), "utf8"));
const path = join(root, "data/spell-tooltip-localization",
  classic ? "reviewed-classic-overrides.json" : "reviewed-overrides.json");
const original = await readFile(path, "utf8");
const reviewed = JSON.parse(original);
const selected = {};
for (const id of ids) {
  if (!direct && reviewed.spells[id]) throw new Error(`${id}: already reviewed`);
  const candidates = report.candidates.filter((record) => record.id === id &&
    !exclusions.has(`${id}:${record.locale}`));
  if (!candidates.length || candidates.some((record) =>
    record.source !== candidates[0].source ||
    !record.translation || record.translation === record.source ||
    numbers(record.translation) !== numbers(record.source))) {
    throw new Error(`${id}: missing or inconsistent source-matched candidates`);
  }
  selected[id] = {
    source: candidates[0].source,
    locales: Object.fromEntries(candidates.map((record) =>
      [record.locale, record.translation])),
    evidence: `https://nether.wowhead.com/${classic ? "classic" : "forever"}/tooltip/spell/${id}`,
  };
  console.log(`${id}: ${candidates.length} locale translations`);
}
if (apply) {
  if (direct) {
    const directPath = join(root, "data/spell-tooltip-localization/wowhead-direct-review.json");
    const directReview = JSON.parse(await readFile(directPath, "utf8"));
    const existing = new Map(directReview.translations.map((record) =>
      [`${record.id}:${record.field}:${record.locale}`, record]));
    for (const id of ids) for (const candidate of report.candidates.filter((record) =>
      record.id === id && !exclusions.has(`${id}:${record.locale}`))) {
      const key = `${id}:d:${candidate.locale}`;
      const prior = existing.get(key);
      if (prior && (prior.source !== candidate.source ||
        prior.translation !== candidate.translation)) {
        throw new Error(`${key}: conflicting direct Wowhead translation`);
      }
      if (!prior) directReview.translations.push({ ...candidate, field: "d",
        wowheadEnglish: candidate.source, numericDifference: false,
        englishSourceDifference: false });
    }
    await writeFile(directPath, `${JSON.stringify(directReview, null, 2)}\n`);
    process.exit(0);
  }
  const anchor = '  "spells": {\n';
  let updated;
  if (original.includes(anchor)) {
    const additions = Object.entries(selected).map(([id, record]) =>
      `    "${id}": ${JSON.stringify(record, null, 2).replace(/\n/g, "\n    ")},\n`).join("");
    updated = original.replace(anchor, anchor + additions);
  } else if (Object.keys(reviewed.spells).length === 0) {
    updated = `${JSON.stringify({ version: 1, spells: selected }, null, 2)}\n`;
  } else throw new Error("Reviewed spell catalog structure changed");
  JSON.parse(updated);
  await writeFile(path, updated);
}
