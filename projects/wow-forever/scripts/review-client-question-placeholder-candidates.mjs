/** Find installed-client translations for ForeverDB spell texts with unresolved ? values. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from
  "./lib/match-client-spell-resolved.mjs";
import { hasEastAsianEnglishCarryover, numbers, sameWords } from
  "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const fallback = JSON.parse(await readFile(join(root,
  "data/site-research/client-wowhead-fallback.json"), "utf8"));
const reviewed = JSON.parse(await readFile(join(root,
  "data/spell-tooltip-localization/reviewed-overrides.json"), "utf8"));
const marker = "999991";
const candidates = [];
const skipped = [];

for (const record of fallback.records) {
  if (!record.source.includes("?") || !record.clientEnglishTemplate ||
    record.source.includes(marker)) continue;
  const sourceWithMarker = record.source.replace(/\?/g, marker);
  const values = matchLinkedSpellTemplate(record.clientEnglishTemplate,
    sourceWithMarker);
  if (!values) {
    skipped.push({ id: record.id, reason: "English client template differs from source" });
    continue;
  }
  for (const [locale, entry] of Object.entries(record.locales)) {
    if (reviewed.spells[record.id]?.locales[locale] ||
      !entry.differsFromEnglish || !entry.sameVariableSignature) continue;
    const rendered = renderResolvedSpellTemplate(entry.template, values,
      locale, sourceWithMarker);
    if (!rendered) {
      skipped.push({ id: record.id, locale, reason: "Could not render localized client template" });
      continue;
    }
    const translation = rendered.replaceAll(marker, "?");
    if (sameWords(translation, record.source) ||
      numbers(translation) !== numbers(record.source) ||
      /\$[A-Za-z0-9{]/.test(translation) ||
      hasEastAsianEnglishCarryover(translation, locale)) {
      skipped.push({ id: record.id, locale, reason: "Unresolved or mismatched translation" });
      continue;
    }
    candidates.push({ id: record.id, locale, source: record.source,
      translation, evidence: `installed-client:Spell:${record.id}`,
      reason: record.reasons[locale] });
  }
}

const report = { version: 1, clientBuild: fallback.clientBuild,
  sourceReport: "client-wowhead-fallback.json", candidates, skipped };
await writeFile(join(root,
  "data/site-research/client-question-placeholder-candidates.json"),
`${JSON.stringify(report, null, 2)}\n`);
console.log(`${candidates.length} locale candidates across ` +
  `${new Set(candidates.map((record) => record.id)).size} spell IDs; ` +
  `${skipped.length} skipped.`);
