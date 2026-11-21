import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const localesDirectory = path.join(projectRoot, "src", "i18n", "locales");

const flatten = (value, prefix = "", result = {}) => {
  for (const [key, child] of Object.entries(value)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, fullKey, result);
    } else {
      result[fullKey] = String(child);
    }
  }
  return result;
};

const readCatalog = (fileName) => {
  const filePath = path.join(localesDirectory, fileName);
  return flatten(JSON.parse(fs.readFileSync(filePath, "utf8")));
};

const placeholders = (value) =>
  [...value.matchAll(/{{\s*([^},\s]+)/g)]
    .map((match) => match[1])
    .sort()
    .join(",");

const hasPluralFallback = (key, source, target, locale) => {
  const pluralCategories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  if (pluralCategories.includes("one")) return false;

  const candidates = key.endsWith("_one")
    ? [`${key.slice(0, -4)}_other`]
    : key.endsWith(".one")
      ? [`${key.slice(0, -4)}.other`]
      : [`${key}_other`, `${key}.other`];

  return candidates.some((candidate) => candidate in source && candidate in target);
};

const sourceKeyForPluralVariant = (key, source) => {
  const suffixMatch = key.match(/^(.*)_(zero|two|few|many)$/u);
  if (suffixMatch) {
    const otherKey = `${suffixMatch[1]}_other`;
    if (otherKey in source) return otherKey;
  }

  const nestedMatch = key.match(/^(.*)\.(zero|two|few|many)$/u);
  if (nestedMatch) {
    const otherKey = `${nestedMatch[1]}.other`;
    if (otherKey in source) return otherKey;
  }

  return null;
};

const hasEncodingDamage = (sourceValue, targetValue) => {
  if (!targetValue.includes("?")) return false;
  if (/\?{2,}/u.test(targetValue)) return true;
  if (sourceValue.includes("?")) return false;
  const questionMarkIndex = targetValue.indexOf("?");
  if (questionMarkIndex === targetValue.length - 1) return false;
  return true;
};

const localeFiles = fs
  .readdirSync(localesDirectory)
  .filter((fileName) => fileName.endsWith(".json"))
  .sort();
const source = readCatalog("en.json");
const failures = [];
const identicalTranslationAllowlist = new Set([
  "erMap.portalName",
  "detail.buildAdvisor.readiness.scadutree",
  "detail.buildAdvisor.upgradeLabel",
]);

for (const fileName of localeFiles) {
  if (fileName === "en.json") continue;
  const locale = fileName.slice(0, -".json".length);
  const target = readCatalog(fileName);

  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      if (!hasPluralFallback(key, source, target, locale)) {
        failures.push(`${fileName}: missing key ${key}`);
      }
    }
  }

  for (const [key, targetValue] of Object.entries(target)) {
    const sourceKey = key in source ? key : sourceKeyForPluralVariant(key, source);
    if (!sourceKey) continue;
    const sourceValue = source[sourceKey];
    if (sourceValue.length > 0 && targetValue.length === 0) {
      failures.push(`${fileName}: empty translation at ${key}`);
    }
    if (placeholders(sourceValue) !== placeholders(targetValue)) {
      failures.push(`${fileName}: placeholder mismatch at ${key}`);
    }
    if (hasEncodingDamage(sourceValue, targetValue)) {
      failures.push(`${fileName}: possible encoding damage at ${key}: ${targetValue}`);
    }
    if (
      sourceValue === targetValue
      && sourceValue.length > 18
      && /[A-Za-z]{4}/u.test(sourceValue)
      && !identicalTranslationAllowlist.has(sourceKey)
    ) {
      failures.push(`${fileName}: possible untranslated value at ${key}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`i18n audit failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`i18n audit passed for ${localeFiles.length - 1} translated catalogs.`);
}
