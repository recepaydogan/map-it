import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const hash = path => createHash("sha256").update(readFileSync(resolve(root, path))).digest("hex");
const languages = read("scripts/enshrouded-languages.json");
const output = resolve(root, "research/localization");
mkdirSync(output, { recursive: true });
const flatten = (value, path = "") => {
  if (typeof value === "string") return [[path, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
};
const placeholders = value => [...value.matchAll(/{{.*?}}/g)].map(match => match[0]).sort().join("|");
const nonLatinLocale = language => /^(?:ru|uk|ja|ko|th|zh-)/.test(language);
const literalEnglishWords = new Set(["enshrouded", "companion", "wiki", "overwolf", "discord", "keen", "games", "twitch", "drops",
  "steam", "windows", "url", "ctrl", "shift", "alt", "enter", "esc", "fps", "npc", "npcs", "xp", "wasd", "rgb", "dpi", "utc",
  "min", "sec", "png", "jpg", "webp", "http", "https", "www", "com", "org", "net", "lupa", "polaris", "fyraszh", "dalszul",
  "arisztar", "merphisz", "bbb", "armadillidium", "vulgare", "zzzrrr", "krrrraallllll", "hrrrrggg"]);
const retainedEnglishWords = value => [...value.replace(/\{\{[^{}]*\}\}|\[\[[^\]]*\]\]|https?:\/\/\S+|\w+@\w+\.\w+/g, "")
  .matchAll(/[A-Za-z]{3,}/g)].map(match => match[0])
  .filter(word => !literalEnglishWords.has(word.toLowerCase()) && !/^(?:a?h+r+|z+r+|k+r+a+l+|h+r+g+)$/i.test(word) && !/^[IVXLCDM]+$/.test(word));
const englishFunctionWords = new Set(["the", "a", "an", "of", "from", "with", "your", "you", "their", "them",
  "are", "is", "was", "be", "been", "will", "can", "found", "requires", "during", "notes"]);
const proseWords = value => (value.replace(/\{\{[^{}]*\}\}|\[\[[^\]]*\]\]|https?:\/\/\S+|\w+\.png/gi, " ")
  .toLowerCase().match(/[a-z]+/g) ?? []);
const retainedEnglishPhrases = (source, target) => {
  const original = proseWords(source);
  const translated = proseWords(target);
  const triples = new Set(original.slice(2).map((_, i) => original.slice(i, i + 3).join(" ")));
  return [...new Set(translated.slice(2).flatMap((_, i) => {
    const words = translated.slice(i, i + 3);
    const phrase = words.join(" ");
    // A musician's stage name remains a proper name in the instrument lore.
    return phrase !== "daniel the damned" && triples.has(phrase) && words.join("").length > 13
      && words.some(word => englishFunctionWords.has(word)) ? [phrase] : [];
  }))];
};
const english = new Map(flatten(read("src/i18n/locales/en.json")));
const invariants = /^(?:{{.*?}}|[\d\s.,:/+×–—%-]+|Ctrl\+Shift\+[A-Z]|Discord|Overwolf|Enshrouded(?: Wiki| Companion)?|NPCs?|XP|FPS|X, Y|you@example\.com|Vukah|Drak)$/;
const ui = {};
for (const language of Object.keys(languages).filter(code => code !== "en")) {
  const file = `src/i18n/locales/${language.toLowerCase()}.json`;
  if (!existsSync(resolve(root, file))) {
    ui[language] = { missingFile: true, missingKeys: [...english.keys()] };
    continue;
  }
  const target = new Map(flatten(read(file)));
  const missingKeys = [...english.keys()].filter(key => !target.has(key) || !target.get(key)?.trim());
  const placeholderErrors = [...english].filter(([key, value]) => target.has(key)
    && placeholders(value) !== placeholders(target.get(key))).map(([key]) => key);
  const damagedValues = [...target].filter(([, value]) => /__EM_|<x\s+id=|ZXQ|QXZ|\bZX[A-Z0-9 ]{5,50}QZ\b|\uFFFD/i.test(value)).map(([key]) => key);
  const englishRemnants = nonLatinLocale(language) ? [...target].flatMap(([key, value]) => {
    const words = retainedEnglishWords(value);
    return words.length ? [{ key, words, value }] : [];
  }) : [];
  const unchangedCandidates = [...english].filter(([key, value]) => target.get(key) === value && !invariants.test(value))
    .map(([key, value]) => ({ key, value }));
  const pluralErrors = [];
  const forms = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
  const pluralBases = [...new Set([...english.keys()].filter(key => /_other$/.test(key)).map(key => key.slice(0, -6)))];
  for (const base of pluralBases) {
    for (const form of forms) if (!target.has(`${base}_${form}`)) pluralErrors.push(`${base}_${form}`);
  }
  const draftReport = `research/localization/app-drafts/${language.toLowerCase()}-report.json`;
  ui[language] = { strings: target.size, missingKeys, placeholderErrors, damagedValues, pluralErrors, unchangedCandidates, englishRemnants,
    reviewStatus: existsSync(resolve(root, draftReport)) ? read(draftReport).status : "unreviewed" };
}

const packDirectory = "public/data/enshrouded/locales";
const sourcePath = `${packDirectory}/source.json`;
const haveOfficialPacks = existsSync(resolve(root, sourcePath)) && existsSync(resolve(root, `${packDirectory}/manifest.json`));
const source = haveOfficialPacks ? read(sourcePath) : null;
const snapshot = "research/game-map-verification-2026-10-23/english-labels.json";
const officialEnglish = source ? Object.fromEntries(source.keys.map((key, i) => [key, source.values[i]])) : read(snapshot);
const normalize = value => value.replace(/<[^>]*>/g, "").replace(/'{2,3}/g, "")
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+([,.!?;:])/g, "$1")
  .replace(/\s+/g, " ").trim().toLocaleLowerCase("en");
const byEnglish = new Map();
for (const [key, value] of Object.entries(officialEnglish)) {
  if (!value) continue;
  const normalized = normalize(value);
  byEnglish.set(normalized, [...(byEnglish.get(normalized) ?? []), key]);
}

// Preserve IDs, wiki page targets, filenames and authored English for logic.
// Only these display fields enter the supplementary translation inventory.
const displayFields = new Set(["name", "label", "title", "description", "overview", "obtaining", "obtainingText",
  "text", "headers", "value", "role", "faction", "regions", "biomes", "behavior", "group", "set",
  "type", "rarity", "waterRequirement", "obtainedBy", "yields"]);
const files = [
  ...["wiki-catalog", "crafting-catalog", "building-catalog", "progression-catalog", "bestiary-catalog", "gameplay-catalog",
    "location-guide", "shroud-lair-guide", "marker-panels"].map(name => `public/data/enshrouded/${name}.json`),
  "public/maps/enshrouded/metadata.json", "public/maps/enshrouded/bestiary-locations.json",
];
const inventory = [];
const catalogs = {};
for (const file of files) {
  const before = inventory.length;
  const visit = (value, path = [], display = false) => {
    if (typeof value === "string") {
      if (!display || !/[a-zA-Z]/.test(value) || /^(?:data|maps)\//.test(value)) return;
      inventory.push({ file, path: path.join("."), english: value, officialTagCandidates: byEnglish.get(normalize(value)) ?? [] });
    } else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        const array = Array.isArray(value);
        visit(child, [...path, key], array ? display : displayFields.has(key));
      }
    }
  };
  visit(read(file));
  const entries = inventory.slice(before);
  catalogs[file] = { sha256: hash(file), displayFields: entries.length,
    officialCandidateFields: entries.filter(entry => entry.officialTagCandidates.length).length,
    supplementaryFields: entries.filter(entry => !entry.officialTagCandidates.length).length };
}
const stringIndexes = new Map();
const strings = [];
const fields = {};
for (const entry of inventory) {
  if (!stringIndexes.has(entry.english)) {
    stringIndexes.set(entry.english, strings.length);
    strings.push({ english: entry.english, officialTagCandidates: entry.officialTagCandidates });
  }
  (fields[entry.file] ??= []).push({ path: entry.path, string: stringIndexes.get(entry.english) });
}
writeFileSync(resolve(output, "content-inventory.json"), JSON.stringify({ version: 1,
  officialReference: haveOfficialPacks ? sourcePath : snapshot,
  officialReferenceIsHistorical: !haveOfficialPacks, catalogs, strings, fields }) + "\n");
const officialMissing = Object.entries(languages).filter(([, code]) => !existsSync(resolve(root, `${packDirectory}/${code.replaceAll("_", "-").toLowerCase()}.json`)))
  .map(([language]) => language);
const contentDirectory = "public/data/enshrouded/content-locales";
const contentSourcePath = `${contentDirectory}/source.json`;
const contentSource = existsSync(resolve(root, contentSourcePath)) ? read(contentSourcePath) : null;
const contentPacks = {};
const nativeLiteralReviews = read("scripts/reviewed-native-literals.json");
const textHash = value => createHash("sha256").update(value).digest("hex");
const preservedTokens = value => [...value.matchAll(/\{\{[^{}]*\}\}|\[\[[^\]]*\]\]/g)].map(match => match[0]).sort().join("\n");
const preservedDurations = (source, target, language) => {
  const clocks = value => [...value.matchAll(/\b(\d{1,2}):(\d{2})\b/g)].map(m => `${Number(m[1])}:${m[2]}`);
  const translated = new Set(clocks(target));
  // Korean may explicitly spell the same minutes and seconds.
  if (language === "ko") for (const m of target.matchAll(/(\d+)\s*분\s*(\d+)\s*초/g)) {
    translated.add(`${Number(m[1])}:${m[2].padStart(2, "0")}`);
  }
  return clocks(source).every(time => translated.has(time));
};
for (const language of Object.keys(languages).filter(code => code !== "en")) {
  const file = `${contentDirectory}/${language.toLowerCase()}.json`;
  if (!contentSource || !existsSync(resolve(root, file))) {
    contentPacks[language] = { available: false, complete: false };
    continue;
  }
  const pack = read(file);
  const aligned = pack.version === 1 && pack.sourceSha256 === contentSource.sourceSha256
    && Array.isArray(pack.values) && pack.values.length === contentSource.values.length;
  const invalidValues = aligned ? pack.values.flatMap((value, index) =>
    typeof value !== "string" || !value.trim() || /__EM_|ZXQ|QXZ|\bZX[A-Z0-9 ]{5,50}QZ\b|\{\{EMTERM_\d+\}\}|\uFFFD|\[mq:ch\s+val=/i.test(value)
      || preservedTokens(value) !== preservedTokens(contentSource.values[index])
      || !preservedDurations(contentSource.values[index], value, language) ? [contentSource.keys[index]] : []) : [];
  const provenancePath = `research/localization/content-drafts/${language.toLowerCase()}-provenance.json`;
  const provenance = existsSync(resolve(root, provenancePath)) ? read(provenancePath) : null;
  const provenanceAligned = provenance?.sourceSha256 === contentSource.sourceSha256
    && provenance.codes?.length === contentSource.values.length && !/[^ORVSG]/.test(provenance.codes);
  const reviewCandidates = [];
  const phraseReviewCurrent = pack.phraseReviewSha256 === hash("scripts/reviewed-content-phrases.json")
    && pack.contextReviewSha256 === hash("scripts/reviewed-term-contexts.json")
    && pack.nativeFormatAliasSha256 === hash("scripts/reviewed-native-format-aliases.json")
    && pack.nativeLocaleSha256 === hash(`public/data/enshrouded/locales/${languages[language].replaceAll("_", "-").toLowerCase()}.json`);
  const contextRules = read("scripts/reviewed-term-contexts.json").rules.flatMap(rule =>
    (rule.languages[language] ?? []).map(([pattern]) => ({
      source: new RegExp(rule.sourcePattern, "iu"), target: new RegExp(pattern, "iu"),
    })));
  const outsideTokens = value => value.replace(/\{\{[^{}]*\}\}|\[\[[^\]]*\]\]/g, "").trim();
  const foldEnglish = value => value.normalize("NFKC").replace(/[‘’]/g, "'").replace(/\s+/g, " ").toLowerCase();
  const nonLatinLanguage = /^(?:ru|uk|ja|ko|th|zh-)/.test(language);
  if (aligned && provenanceAligned) for (let index = 0; index < pack.values.length; index++) {
    const literalReview = nativeLiteralReviews[contentSource.keys[index]]?.[language];
    const verifiedLiterals = provenance.codes[index] === "O" && literalReview
      && literalReview.englishSha256 === textHash(contentSource.values[index])
      && literalReview.translatedSha256 === textHash(pack.values[index]) ? literalReview : null;
    if (provenance.codes[index] !== "O" && contextRules.some(rule =>
      rule.source.test(contentSource.values[index]) && rule.target.test(pack.values[index]))) {
      reviewCandidates.push({ key: contentSource.keys[index], reason: "contextual-term",
        english: contentSource.values[index], translated: pack.values[index] });
      continue;
    }
    if (nonLatinLocale(language)) {
      const words = retainedEnglishWords(pack.values[index]).filter(word => !verifiedLiterals?.words.includes(word));
      if (words.length) {
        reviewCandidates.push({ key: contentSource.keys[index], reason: "retained-English-word", words,
          english: contentSource.values[index], translated: pack.values[index] });
        continue;
      }
    }
    if (!nonLatinLocale(language)) {
      const phrases = retainedEnglishPhrases(contentSource.values[index], pack.values[index])
        .filter(phrase => !verifiedLiterals?.phrases.includes(phrase));
      if (phrases.length) {
        reviewCandidates.push({ key: contentSource.keys[index], reason: "retained-English-phrase", phrases,
          english: contentSource.values[index], translated: pack.values[index] });
        continue;
      }
    }
    if (provenance.codes[index] !== "S" || typeof pack.values[index] !== "string") continue;
    const sourceText = outsideTokens(contentSource.values[index]);
    const translatedText = outsideTokens(pack.values[index]);
    if (sourceText.length > 40 && translatedText === sourceText)
      reviewCandidates.push({ key: contentSource.keys[index], reason: "unchanged-authored-text", english: contentSource.values[index] });
    else if (sourceText.length > 100 && translatedText.length < sourceText.length * 0.15)
      reviewCandidates.push({ key: contentSource.keys[index], reason: "unusually-short-translation", english: contentSource.values[index], translated: pack.values[index] });
    else if (nonLatinLanguage && [...foldEnglish(translatedText).matchAll(/\b[a-z]+(?:[ '\-]+[a-z]+){3,}\b/g)]
      .some(match => match[0].length > 20 && foldEnglish(sourceText).includes(match[0])))
      reviewCandidates.push({ key: contentSource.keys[index], reason: "retained-English-phrase", english: contentSource.values[index], translated: pack.values[index] });
  }
  contentPacks[language] = { available: true, aligned, invalidValues, provenanceAligned, reviewCandidates,
    phraseReviewCurrent, complete: aligned && !invalidValues.length && provenanceAligned && phraseReviewCurrent && !reviewCandidates.length };
}
const uncoveredStrings = contentSource ? strings.filter(entry => !contentSource.values.includes(entry.english)).map(entry => entry.english) : strings.map(entry => entry.english);
const contentTranslated = !uncoveredStrings.length && Object.values(contentPacks).every(pack => pack.complete);
const uiValid = Object.values(ui).every(locale => !locale.missingFile && !locale.missingKeys.length
  && !locale.placeholderErrors.length && !locale.damagedValues.length && !locale.pluralErrors.length && !locale.englishRemnants.length);
const configText = readFileSync(resolve(root, "src/game-config.ts"), "utf8");
const activeLanguages = JSON.parse(configText.match(/supportedAppLanguages:\s*(\[[^\]]*\])/s)?.[1] ?? '["en"]');
const allLanguagesActive = Object.keys(languages).every(code => activeLanguages.includes(code));
const verificationPath = "research/localization/verification.json";
const verification = existsSync(resolve(root, verificationPath)) ? read(verificationPath) : null;
const verified = verification?.complete === true && verification.sourceSha256 === contentSource?.sourceSha256
  && Object.keys(languages).every(code => verification.languages?.includes(code));
const pending = [];
if (officialMissing.length) pending.push("Extract and verify missing official language packs");
if (!uiValid) pending.push("Resolve UI keys, placeholders or plural branches");
if (!contentTranslated) pending.push("Complete and verify supplementary catalog and map translations");
if (!verified) pending.push("Review contextual translations and verify rendered language switching and navigation");
if (!allLanguagesActive) pending.push("Enable all completed languages");
const status = {
  version: 1,
  complete: !officialMissing.length && uiValid && contentTranslated && allLanguagesActive && verified,
  activeLanguages,
  intendedLanguages: Object.keys(languages),
  official: { available: haveOfficialPacks, missingPacks: officialMissing,
    blocker: haveOfficialPacks ? null : "Installed enshrouded.kfc and enshrouded_*.dat archives are required; the historical snapshot contains English text and language references, not translated language blobs." },
  ui,
  content: { fields: inventory.length, uniqueEnglish: new Set(inventory.map(entry => entry.english)).size,
    officialCandidateFields: inventory.filter(entry => entry.officialTagCandidates.length).length,
    supplementaryFields: inventory.filter(entry => !entry.officialTagCandidates.length).length,
    translated: contentTranslated, sourceSha256: contentSource?.sourceSha256 ?? null,
    packs: contentPacks, uncoveredStrings },
  verification: { current: verified, report: verification ? verificationPath : null },
  pending,
};
writeFileSync(resolve(output, "status.json"), JSON.stringify(status, null, 2) + "\n");
console.log(JSON.stringify({ intendedLanguages: status.intendedLanguages.length, uiFiles: Object.keys(ui).length,
  officialPacksMissing: officialMissing.length, content: { ...status.content,
    packs: Object.fromEntries(Object.entries(contentPacks).map(([code, pack]) => [code, {
      available: pack.available, aligned: pack.aligned ?? false, provenanceAligned: pack.provenanceAligned ?? false,
      invalidValues: pack.invalidValues?.length ?? 0, reviewCandidates: pack.reviewCandidates?.length ?? 0,
    }])), uncoveredStrings: uncoveredStrings.length },
  uiErrors: Object.fromEntries(Object.entries(ui).map(([code, value]) => [code, {
    missing: value.missingKeys.length, placeholders: value.placeholderErrors?.length ?? 0,
    damaged: value.damagedValues?.length ?? 0, pluralBranches: value.pluralErrors?.length ?? 0,
    englishRemnants: value.englishRemnants?.length ?? 0,
  }])) }, null, 2));
if (!status.complete) process.exitCode = 1;
