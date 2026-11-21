/** Publish only talent text matched to the same installed-client English spell. */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { hasEastAsianEnglishCarryover, numbers } from "./lib/wowhead-tooltip-text.mjs";
import { loadWowheadClassDescriptions, loadWowheadTalentNames,
  sameClassDescriptionText } from
  "./lib/wowhead-class-description-captures.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const calculator = await read("public/data/classes/talent-calculator.json");
const findings = await read("data/site-research/talent-client-verified-translations.json");
const sourceTalents = new Map(calculator.classes.flatMap((cls) =>
  cls.trees.flatMap((tree) => tree.talents.map((talent) => [talent.id, talent]))));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const reviewedNames = await read("data/class-catalog-localization/wowhead-talent-name-supplements.json");
if (reviewedNames.version !== 1 || !Array.isArray(reviewedNames.entries)) {
  throw new Error("Invalid reviewed Wowhead talent names");
}
const reviewedNamesByTalentId = new Map();
for (const record of reviewedNames.entries) {
  const matches = [...sourceTalents.values()].filter((talent) =>
    talent.n === record.english && talent.ranks.includes(record.spellId));
  if (matches.length !== 1 || record.evidence !==
    `https://nether.wowhead.com/forever/tooltip/spell/${record.spellId}` ||
    Object.keys(record.locales ?? {}).sort().join("|") !== [...languages].sort().join("|") ||
    languages.some((language) => typeof record.locales[language] !== "string" ||
      !record.locales[language].trim() || record.locales[language] === record.english) ||
    reviewedNamesByTalentId.has(matches[0].id)) {
    throw new Error(`Invalid reviewed Wowhead talent name: ${record.spellId}`);
  }
  reviewedNamesByTalentId.set(matches[0].id, record);
}
const wowheadLocales = { de: "de", es: "es", "es-MX": "mx", fr: "fr", ko: "ko",
  "pt-BR": "pt", "zh-Hans": "cn", "zh-Hant": "tw" };
const gameLocales = { de: "deDE", es: "esES", "es-MX": "esMX", fr: "frFR",
  ko: "koKR", "pt-BR": "ptBR", "zh-Hans": "zhCN", "zh-Hant": "zhTW" };
const wowhead = await loadWowheadClassDescriptions(root);
const wowheadTalentNames = await loadWowheadTalentNames(root);
const check = process.argv.includes("--check");

if (findings.version !== 1 || findings.sourceBuild !== calculator.sourceBuild ||
  sourceTalents.size !== findings.summary.talents) {
  throw new Error("Talent translation findings do not match the calculator source");
}

for (const language of languages) {
  const records = findings.languages[language]?.talents;
  if (!Array.isArray(records) || records.length !== sourceTalents.size) {
    throw new Error(`Incomplete talent findings: ${language}`);
  }
  const entries = {};
  const seen = new Set();
  let names = 0;
  let descriptions = 0;
  let wowheadNames = 0;
  let wowheadDescriptions = 0;
  for (const record of records) {
    const source = sourceTalents.get(record.talentId);
    if (!source || seen.has(record.talentId) || source.n !== record.englishName ||
      !Array.isArray(record.ranks) || record.ranks.length !== source.d.length) {
      throw new Error(`Stale talent identity: ${language}/${record.talentId}`);
    }
    seen.add(record.talentId);
    const entry = {};
    if (record.translatedName) {
      if (record.translatedName === source.n) throw new Error(`English talent name: ${record.talentId}`);
      entry.name = { source: source.n, text: record.translatedName };
      names += 1;
    }
    const ranks = {};
    for (let index = 0; index < source.d.length; index += 1) {
      const candidate = record.ranks[index];
      if (candidate.rank !== index + 1 || candidate.english !== source.d[index]) {
        throw new Error(`Stale talent rank: ${language}/${record.talentId}/${index + 1}`);
      }
      if (candidate.translations.length !== 1) continue;
      const text = candidate.translations[0];
      if (!candidate.sourceIds.length || !text?.trim() || text === source.d[index] ||
        /\$[A-Za-z0-9{]/.test(text) || numbers(text) !== numbers(source.d[index])) {
        throw new Error(`Unsafe talent translation: ${language}/${record.talentId}/${index + 1}`);
      }
      ranks[index] = { source: source.d[index], text };
      descriptions += 1;
    }
    if (Object.keys(ranks).length) entry.ranks = ranks;
    if (Object.keys(entry).length) entries[record.talentId] = entry;
  }
  for (const source of sourceTalents.values()) {
    const nameCandidates = [...new Set(source.ranks.flatMap((id) => {
      const english = wowhead.get(`${id}:en`);
      const localized = wowhead.get(`${id}:${wowheadLocales[language]}`);
      return english?.name === source.n && localized?.name &&
        localized.name !== source.n ? [localized.name] : [];
    }))];
    if (nameCandidates.length === 1 && !entries[source.id]?.name) {
      (entries[source.id] ??= {}).name = { source: source.n, text: nameCandidates[0] };
      names++;
      wowheadNames++;
    }
    const reviewedName = reviewedNamesByTalentId.get(source.id)?.locales[language];
    if (reviewedName && !entries[source.id]?.name) {
      (entries[source.id] ??= {}).name = { source: source.n, text: reviewedName };
      names++;
      wowheadNames++;
    }
    const englishName = wowheadTalentNames.get(`${source.id}:en`);
    const localizedName = wowheadTalentNames.get(`${source.id}:${wowheadLocales[language]}`);
    if (!entries[source.id]?.name && englishName?.name === source.n &&
      englishName.spellId === localizedName?.spellId &&
      source.ranks.includes(englishName.spellId) &&
      localizedName.sourceName === source.n &&
      localizedName.name !== source.n &&
      !/^\[.*\]$/.test(localizedName.name)) {
      (entries[source.id] ??= {}).name = { source: source.n, text: localizedName.name };
      names++;
      wowheadNames++;
    }
    for (let index = 0; index < source.d.length; index += 1) {
      const id = source.ranks[index];
      const english = wowhead.get(`${id}:en`);
      if (english?.name !== source.n ||
        !sameClassDescriptionText(english.text ?? "", source.d[index])) continue;
      const text = wowhead.get(`${id}:${wowheadLocales[language]}`)?.text;
      if (!text || sameClassDescriptionText(text, english.text) ||
        /\$[A-Za-z0-9{]/.test(text) || numbers(text) !== numbers(english.text) ||
        hasEastAsianEnglishCarryover(text, gameLocales[language])) continue;
      const entry = entries[source.id] ??= {};
      const ranks = entry.ranks ??= {};
      if (ranks[index]) continue;
      ranks[index] = { source: source.d[index], text };
      descriptions++;
      wowheadDescriptions++;
    }
  }
  const path = join(root, `public/data/classes/locales/talents-${language}.json`);
  const content = `${JSON.stringify({ version: 1, sourceBuild: calculator.sourceBuild,
    clientBuild: findings.clientBuild, language, entries })}\n`;
  if (check) {
    if (await readFile(path, "utf8") !== content) throw new Error(`Stale talent pack: ${language}`);
  } else {
    await writeFile(path, content);
  }
  console.log(`${language}: ${names} talent names, ${descriptions} rank descriptions ` +
    `(${wowheadNames} names and ${wowheadDescriptions} descriptions from Wowhead tooltips)`);
}
