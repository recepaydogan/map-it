/** Group captured Wowhead spell names without inventing missing translations. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => readFile(join(root, path), "utf8");
const source = JSON.parse(await read("public/data/locales/wow-forever/source.json"));
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const packs = Object.fromEntries(await Promise.all(Object.entries(locales).map(
  async ([short, locale]) => [short,
    JSON.parse(await read(`public/data/locales/wow-forever/${locale}.json`))])));
const captures = new Map();
for (const line of (await read("data/site-research/wowhead-locale-captures.jsonl"))
  .split(/\r?\n/)) {
  if (!line) continue;
  const record = JSON.parse(line);
  if (record.kind === "spell") captures.set(`${record.id}:${record.locale}`, record);
}
const counts = { ids: 0, translated: 0, unchanged: 0,
  missing: 0, englishSourceMismatch: 0, byLocale: {} };
const candidates = [];
for (let index = 0; index < source.keys.length; index++) {
  const match = /^SpellName:(\d+):0$/.exec(source.keys[index]);
  if (!match) continue;
  const id = Number(match[1]);
  const needed = Object.entries(locales).filter(([short]) =>
    !packs[short].values[index] ||
    packs[short].values[index] === source.values[index]);
  if (!needed.length) continue;
  const english = captures.get(`${id}:en`);
  const localized = needed.flatMap(([short, locale]) => {
    const record = captures.get(`${id}:${short}`);
    return record ? [[locale, record]] : [];
  });
  if (!english && !localized.length) continue;
  counts.ids++;
  const sourceName = source.values[index];
  const sourceMatches = english?.name === sourceName;
  if (english && !sourceMatches) counts.englishSourceMismatch++;
  const names = {};
  const evidence = {};
  for (const [locale, record] of localized) {
    const status = !english ? "missing" :
      record.name === english.name ? "unchanged" : "translated";
    names[locale] = { value: record.name, status };
    evidence[locale] = record.url;
    counts[status]++;
    const tally = counts.byLocale[locale] ??
      { translated: 0, unchanged: 0, missing: 0 };
    tally[status]++;
    counts.byLocale[locale] = tally;
  }
  candidates.push({ id, source: sourceName,
    wowheadEnglish: english?.name ?? null, sourceMatches: Boolean(sourceMatches),
    names, evidence });
}
await writeFile(join(root, "data/site-research/wowhead-spell-name-candidates.json"),
  `${JSON.stringify({ version: 1, counts, candidates }, null, 2)}\n`);
console.log(JSON.stringify(counts));
