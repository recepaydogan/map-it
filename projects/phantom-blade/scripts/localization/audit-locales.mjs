/** Completeness and provenance gate for this client's native text and app UI. */
import fs from "node:fs";
import crypto from "node:crypto";
import { flatten, validTranslation, canonicalText } from "./ui-locale-utils.mjs";

const read = file => JSON.parse(fs.readFileSync(file, "utf8"));
const root = "public/data/locales/phantom-blade-zero";
const manifest = read(`${root}/manifest.json`), source = read(`${root}/source.json`);
const englishFile = "src/i18n/locales/en.json", uiSource = flatten(read(englishFile));
const contextOverrides = read("data/localization/ui-context-overrides.json");
const contextKeys = ["overlay.minimap.interactShort", "overlay.minimap.toggleShort", "wiki.spawnGroups.bosses", "wiki.spawnGroups.npcs", "wiki.unnamedEntries.world-bosses", "wiki.unnamedEntries.npcs"];
const failures = [], report = { build: manifest.build, sourceEntries: source.keys.length, uiKeys: Object.keys(uiSource).length,
  englishUiSha256: crypto.createHash("sha256").update(fs.readFileSync(englishFile)).digest("hex"), locales: [] };
const keyIndex = new Map(source.keys.map((key, i) => [key, i]));
for (const [alias, key] of Object.entries(source.aliases)) if (!keyIndex.has(key)) failures.push(`Unknown game key ${alias}:${key}`);
const expectedNameAliases = new Map();
const wikiIndex = read("public/data/wiki/index.json");
for (const row of wikiIndex.entries) {
  const entry = read(`public/data/wiki/entries/${row.id}.json`);
  const proof = entry.npcNameEvidence
    ? { namespace: "Default", key: entry.npcNameEvidence.speakerKey }
    : entry.nameEvidence;
  if (!proof) continue;
  const alias = `Wiki:${entry.id}:/name`, key = `${proof.namespace}:${proof.key}`;
  if (canonicalText(source.values[keyIndex.get(key)] ?? "") !== canonicalText(entry.name)) {
    failures.push(`Display name has no matching native source: ${alias}`);
    continue;
  }
  expectedNameAliases.set(alias, key);
  if (source.aliases[alias] !== key) failures.push(`Missing or incorrect contextual name alias: ${alias}`);
}
report.nameCoverage = { contextualNames: expectedNameAliases.size };
const expectedQuestAliases = new Map();
const expectQuestAlias = (id, pointer, reference, displayed) => {
  if (typeof displayed !== "string" || !displayed.trim()) return;
  const key = `${reference?.Namespace ?? "Default"}:${reference?.Key}`;
  const alias = `Wiki:${id}:${pointer}`;
  const original = source.values[keyIndex.get(key)];
  if (!original || canonicalText(original) !== canonicalText(displayed)) {
    failures.push(`Quest text has no matching native source: ${alias}`);
    return;
  }
  expectedQuestAliases.set(alias, key);
  if (source.aliases[alias] !== key) failures.push(`Missing or incorrect quest alias: ${alias}`);
};
const quests = read("public/data/game-files/build-26266538/database/quests.json").records;
for (const quest of quests) {
  const entry = read(`public/data/wiki/entries/${quest.id}.json`);
  expectQuestAlias(quest.id, "/name", quest.nameReference, entry.name);
  entry.descriptions.forEach((description, i) => expectQuestAlias(quest.id, `/descriptions/${i}/text`, quest.descriptionReference, description.text));
  entry.quest.stages.forEach((stage, i) => {
    expectQuestAlias(quest.id, `/quest/stages/${i}/title`, stage.titleReference, stage.title);
    expectQuestAlias(quest.id, `/quest/stages/${i}/description`, stage.descriptionReference, stage.description);
  });
}
report.questCoverage = { quests: quests.length, nativeTextFields: expectedQuestAliases.size };
for (const locale of manifest.locales) {
  const uiFile = `src/i18n/locales/${locale.language}.json`;
  const ui = fs.existsSync(uiFile) ? flatten(read(uiFile)) : {};
  const missing = Object.entries(uiSource).filter(([key, value]) => !validTranslation(value, ui[key])).map(([key]) => key);
  if (missing.length) failures.push(`${locale.language}: missing/invalid UI keys: ${missing.join(", ")}`);
  for (const key of contextKeys) if (contextOverrides[key]?.[locale.language] && ui[key] !== contextOverrides[key][locale.language]) {
    failures.push(`${locale.language}: gaming context override not applied: ${key}`);
  }
  if (ui["wiki.unnamedEntries.npcs"] !== ui["wiki.spawnGroups.npcs"]) failures.push(`${locale.language}: unresolved NPC label does not match its NPC type`);
  if (ui["wiki.unnamedEntries.world-bosses"] !== ui["wiki.spawnGroups.bosses"]) failures.push(`${locale.language}: boss labels do not use the same gaming term`);
  const cacheFile = `artifacts/localization-2026-10-29/ui-cache/${locale.language}.json`;
  const staleUi = fs.existsSync(cacheFile) ? Object.entries(read(cacheFile)).filter(([key, cached]) =>
    uiSource[key] !== undefined && canonicalText(cached.source) !== canonicalText(uiSource[key]) && ui[key] === cached.value).map(([key]) => key) : [];
  if (staleUi.length) failures.push(`${locale.language}: translations still use obsolete English context: ${staleUi.join(", ")}`);
  const pack = read(`${root}/${locale.code}.json`);
  if (pack.values.length !== source.keys.length) failures.push(`${locale.code}: wrong game-text array length`);
  const original = read(`public/data/game-files/build-26266538/localization/${locale.code}.json`);
  const nativeByKey = new Map(original.entries.map(row => [`${row.namespace}:${row.key}`, row.text || null]));
  const altered = source.keys.filter((key, i) => (nativeByKey.get(key) ?? null) !== pack.values[i]);
  if (altered.length) failures.push(`${locale.code}: ${altered.length} game values differ from the installed source`);
  const unavailable = Object.entries(source.aliases).filter(([, key]) => !pack.values[keyIndex.get(key)]);
  const missingNames = unavailable.filter(([key]) => key.endsWith(":/name"));
  const unchangedSentences = Object.entries(uiSource).filter(([key, value]) => {
    const literal = value.replace(/{{[^}]+}}|Phantom Blade Zero(?: Map)?|Overwolf|Discord|Google/g, "").trim();
    return ui[key] === value && literal.split(/\s+/).length >= 3 && /[a-z]{3}/i.test(literal);
  });
  if (locale.language !== "en" && unchangedSentences.length) failures.push(`${locale.language}: unchanged UI sentences: ${unchangedSentences.map(([key]) => key).join(", ")}`);
  report.locales.push({ language: locale.language, gameCode: locale.code, missingUiKeys: missing.length, staleUiKeys: staleUi, alteredGameValues: altered.length,
    unavailableGameValues: pack.values.filter(value => !value).length, unavailableReferencedValues: unavailable.length,
    unavailableReferencedKeys: new Set(unavailable.map(([, key]) => key)).size,
    unavailableReferencedNames: missingNames.length, unavailableReferences: unavailable.map(([alias, key]) => ({ alias, key })) });
}
fs.mkdirSync("artifacts/localization-2026-10-29", { recursive: true });
fs.writeFileSync("artifacts/localization-2026-10-29/audit.json", JSON.stringify({ ...report, failures }, null, 2) + "\n");
console.log(JSON.stringify({ uiKeys: report.uiKeys, languages: report.locales.length, missingUiKeys: report.locales.reduce((sum, row) => sum + row.missingUiKeys, 0), alteredGameValues: report.locales.reduce((sum, row) => sum + row.alteredGameValues, 0), questCoverage: report.questCoverage, nameCoverage: report.nameCoverage, unavailableReferencedValues: Object.fromEntries(report.locales.map(row => [row.language, row.unavailableReferencedValues])), failures }, null, 2));
if (failures.length) process.exitCode = 1;
