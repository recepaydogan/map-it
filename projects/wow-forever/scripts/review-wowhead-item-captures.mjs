/** Summarize source-matched item names captured from Wowhead for manual review. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => readFile(join(root, path), "utf8");
const catalog = JSON.parse(await read("public/data/items/catalog.json"));
const source = JSON.parse(await read("public/data/locales/wow-forever/source.json"));
const sourceIndex = new Map(source.keys.map((key, index) => [key, index]));
const aliases = JSON.parse(await read("data/item-name-localization/reviewed-wowhead-source-aliases.json"));
if (aliases.version !== 1 || !aliases.items) throw new Error("Invalid item source aliases");
const locales = { de: "deDE", es: "esES", mx: "esMX", fr: "frFR",
  ko: "koKR", pt: "ptBR", cn: "zhCN", tw: "zhTW" };
const packs = Object.fromEntries(await Promise.all(Object.entries(locales).map(
  async ([locale, gameLocale]) => [locale, JSON.parse(await read(
    `public/data/locales/wow-forever/${gameLocale}.json`))])));
const captures = new Map((await read("data/site-research/wowhead-item-locale-captures.jsonl"))
  .split(/\r?\n/).filter(Boolean).map((line) => {
    const record = JSON.parse(line);
    return [`${record.locale}:${record.id}`, record];
  }));
let classicText = "";
try {
  classicText = await read("data/site-research/wowhead-classic-item-fallbacks.jsonl");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const classicCaptures = new Map(classicText.split(/\r?\n/).filter(Boolean).map((line) => {
  const record = JSON.parse(line);
  return [`${record.locale}:${record.id}`, record];
}));
const unavailable = JSON.parse(await read("data/site-research/wowhead-item-unavailable.json"));
if (unavailable.version !== 1 || !unavailable.entries) {
  throw new Error("Invalid unavailable item catalog");
}
const sameName = (left, right) =>
  left.normalize("NFKC").toLocaleLowerCase("en-US") ===
  right.normalize("NFKC").toLocaleLowerCase("en-US");
const report = { version: 1, candidates: [], mismatches: [], carryovers: [],
  counts: { missingEnglish: 0, mismatchedEnglish: 0, pendingLocale: 0,
    unavailableLocale: 0, englishFallback: 0, translated: 0,
    classicTranslated: 0, clientSame: 0, noClientItem: 0, clientBlank: 0 } };
for (const item of catalog.items) {
  const index = sourceIndex.get(`ItemSparse:${item.id}:4`);
  const needed = Object.entries(packs).filter(([, pack]) =>
    index === undefined || !pack.values[index] || pack.values[index] === source.values[index])
    .map(([locale]) => locale);
  if (!needed.length) continue;
  const english = captures.get(`en:${item.id}`);
  if (!english) {
    report.counts.missingEnglish++;
    continue;
  }
  const alias = aliases.items[item.id];
  const acceptedAlias = alias?.catalogName === item.name &&
    alias?.wowheadName === english.name;
  if (!sameName(english.name, item.name) && !acceptedAlias) {
    report.counts.mismatchedEnglish++;
    report.mismatches.push({ id: Number(item.id), catalogName: item.name,
      wowheadName: english.name, evidence: english.url });
    continue;
  }
  const translations = {};
  const evidence = { en: english.url };
  const carryover = { clientSame: [], noClientItem: [], clientBlank: [] };
  const classicEnglish = classicCaptures.get(`en:${item.id}`);
  const classicMatches = classicEnglish && sameName(classicEnglish.name, item.name);
  for (const locale of needed) {
    const capture = captures.get(`${locale}:${item.id}`);
    const classic = classicMatches ? classicCaptures.get(`${locale}:${item.id}`) : null;
    const translated = capture && !sameName(capture.name, english.name) ? capture :
      classic && !sameName(classic.name, classicEnglish.name) ? classic : null;
    if (translated) {
      translations[locales[locale]] = translated.name;
      evidence[locales[locale]] = translated.url;
      report.counts.translated++;
      if (translated === classic) report.counts.classicTranslated++;
    } else if (!capture && unavailable.entries[`${item.id}:${locale}`]) {
      report.counts.unavailableLocale++;
    } else if (!capture) report.counts.pendingLocale++;
    else {
      report.counts.englishFallback++;
      const kind = index === undefined ? "noClientItem" :
        !packs[locale].values[index] ? "clientBlank" : "clientSame";
      report.counts[kind]++;
      carryover[kind].push(locales[locale]);
    }
  }
  if (Object.keys(translations).length) report.candidates.push({
    id: Number(item.id), source: item.name,
    ...(acceptedAlias ? { wowheadSourceName: english.name,
      requiresCatalogCorrection: true } : {}),
    translations, evidence,
  });
  if (Object.values(carryover).some((values) => values.length)) {
    report.carryovers.push({ id: Number(item.id), source: item.name, ...carryover });
  }
}
await writeFile(join(root, "data/site-research/wowhead-item-name-candidates.json"),
  `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.candidates.length} item IDs with localized candidates; ` +
  `${JSON.stringify(report.counts)}.`);
