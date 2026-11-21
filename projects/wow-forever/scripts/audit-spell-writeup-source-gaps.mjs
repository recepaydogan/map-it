/** Report spell guide source prose absent from the current locale packs. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const reviewed = (await read("data/spell-writeup-localization/reviewed-prose.json")).entries;
const sourceStrings = (await read("public/data/spells/writeups/locales/source.json")).strings;
const sourceIndex = new Map(sourceStrings.map((text, index) => [text, index]));
const localeCodes = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const writeupPacks = Object.fromEntries(await Promise.all(localeCodes.map(async (locale) =>
  [locale, await read(`public/data/spells/writeups/locales/${locale}.json`)])));
const isMissing = (text, locale) => {
  const index = sourceIndex.get(text);
  return index === undefined || !writeupPacks[locale].values[index] ||
    writeupPacks[locale].values[index] === text;
};
const fields = { summary: new Set(), forever: new Set(), details: new Set(),
  useWhen: new Set(), avoidWhen: new Set() };
for (const id of ["druid", "hunter", "mage", "paladin", "priest", "rogue",
  "shaman", "warlock", "warrior"]) {
  const writeups = await read(`public/data/spells/writeups/${id}.json`);
  for (const entry of [...Object.values(writeups.abilities ?? {}),
    ...Object.values(writeups.talents ?? {})]) {
    if (entry.summary) fields.summary.add(entry.summary);
    if (entry.forever) fields.forever.add(entry.forever);
    for (const value of entry.details ?? []) fields.details.add(value);
    for (const value of entry.useWhen ?? []) fields.useWhen.add(value);
    for (const value of entry.avoidWhen ?? []) fields.avoidWhen.add(value);
  }
}
const normalize = (text) => text.normalize("NFKC").replace(/\s+/g, " ")
  .replace(/[’]/g, "'").trim();
const reviewedByNormalized = new Map(reviewed.map((entry) => [normalize(entry.en), entry]));
const missing = new Set(Object.values(fields).flatMap((entries) =>
  [...entries].filter((text) => localeCodes.some((locale) => isMissing(text, locale)))));
const gameLocales = ["deDE", "esES", "esMX", "frFR", "koKR", "ptBR", "zhCN", "zhTW"];
const spellPacks = Object.fromEntries(await Promise.all(gameLocales.map(async (locale) =>
  [locale, await read(`public/data/locales/wow-forever/spell-tooltip-${locale}.json`)])));
const idsByText = new Map();
for (let shard = 0; shard < 64; shard++) {
  const details = await read(`public/data/spells/foreverdb/${shard}.json`);
  for (const [id, detail] of Object.entries(details)) {
    for (const field of ["d", "a", "old"]) {
      if (!detail[field]) continue;
      const ids = idsByText.get(detail[field]) ?? [];
      ids.push([id, field]);
      idsByText.set(detail[field], ids);
    }
  }
}
const numeric = (text) => (text.match(/\d+(?:[.,]\d+)?/g) ?? [])
  .map((value) => value.replace(",", ".")).sort().join("|");
let exactSpell = 0;
let allLocalized = 0;
let numericSafe = 0;
const gameSource = await read("public/data/locales/wow-forever/source.json");
const gamePacks = Object.fromEntries(await Promise.all(gameLocales.map(async (locale) =>
  [locale, await read(`public/data/locales/wow-forever/${locale}.json`)])));
const indicesByText = new Map();
for (const [index, text] of gameSource.values.entries()) {
  const indices = indicesByText.get(text) ?? [];
  indices.push(index);
  indicesByText.set(text, indices);
}
let exactClient = 0;
let clientAllLocalized = 0;
let clientNumericSafe = 0;
for (const text of missing) {
  const matches = idsByText.get(text) ?? [];
  if (matches.length) {
    exactSpell++;
    const values = gameLocales.map((locale) => [...new Set(matches.map(([id, field]) =>
      spellPacks[locale].entries[id]?.[field]).filter(Boolean))]);
    if (values.every((group) => group.length === 1)) {
      allLocalized++;
      if (values.every(([value]) => numeric(value) === numeric(text) && value !== text)) numericSafe++;
    }
  }
  const indices = indicesByText.get(text) ?? [];
  if (!indices.length) continue;
  exactClient++;
  const values = gameLocales.map((locale) => [...new Set(indices.map((index) =>
    gamePacks[locale].values[index]).filter(Boolean))]);
  if (values.some((group) => group.length !== 1)) continue;
  clientAllLocalized++;
  if (values.every(([value]) => numeric(value) === numeric(text) && value !== text)) clientNumericSafe++;
}
for (const [field, entries] of Object.entries(fields)) {
  console.log(`${field}: ${[...entries].filter((text) => missing.has(text)).length} ` +
    `missing in at least one locale`);
}
for (const locale of localeCodes) {
  console.log(`${locale}: ${[...missing].filter((text) => isMissing(text, locale)).length} ` +
    `English fallbacks`);
}
console.log(`${missing.size} distinct missing; ${[...missing].filter((text) =>
  reviewedByNormalized.has(normalize(text))).length} normalized reviewed matches`);
console.log(`${exactSpell} exact spell texts; ${allLocalized} have one value in every locale; ${numericSafe} are numeric-safe`);
console.log(`${exactClient} exact client texts; ${clientAllLocalized} have one value in every locale; ${clientNumericSafe} are numeric-safe`);
if (process.argv.includes("--samples")) {
  for (const text of [...missing].slice(0, 12)) console.log(`  ${text}`);
}
