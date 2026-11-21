/** Reuse localized base spell text for exact installed-client spell links. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => readFile(join(root, path), "utf8");
const apply = process.argv.length === 3 && process.argv[2] === "--apply";
if (process.argv.length > (apply ? 3 : 2)) {
  throw new Error("Use --apply or no arguments");
}

const locales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const normalize = (value) => value.replace(/\s+/gu, " ").trim();
const fallback = JSON.parse(await read("data/site-research/client-wowhead-fallback.json"));
const reviewed = JSON.parse(await read("data/spell-tooltip-localization/reviewed-overrides.json"));
const details = new Map((await Promise.all(Array.from({ length: 64 }, async (_, shard) =>
  Object.values(JSON.parse(await read(`public/data/spells/foreverdb/${shard}.json`))))))
  .flat().map((detail) => [detail.id, detail]));
const packs = Object.fromEntries(await Promise.all(locales.map(async (locale) =>
  [locale, JSON.parse(await read(
    `public/data/locales/wow-forever/spell-tooltip-${locale}.json`)).entries])));

const added = [];
for (const record of fallback.records) {
  if (reviewed.spells[record.id]) continue;
  const english = record.clientEnglishTemplate ?? "";
  const links = [...english.matchAll(/\$@spelldesc(\d+)/g)];
  if (links.length !== 1) continue;
  const baseId = Number(links[0][1]);
  const base = details.get(baseId);
  const link = `$@spelldesc${baseId}`;
  if (!base?.d || !english.trim().endsWith(link)) continue;
  const source = normalize(record.source);
  const baseSource = normalize(base.d);
  if (!source.endsWith(baseSource)) continue;
  const split = english.search(/\$@spell(?:icon|desc)/);
  if (split < 0) continue;
  const englishHeading = normalize(english.slice(0, split));
  if (englishHeading !== source.slice(0, -baseSource.length).trim()) continue;

  const translated = {};
  for (const locale of locales) {
    const entry = record.locales[locale];
    const template = entry?.template ?? "";
    const headingEnd = template.search(/\$@spell(?:icon|desc)/);
    const body = packs[locale]?.[baseId]?.d;
    if (!body || body.includes("$") ||
      numbers(body) !== numbers(base.d) ||
      hasEastAsianEnglishCarryover(body, locale) ||
      headingEnd < 0 || !template.trim().endsWith(link)) break;
    const heading = normalize(template.slice(0, headingEnd));
    if (heading.includes("$") || (!!heading !== !!englishHeading) ||
      (englishHeading && heading === englishHeading)) break;
    const value = heading ? `${heading}\n\n\n${body}` : body;
    if (value.includes("$") || numbers(value) !== numbers(record.source) ||
      hasEastAsianEnglishCarryover(value, locale)) break;
    translated[locale] = value;
  }
  if (Object.keys(translated).length !== locales.length) continue;
  reviewed.spells[record.id] = { source: record.source, locales: translated,
    evidence: `linked-localized-spell-pack:Spell:${baseId}`,
    correctionBasis: Object.fromEntries(locales.map((locale) =>
      [locale, `Exact installed-client link to spell ${baseId}; English heading and ` +
        "description match the ForeverDB source, and the localized base description " +
        "matches its numeric values."])) };
  added.push({ id: record.id, baseId });
}

if (apply && added.length) {
  await writeFile(join(root, "data/spell-tooltip-localization/reviewed-overrides.json"),
    `${JSON.stringify(reviewed, null, 2)}\n`);
}
console.log(`${apply ? "Added" : "Eligible"} ${added.length} spell IDs / ` +
  `${added.length * locales.length} locale records.`);
console.log(`IDs: ${added.map(({ id }) => id).join(", ")}`);
