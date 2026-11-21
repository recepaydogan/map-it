import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const groups = ["clientItem", "itemResearch", "foreverGathering", "questRewards", "acquisition"];
const core = ["noMatches", "usageLevel", "unlocalizedName", "allItems", "allGrades", "allTypes",
  "loading", "error", "group", "grade", "category", "search", "clearSearch", "itemCount",
  "itemLevel", "showMore", "noData", "chooseItemVariant", "statistics", "upgrades", "detailSections", "noSectionData"];

function flatten(node, prefix = "", output = new Map()) {
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") output.set(path, value);
    else if (value && typeof value === "object") flatten(value, path, output);
  }
  return output;
}

const variables = (value) => [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
  .map((match) => match[1]).sort();

test("WoW item detail and source panels have complete locale text", async () => {
  const expected = new Map(core.map((key) => [key, english.database[key]]));
  expected.set("compact.quantity", english.database.compact.quantity);
  for (const group of groups) flatten(english.database[group], group, expected);
  for (const language of languages) {
    const locale = JSON.parse(await readFile(join(root, `src/i18n/locales/${language}.json`), "utf8"));
    const translated = flatten(locale.database);
    for (const [key, original] of expected) {
      const value = translated.get(key);
      assert.ok(value && !value.includes("{{CLIENT:"), `${language} database.${key}`);
      assert.deepEqual(variables(value), variables(original), `${language} database.${key} variables`);
    }
  }
});
