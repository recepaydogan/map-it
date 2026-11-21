/** Add selected, source-matched Wowhead buff text to reviewed aura overrides. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const ids = process.argv.filter((argument) => /^\d+$/.test(argument)).map(Number);
if (!ids.length || new Set(ids).size !== ids.length) throw new Error("Pass unique aura spell IDs");
const exclusions = new Set((process.argv.find((argument) =>
  argument.startsWith("--exclude="))?.slice("--exclude=".length) ?? "")
  .split(",").filter(Boolean));
const apply = process.argv.includes("--apply");
const report = JSON.parse(await readFile(join(root,
  "data/site-research/wowhead-aura-candidates.json"), "utf8"));
const path = join(root, "data/spell-tooltip-localization/reviewed-aura-spells.json");
const reviewed = JSON.parse(await readFile(path, "utf8"));
if (report.version !== 1 || reviewed.version !== 1 || !reviewed.spells) {
  throw new Error("Invalid aura review data");
}
for (const id of ids) {
  const all = report.candidates.filter((candidate) => candidate.id === id);
  const candidates = all.filter((candidate) =>
    !exclusions.has(`${id}:${candidate.locale}`));
  if (!candidates.length || candidates.some((candidate) =>
    candidate.source !== candidates[0].source || !candidate.translation ||
    candidate.translation === candidate.source ||
    numbers(candidate.translation) !== numbers(candidate.source))) {
    throw new Error(`${id}: missing or inconsistent source-matched aura candidates`);
  }
  const source = candidates[0].source;
  const entry = reviewed.spells[id]?.source === source ? reviewed.spells[id] : { source, locales: {},
    evidence: `https://nether.wowhead.com/forever/tooltip/spell/${id}` };
  for (const candidate of candidates) {
    if (entry.locales[candidate.locale] &&
      entry.locales[candidate.locale] !== candidate.translation) {
      throw new Error(`${id}/${candidate.locale}: conflicting aura translation`);
    }
    entry.locales[candidate.locale] = candidate.translation;
  }
  reviewed.spells[id] = entry;
  console.log(`${id}: ${candidates.length} aura translations`);
}
if (apply) await writeFile(path, `${JSON.stringify(reviewed, null, 2)}\n`);
