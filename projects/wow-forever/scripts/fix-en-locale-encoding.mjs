/** Repair UTF-8 punctuation that was decoded as Windows-1252 in English UI copy. */
import { readFile, writeFile } from "node:fs/promises";

const path = new URL("../src/i18n/locales/en.json", import.meta.url);
const replacements = new Map([
  ["â€¦", "…"], ["â€”", "—"], ["â€™", "’"], ["â€“", "–"],
  ["â†’", "→"], ["âˆ’", "−"], ["â‰ˆ", "≈"], ["Â·", "·"], ["Ã—", "×"],
]);
const original = await readFile(path, "utf8");
let repaired = original;
for (const [bad, good] of replacements) repaired = repaired.replaceAll(bad, good);
JSON.parse(repaired);
if (/[âÂÃ]/u.test(repaired)) throw new Error("Unreviewed English locale encoding remains");
if (process.argv.includes("--check")) {
  if (repaired !== original) throw new Error("English locale encoding has not been repaired");
} else if (repaired !== original) {
  await writeFile(path, repaired);
}
console.log(repaired === original ? "English locale encoding is clean" : "English locale encoding repaired");
