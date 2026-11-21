/** Catch missing guide fields and unlocalized English prose in staged guide locales. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const reviewedSharedHeadings = {
  de: { "leveling-priest/headings.3.title": "Mana", "leveling-shaman/headings.3.title": "Totems" },
  es: { "leveling-paladin/headings.7.title": "Auras" },
  "es-MX": { "leveling-paladin/headings.7.title": "Auras" },
  fr: { "leveling-paladin/headings.7.title": "Auras",
    "leveling-paladin/headings.16.title": "Protection",
    "leveling-priest/headings.3.title": "Mana",
    "leveling-rogue/headings.6.title": "Poisons",
    "leveling-shaman/headings.3.title": "Totems",
    "leveling-warlock/headings.14.title": "Destruction" },
  ko: {},
  "pt-BR": { "leveling-paladin/headings.7.title": "Auras",
    "leveling-priest/headings.3.title": "Mana" },
  "zh-Hans": {}, "zh-Hant": {},
};
const index = await read("public/data/guides/index.json");
const flatten = (value, prefix = "", result = new Map()) => {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result.set(path, child);
    else if (child && typeof child === "object") flatten(child, path, result);
  }
  return result;
};

let errors = 0;
for (const language of languages) {
  const summaryIndex = await read(`public/data/guides/locales/${language}/index.json`);
  const sourceIds = new Set(index.guides.map((guide) => guide.id));
  if (Object.keys(summaryIndex.summaries ?? {}).length !== sourceIds.size) {
    console.error(`${language}: guide summary count differs from English`);
    errors += 1;
  }
  let checked = 0;
  for (const guide of index.guides) {
    const local = await read(`public/data/guides/locales/${language}/${guide.id}.json`);
    const english = await read(`public/data/guides/${guide.id}.json`);
    const sourceFields = flatten(english);
    const targetFields = flatten(local);
    for (const [field, value] of sourceFields) {
      if (!targetFields.has(field)) {
        console.error(`${language}/${guide.id}/${field}: missing`);
        errors += 1;
      } else if (!/(^|\.)(id|group)$/.test(field) && /[a-z]{3,}/i.test(value) &&
        targetFields.get(field) === value &&
        reviewedSharedHeadings[language][`${guide.id}/${field}`] !== value) {
        console.error(`${language}/${guide.id}/${field}: unreviewed English copy`);
        errors += 1;
      }
      checked += 1;
    }
    const summary = summaryIndex.summaries?.[guide.id];
    if (!summary || summary.title !== local.title || summary.intro !== local.intro) {
      console.error(`${language}/${guide.id}: summary does not match the localized guide`);
      errors += 1;
    }
  }
  for (const id of Object.keys(summaryIndex.summaries ?? {})) {
    if (!sourceIds.has(id)) {
      console.error(`${language}/${id}: unexpected guide summary`);
      errors += 1;
    }
  }
  console.log(`${language}: ${index.guides.length} guides, ${checked} source text fields checked`);
}
if (errors) process.exitCode = 1;
else console.log("Guide fields and English-copy audit passed");
