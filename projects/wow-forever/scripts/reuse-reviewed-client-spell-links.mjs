/** Reuse reviewed descriptions only for exact installed-client spell links. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const path = join(root, "data/spell-tooltip-localization/reviewed-overrides.json");
const apply = process.argv.length === 3 && process.argv[2] === "--apply";
if (process.argv.length > (apply ? 3 : 2)) throw new Error("Use --apply or no arguments");
const reviewed = JSON.parse(await readFile(path, "utf8"));
const fallback = JSON.parse(await readFile(join(root,
  "data/site-research/client-wowhead-fallback.json"), "utf8"));
const normalize = (value) => value.replace(/\s+/gu, " ").trim();
const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const added = [];

for (const record of fallback.records) {
  if (reviewed.spells[record.id]) continue;
  const english = record.clientEnglishTemplate ?? "";
  const links = [...english.matchAll(/\$@spelldesc(\d+)/g)];
  if (links.length !== 1) continue;
  const baseId = links[0][1];
  const base = reviewed.spells[baseId];
  const link = `$@spelldesc${baseId}`;
  if (!base?.source || !english.trim().endsWith(link)) continue;
  const normalizedSource = normalize(record.source);
  const normalizedBase = normalize(base.source);
  if (!normalizedSource.endsWith(normalizedBase)) continue;
  const split = english.search(/\$@spell(?:icon|desc)/);
  if (split < 0) continue;
  const englishPrefix = normalize(english.slice(0, split));
  const sourcePrefix = normalizedSource.slice(0, -normalizedBase.length).trim();
  if (englishPrefix !== sourcePrefix) continue;

  const translations = {};
  for (const locale of locales) {
    const entry = record.locales[locale];
    const template = entry?.template ?? "";
    const headingEnd = template.search(/\$@spell(?:icon|desc)/);
    if (!base.locales?.[locale] || headingEnd < 0 ||
      !template.trim().endsWith(link) ||
      (englishPrefix && !entry.differsFromEnglish)) break;
    const heading = normalize(template.slice(0, headingEnd));
    if (heading.includes("$") || (!!heading !== !!englishPrefix)) break;
    const translation = heading ? `${heading}\n\n\n${base.locales[locale]}` :
      base.locales[locale];
    if (translation.includes("$") || numbers(translation) !== numbers(record.source)) break;
    translations[locale] = translation;
  }
  if (Object.keys(translations).length !== locales.length) continue;
  reviewed.spells[record.id] = { source: record.source, locales: translations,
    evidence: `https://nether.wowhead.com/forever/tooltip/spell/${record.id}`,
    correctionBasis: Object.fromEntries(locales.map((locale) => [locale,
      `Installed-client template links directly to reviewed spell ${baseId}; ` +
      "English heading and description match the ForeverDB source after whitespace normalization."])) };
  added.push({ id: record.id, baseId: Number(baseId) });
}

if (apply && added.length) await writeFile(path, `${JSON.stringify(reviewed, null, 2)}\n`);
console.log(`${apply ? "Added" : "Eligible"} ${added.length} spell IDs / ` +
  `${added.length * locales.length} locale records.`);
if (!apply) console.log(`IDs: ${added.map(({ id }) => id).join(", ")}`);
