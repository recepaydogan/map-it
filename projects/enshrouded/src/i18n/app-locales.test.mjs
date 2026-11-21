import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInstance } from "i18next";

const read = path => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const languages = read("../../scripts/enshrouded-languages.json");
const flatten = (value, path = "") => typeof value === "string" ? [[path, value]]
  : Object.entries(value).flatMap(([key, child]) => flatten(child, path ? `${path}.${key}` : key));
const english = new Map(flatten(read("./locales/en.json")));
const placeholders = value => [...value.matchAll(/{{.*?}}/g)].map(match => match[0]).sort();
for (const language of Object.keys(languages).filter(code => code !== "en")) {
  test(`${language}: app strings preserve interpolation, Unicode and required plural forms`, () => {
    const target = new Map(flatten(read(`./locales/${language.toLowerCase()}.json`)));
    for (const [key, source] of english) {
      const value = target.get(key);
      assert.ok(typeof value === "string" && value.trim(), `Missing ${key}`);
      assert.deepEqual(placeholders(value), placeholders(source), `Changed interpolation: ${key}`);
      assert.doesNotMatch(value, /__EM_|<x\s+id=|ZXQ|QXZ|\bZX[A-Z0-9 ]{5,50}QZ\b|\uFFFD/i, `Damaged text: ${key}`);
    }
    const forms = new Intl.PluralRules(language).resolvedOptions().pluralCategories;
    for (const key of english.keys()) {
      if (!key.endsWith("_other")) continue;
      for (const form of forms) {
        const required = `${key.slice(0, -6)}_${form}`;
        assert.ok(target.has(required), `Missing plural branch: ${required}`);
        assert.deepEqual(placeholders(target.get(required)), placeholders(english.get(key)));
      }
    }
  });
}

test("plural messages render every locale's own branches with English fallback disabled", async () => {
  const counts = [0, 1, 2, 3, 5, 11, 21, 22, 101, 1.5, 1_000_000];
  for (const language of Object.keys(languages)) {
    const instance = createInstance();
    const locale = read(`./locales/${language.toLowerCase()}.json`);
    await instance.init({ lng: language, fallbackLng: false, resources: { [language]: { translation: locale } },
      interpolation: { escapeValue: false } });
    const target = new Map(flatten(locale));
    const rules = new Intl.PluralRules(language);
    for (const key of english.keys()) {
      if (!key.endsWith("_other")) continue;
      const base = key.slice(0, -6);
      for (const count of counts) {
        const pluralKey = `${base}_${rules.select(count)}`;
        const expectedKey = target.has(pluralKey) ? pluralKey : base;
        assert.ok(target.has(expectedKey), `${language}:${pluralKey}`);
        const variables = Object.fromEntries(placeholders(english.get(key)).map(token => [token.slice(2, -2).trim(), "sample"]));
        variables.count = count;
        const rendered = instance.t(base, { ...variables, returnDetails: true });
        assert.equal(rendered.usedLng, language, `${language}:${base}`);
        assert.equal(rendered.exactUsedKey, expectedKey, `${language}:${base}:${count}`);
        const expected = target.get(expectedKey).replace(/\{\{(\w+)\}\}/g, (_, name) => String(variables[name]));
        assert.equal(rendered.res, expected);
        assert.doesNotMatch(rendered.res, /\{\{/);
      }
    }
  }
});
