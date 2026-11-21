import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = await readFile(join(root, "src/features/map/map-config.ts"), "utf8");
const keys = new Set([...config.matchAll(/map\.categories\.([A-Za-z]+)/g)].map((match) => match[1]));
keys.add("petSouls");
const groupKeys = new Set([...config.matchAll(/map\.categoryGroups\.([A-Za-z]+)/g)].map((match) => match[1]));
const languages = ["de", "es", "es-MX", "fr", "ko", "pt-BR", "zh-Hans", "zh-Hant"];
const english = JSON.parse(await readFile(join(root, "src/i18n/locales/en.json"), "utf8"));
const flatten = (value, prefix = "", result = new Map()) => {
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === "string") result.set(path, child);
    else if (child && typeof child === "object") flatten(child, path, result);
  }
  return result;
};
const variables = (value) => [...value.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)]
  .map((match) => match[1]).sort();

test("each active WoW map category has a reviewed label in every supported game language", async () => {
  assert.ok(keys.size > 70, "map configuration category scan must remain meaningful");
  for (const key of keys) assert.equal(typeof english.map.categories[key], "string", `English ${key}`);
  for (const language of languages) {
    const locale = JSON.parse(await readFile(join(root, `src/i18n/locales/${language}.json`), "utf8"));
    for (const key of keys) {
      const label = locale.map?.categories?.[key];
      assert.ok(typeof label === "string" && label.trim() && !label.includes("{{CLIENT:"), `${language} ${key}`);
    }
  }
});

test("active map controls, search, and location details have complete locale text", async () => {
  const sections = ["filters", "search", "details", "characters", "controls", "saved", "data",
    "questGroup", "sidebar", "regions", "performanceWarning", "markerStyle", "gathering", "rares"];
  for (const language of languages) {
    const locale = JSON.parse(await readFile(join(root, `src/i18n/locales/${language}.json`), "utf8"));
    for (const section of sections) {
      const source = flatten(english.map[section]);
      const translated = flatten(locale.map?.[section] ?? {});
      for (const [key, original] of source) {
        if (section === "characters" && /^(?:raceNames|classNames)\./.test(key)) continue;
        const value = translated.get(key);
        assert.ok(value, `${language} map.${section}.${key}`);
        assert.deepEqual(variables(value), variables(original), `${language} map.${section}.${key} variables`);
      }
    }
    for (const key of groupKeys) assert.ok(locale.map?.categoryGroups?.[key], `${language} map.categoryGroups.${key}`);
    assert.ok(locale.map?.custom?.personal, `${language} map.custom.personal`);
  }
});

test("quest details and beta notes cover dynamic keys without changing variables", async () => {
  const source = flatten(english.map.foreverQuest);
  for (const language of languages) {
    const locale = JSON.parse(await readFile(join(root, `src/i18n/locales/${language}.json`), "utf8"));
    const translated = flatten(locale.map?.foreverQuest ?? {});
    for (const [key, original] of source) {
      const value = translated.get(key);
      assert.ok(value && !value.includes("{{CLIENT:"), `${language} ${key}`);
      assert.deepEqual(variables(value), variables(original), `${language} ${key} variables`);
    }
  }
});
