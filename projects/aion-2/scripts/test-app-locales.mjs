import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAME_CONFIG } from "../src/game-config.ts";
import { keepCompatibleTranslations } from "../src/i18n/locale-fallback.ts";
import { createInstance } from "i18next";

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

assert.deepEqual(keepCompatibleTranslations(
  { count: "Level {{level}}", title: "Skills" },
  { count: "Stufe", title: "Fertigkeiten" },
), { title: "Fertigkeiten" }, "Incompatible placeholders must use English fallback.");

const pluralSource = { count_one: "{{count}} Nightmare", count_other: "{{count}} Nightmares" };
const pluralRussian = keepCompatibleTranslations(pluralSource, {
  count_one: "{{count}} Кошмар", count_few: "{{count}} Кошмара",
  count_many: "{{count}} Кошмаров", count_other: "{{count}} Кошмара",
});
const pluralI18n = createInstance();
await pluralI18n.init({ lng: "ru", fallbackLng: "en", resources: {
  en: { translation: pluralSource }, ru: { translation: pluralRussian },
}, interpolation: { escapeValue: false } });
assert.equal(pluralI18n.t("count", { count: 1 }), "1 Кошмар");
assert.equal(pluralI18n.t("count", { count: 2 }), "2 Кошмара");
assert.equal(pluralI18n.t("count", { count: 5 }), "5 Кошмаров");

const source = flatten(JSON.parse(await readFile(join(localeDirectory, "en.json"), "utf8")));
const wrongItemTerms = {
  de: /\bArtikel\b|Artikeldatenbank|Artikeldetails|Artikelebene/iu,
  es: /\belementos\b|\bartículos?\b/iu,
  fr: /\béléments\b|\barticles?\b/iu,
  ja: /項目|商品/u,
  ko: /항목|물품/u,
  "pt-BR": /\bartigos?\b/iu,
  ru: /\bэлемент\w*\b|\bпункт\w*\b/iu,
};
const wrongDropTerms = {
  de: /Tropfen/iu, es: /caída|caer/iu, fr: /chute|perte/iu,
  ja: /滴/u, ko: /방울/u, "pt-BR": /queda|cair/iu, ru: /капл/iu,
};
const wrongChanceTerms = { es: /oportunidad/iu, ja: /チャンス/u,
  ko: /기회/u, "pt-BR": /oportunidade/iu };
const wrongRollTerms = { es: /rollos?/iu, fr: /rouleaux?/iu,
  "pt-BR": /rolos?/iu, ru: /рулоны?/iu };
const localeFiles = (await readdir(localeDirectory))
  .filter((file) => GAME_CONFIG.supportedAppLanguages.includes(file.replace(/\.json$/, "")) && file !== "en.json")
  .sort();
assert.equal(localeFiles.length + 1, GAME_CONFIG.supportedAppLanguages.length, "Every selected language needs a locale file.");

for (const [key, value] of source) {
  assert.equal(typeof value, "string", `en.json:${key} must be a string.`);
  assert.ok(value.trim().length > 0, `en.json:${key} must not be empty.`);
}

for (const file of localeFiles) {
  const language = file.replace(/\.json$/, "");
  const raw = JSON.parse(await readFile(join(localeDirectory, file), "utf8"));
  const translation = flatten(raw);
  const compatible = flatten(keepCompatibleTranslations(
    JSON.parse(await readFile(join(localeDirectory, "en.json"), "utf8")), raw));

  for (const [key, translatedValue] of translation) {
    if (!source.has(key)) continue;
    const sourceValue = source.get(key);
    assert.ok(compatible.has(key), `${file}:${key} is incompatible with en.json.`);
    assert.equal(typeof translatedValue, "string", `${file}:${key} must be a string.`);
    assert.ok(translatedValue.trim().length > 0, `${file}:${key} must not be empty.`);
    assert.deepEqual(
      placeholders(translatedValue),
      placeholders(sourceValue),
      `${file}:${key} placeholders differ from en.json.`,
    );
    if (/\bitems?\b/i.test(sourceValue) && key !== "database.acquisition.sharedPoolDescription") {
      assert.doesNotMatch(translatedValue, wrongItemTerms[language], `${file}:${key} uses a non-game term for an item.`);
    }
    if (/\bdrops?\b/i.test(sourceValue)) {
      assert.doesNotMatch(translatedValue, wrongDropTerms[language], `${file}:${key} treats a loot drop as a falling object.`);
    }
    if (/\bchance\b/i.test(sourceValue) && wrongChanceTerms[language]) {
      assert.doesNotMatch(translatedValue, wrongChanceTerms[language], `${file}:${key} does not express probability.`);
    }
    if (/\brolls?\b/i.test(sourceValue) && wrongRollTerms[language]) {
      assert.doesNotMatch(translatedValue, wrongRollTerms[language], `${file}:${key} treats a reward draw as a physical roll.`);
    }
    if (/\bbox(?:es)?\b/i.test(sourceValue) && language === "es") {
      assert.doesNotMatch(translatedValue, /cuadros?|recuadros?/iu, `${file}:${key} treats a reward box as a frame.`);
    }
    if (/\bboss\b/i.test(sourceValue) && ["de", "fr"].includes(language)) {
      assert.doesNotMatch(translatedValue, language === "de" ? /\bChef\b/iu : /\bPatron\b/iu,
        `${file}:${key} treats a boss as a manager.`);
    }
  }
}

console.log(`Locale tests passed for ${localeFiles.length + 1} languages.`);
