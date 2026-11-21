import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = join(root, "src");
const localeRoot = join(sourceRoot, "i18n/locales");
const languages = process.env.WOW_LOCALE_LANGUAGE
  ? [process.env.WOW_LOCALE_LANGUAGE]
  : ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const json = async (path) => JSON.parse(await readFile(path, "utf8"));

function flatten(node, prefix = "", result = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else if (value && typeof value === "object") flatten(value, path, result);
  }
  return result;
}

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) result.push(path);
  }
  return result;
}

const english = flatten(await json(join(localeRoot, "en.json")));
const referenceRoot = process.env.WOW_LOCALE_REFERENCE_ROOT;
const referenceEnglish = referenceRoot
  ? flatten(await json(join(referenceRoot, "en.json")))
  : null;
const references = new Map();
for (const path of await files(sourceRoot)) {
  const content = await readFile(path, "utf8");
  for (const match of content.matchAll(/["'`]([A-Za-z][\w-]*(?:\.[\w-]+)+)["'`]/g)) {
    if (!english.has(match[1])) continue;
    const locations = references.get(match[1]) ?? new Set();
    locations.add(path.slice(root.length));
    references.set(match[1], locations);
  }
}

console.log(`${references.size} static English locale keys referenced in src`);
for (const language of languages) {
  const translated = flatten(await json(join(localeRoot, `${language}.json`)));
  const missing = [...references.keys()].filter((key) => !translated.has(key));
  const unchanged = [...references.keys()].filter((key) =>
    translated.get(key) === english.get(key));
  const uniqueEnglish = new Set(missing.map((key) => english.get(key))).size;
  const referenceTranslated = referenceRoot
    ? flatten(await json(join(referenceRoot, `${language}.json`)))
    : null;
  const reusable = referenceTranslated ? missing.filter((key) =>
    referenceEnglish.get(key) === english.get(key) && referenceTranslated.has(key)) : [];
  const localCandidates = new Map();
  for (const [key, value] of translated) {
    if (english.get(key) === undefined) continue;
    const sourceText = english.get(key);
    const entries = localCandidates.get(sourceText) ?? [];
    entries.push([key, value]);
    localCandidates.set(sourceText, entries);
  }
  const localReusable = missing.filter((key) => localCandidates.has(english.get(key)));
  const groups = new Map();
  for (const key of missing) {
    const prefix = key.split(".").slice(0, 2).join(".");
    groups.set(prefix, (groups.get(prefix) ?? 0) + 1);
  }
  console.log(`${language}: ${missing.length} missing static keys, ${uniqueEnglish} unique English strings`);
  console.log(`  ${unchanged.length} static keys still match English`);
  if (referenceTranslated) console.log(`  ${reusable.length} same-source reference translations available`);
  if (process.argv.includes("--local-reuse-list")) {
    console.log(`  ${localReusable.length} same-source translations in this locale`);
    for (const key of localReusable) {
      console.log(`${key}\t${english.get(key)}\t${localCandidates.get(english.get(key)).map(([sourceKey, value]) => `${sourceKey}=${value}`).join(" | ")}`);
    }
  }
  if (process.argv.includes("--reuse-list")) for (const key of reusable) {
    console.log(`${key}\t${english.get(key)}\t${referenceTranslated.get(key)}`);
  }
  console.log([...groups].sort((a, b) => b[1] - a[1]).slice(0, 12)
    .map(([prefix, count]) => `${prefix}=${count}`).join(" "));
  if (process.argv.includes("--list")) console.log(missing.map((key) => `${key}\t${english.get(key)}`).join("\n"));
  if (process.argv.includes("--unchanged-list")) {
    for (const key of unchanged) console.log(`${key}\t${english.get(key)}`);
  }
  if (process.argv.includes("--fail") && missing.length) process.exitCode = 1;
}
