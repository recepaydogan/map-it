/** Find same-ID client text where Wowhead has no usable locale candidate. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from
  "./lib/match-client-spell-resolved.mjs";
import { numbers, sameWords } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = join(root, "data/site-research");
const captures = (await readFile(join(directory,
  "client-spell-tooltip-captures.jsonl"), "utf8"))
  .split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const wowhead = JSON.parse(await readFile(join(directory,
  "wowhead-spell-candidates.json"), "utf8"));
const wowheadAuras = JSON.parse(await readFile(join(directory,
  "wowhead-aura-candidates.json"), "utf8"));
const reviewed = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/reviewed-overrides.json"), "utf8"));
const reviewedAuras = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/reviewed-aura-spells.json"), "utf8"));
const wowheadKeys = {
  d: new Set(wowhead.candidates.map((record) => `${record.id}:${record.locale}`)),
  a: new Set(wowheadAuras.candidates.map((record) => `${record.id}:${record.locale}`)),
};
const candidates = [];
const skipped = [];
for (const capture of captures) {
  for (const field of ["d", "a"]) {
    const source = capture.source[field];
    const english = capture.client.enUS?.[field];
    if (!source || !english || !capture.sourceMatch[field]) continue;
    const resolved = matchLinkedSpellTemplate(english, source);
    if (!resolved) continue;
    for (const [locale, missing] of Object.entries(capture.missing)) {
      if (!missing.includes(field) || wowheadKeys[field].has(`${capture.id}:${locale}`) ||
        (field === "d" && reviewed.spells[capture.id]?.locales[locale]) ||
        (field === "a" && reviewedAuras.spells[capture.id]?.locales[locale])) continue;
      const template = capture.client[locale]?.[field];
      const translated = template && renderResolvedSpellTemplate(template,
        resolved, locale, source);
      const leadingEnglish = source.replace(/\s+/gu, " ").split(" ").slice(0, 4).join(" ");
      const englishCarryover = leadingEnglish.length >= 15 &&
        translated?.replace(/\s+/gu, " ").startsWith(leadingEnglish);
      if (!translated || /\$[A-Za-z0-9{]/.test(translated) ||
        sameWords(template, english) || englishCarryover ||
        sameWords(translated, source) || numbers(translated) !== numbers(source)) {
        skipped.push({ id: capture.id, field, locale,
          reason: !template ? "Missing client description" :
            !translated ? "Could not resolve client template" :
              sameWords(template, english) || englishCarryover ||
                sameWords(translated, source) ? "English fallback" : "Number mismatch" });
        continue;
      }
      candidates.push({ id: capture.id, field, locale, source, translation: translated,
        evidence: `installed-client:Spell:${capture.id}` });
    }
  }
}
const report = { version: 1, captured: captures.length, candidates, skipped };
await writeFile(join(directory, "client-spell-tooltip-candidates.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`${captures.length} client spell records; ${candidates.length} source-matched fallback candidates; ${skipped.length} skipped.`);
for (const field of ["d", "a"]) console.log(`${field}: ${candidates.filter((record) => record.field === field).length} candidates`);
