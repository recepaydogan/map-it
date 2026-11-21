import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_GUIDE_LANGUAGE_SOURCE } from "../src/game-config.ts";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const localeDirectory = join(scriptDirectory, "..", "src", "i18n", "locales");

const flatten = (value, prefix = "", entries = new Map()) => {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flatten(child, path, entries);
    } else {
      entries.set(path, child);
    }
  }
  return entries;
};

const placeholders = (value) => [
  ...String(value).matchAll(/{{\s*([^},\s]+).*?}}/g),
].map((match) => match[1]).sort();

const source = flatten(JSON.parse(await readFile(join(localeDirectory, "en.json"), "utf8")));
const localeFiles = (await readdir(localeDirectory))
  .filter((file) => file.endsWith(".json") && file !== "en.json")
  .sort();
assert.deepEqual(
  ["en.json", ...localeFiles].sort(),
  Object.keys(GAME_GUIDE_LANGUAGE_SOURCE.localeCodes).map((locale) => `${locale}.json`).sort(),
  "App locale files must match supported app languages.",
);

for (const file of localeFiles) {
  const translation = flatten(JSON.parse(await readFile(join(localeDirectory, file), "utf8")));
  assert.deepEqual([...translation.keys()].sort(), [...source.keys()].sort(), `${file} keys differ from en.json.`);

  for (const [key, sourceValue] of source) {
    const translatedValue = translation.get(key);
    assert.equal(typeof translatedValue, "string", `${file}:${key} must be a string.`);
    assert.ok(translatedValue.trim().length > 0, `${file}:${key} must not be empty.`);
    assert.deepEqual(
      placeholders(translatedValue),
      placeholders(sourceValue),
      `${file}:${key} placeholders differ from en.json.`,
    );
  }
}

console.log(`Locale tests passed for ${localeFiles.length + 1} languages.`);
