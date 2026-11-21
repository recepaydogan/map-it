import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = path => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const reviewed = read("scripts/reviewed-ui-count-labels.json");
const paths = [["buildingGuide", "usedIn"], ["craftingGuide", "usedIn"], ["wikiGuide", "usedIn"],
  ["buildingGuide", "usedInWiki"], ["craftingGuide", "craftedHere"]];
for (const [language, labels] of Object.entries(reviewed)) {
  if (labels.length !== 3 || labels.some(value => typeof value !== "string"
    || (value.match(/\{\{count\}\}/g) ?? []).length !== 1)) throw new Error(`Invalid reviewed labels: ${language}`);
  const path = `src/i18n/locales/${language.toLowerCase()}.json`;
  const locale = read(path);
  const overridesPath = `scripts/localization-overrides/${language.toLowerCase()}.json`;
  const overrides = existsSync(resolve(root, overridesPath)) ? read(overridesPath) : {};
  for (const [index, [section, key]] of paths.entries()) {
    if (typeof locale[section]?.[key] !== "string") throw new Error(`Missing count label: ${language}:${section}.${key}`);
    const value = labels[index < 3 ? 0 : index - 2];
    locale[section][key] = value;
    if (language !== "en") overrides[`${section}.${key}`] = value;
  }
  writeFileSync(resolve(root, path), JSON.stringify(locale, null, 2) + "\n");
  if (language !== "en") writeFileSync(resolve(root, overridesPath), JSON.stringify(overrides, null, 2) + "\n");
}
console.log(`Applied reviewed count labels in ${Object.keys(reviewed).length} languages`);
