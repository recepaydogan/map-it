/** Find same-ID client translations hidden by a rendered level-30 note. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { matchLinkedSpellTemplate, renderResolvedSpellTemplate } from
  "./lib/match-client-spell-resolved.mjs";
import { hasEastAsianEnglishCarryover, numbers, sameWords } from
  "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const fallback = await read("data/site-research/client-wowhead-fallback.json");
const reviewed = await read("data/spell-tooltip-localization/reviewed-overrides.json");
const noteSource = reviewed.spells[417157];
if (!noteSource?.locales) throw new Error("Missing reviewed level-30 notes");

const notePattern = /\s*\(Numbers at level 30; they grow with your level\.\)\s*$/;
const candidates = [];
const skipped = [];
for (const record of fallback.records) {
  if (!notePattern.test(record.source)) continue;
  const body = record.source.replace(notePattern, "").trim();
  const values = record.clientEnglishTemplate &&
    matchLinkedSpellTemplate(record.clientEnglishTemplate, body);
  if (!values) {
    skipped.push({ id: record.id, reason: "Client English template differs from source" });
    continue;
  }
  for (const [locale, entry] of Object.entries(record.locales)) {
    if (reviewed.spells[record.id]?.locales[locale]) continue;
    if (!entry.differsFromEnglish) {
      skipped.push({ id: record.id, locale, reason: "English client fallback" });
      continue;
    }
    const note = noteSource.locales[locale]?.split("\n").at(-1);
    const translated = renderResolvedSpellTemplate(entry.template, values, locale, body);
    const leadingEnglish = body.replace(/\s+/gu, " ").split(" ").slice(0, 4).join(" ");
    if (!note || !translated || translated.includes("$") ||
      sameWords(translated, body) || hasEastAsianEnglishCarryover(translated, locale) ||
      (leadingEnglish.length >= 15 && translated.startsWith(leadingEnglish))) {
      skipped.push({ id: record.id, locale, reason: "Unusable client translation" });
      continue;
    }
    const translation = `${translated}\n${note}`;
    if (numbers(translation) !== numbers(record.source)) {
      skipped.push({ id: record.id, locale, reason: "Number mismatch" });
      continue;
    }
    candidates.push({ id: record.id, locale, source: record.source, translation,
      evidence: `installed-client:Spell:${record.id}` });
  }
}

const output = "data/site-research/client-level-note-candidates.json";
await writeFile(join(root, output), `${JSON.stringify({ version: 1,
  clientBuild: fallback.clientBuild, candidates, skipped }, null, 2)}\n`);
console.log(`${candidates.length} locale candidates across ` +
  `${new Set(candidates.map(({ id }) => id)).size} spell IDs; ${skipped.length} skipped.`);
