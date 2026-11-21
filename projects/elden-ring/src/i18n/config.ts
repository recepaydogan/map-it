/**
 * i18n configuration — the single source of truth for which languages the app's
 * UI speaks and how its translation catalogs are organised.
 *
 * Scope: this governs the app's own UI chrome only. Game CONTENT (item / boss /
 * region names + descriptions) is localised separately in the data layer (per-
 * language FMG text overlays), not through these catalogs.
 */

/** The language the catalogs are authored in; every missing key falls back here. */
export const FALLBACK_LANGUAGE = "en";

export interface SupportedLanguage {
  /** BCP-47-ish code used as the i18next language + the persisted value. */
  code: string;
  /** The language's name in itself — what the switcher lists it as (a Chinese
   *  reader scans for "简体中文", not "Chinese"). */
  endonym: string;
  /** English name, for tooltips / aria-labels. */
  englishName: string;
  /** ISO 3166-1 alpha-2 region, for the SVG flag icon in the language switcher. */
  region: string;
  /** Writing direction; defaults to ltr. Set "rtl" when Arabic is added. */
  dir?: "ltr" | "rtl";
}

/** Languages the UI ships translations for. Add one by appending here, dropping a
 *  `locales/<code>.json` catalog, and registering a loader in `index.ts`. */
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", endonym: "English", englishName: "English", region: "GB" },
  { code: "de", endonym: "Deutsch", englishName: "German", region: "DE" },
  { code: "es-419", endonym: "Español (Latinoamérica)", englishName: "Spanish (Latin America)", region: "MX" },
  { code: "es", endonym: "Español", englishName: "Spanish", region: "ES" },
  { code: "fr", endonym: "Français", englishName: "French", region: "FR" },
  { code: "pt", endonym: "Português", englishName: "Portuguese", region: "BR" },
  { code: "it", endonym: "Italiano", englishName: "Italian", region: "IT" },
  { code: "ja", endonym: "日本語", englishName: "Japanese", region: "JP" },
  { code: "ko", endonym: "한국어", englishName: "Korean", region: "KR" },
  { code: "pl", endonym: "Polski", englishName: "Polish", region: "PL" },
  { code: "ru", endonym: "Русский", englishName: "Russian", region: "RU" },
  { code: "th", endonym: "ไทย", englishName: "Thai", region: "TH" },
  { code: "zh-Hant", endonym: "繁體中文", englishName: "Chinese (Traditional)", region: "TW" },
  { code: "zh-Hans", endonym: "简体中文", englishName: "Chinese (Simplified)", region: "CN" },
];

export const SUPPORTED_LANGUAGE_CODES: string[] = SUPPORTED_LANGUAGES.map((l) => l.code);

/** localStorage key the chosen language is cached under. A `storage` event on it
 *  is also the cross-window/-tab signal that re-applies the language live. */
export const LANGUAGE_STORAGE_KEY = "elden-ring-atlas:lang";

/** Resolve any raw browser / OS / Overwolf tag to one of our supported codes. */
export const normalizeLanguage = (raw: string | null | undefined): string => {
  if (!raw) return FALLBACK_LANGUAGE;
  const tag = raw.toLowerCase();
  if (tag.startsWith("zh-hant") || tag.startsWith("zh-tw") || tag.startsWith("zh-hk") || tag.startsWith("zh-mo")) {
    return "zh-Hant";
  }
  if (tag.startsWith("zh")) return SUPPORTED_LANGUAGE_CODES.includes("zh-Hans") ? "zh-Hans" : FALLBACK_LANGUAGE;
  if (tag === "es-419") return "es-419";
  const spanishLatinAmericaRegions = [
    "ar", "bo", "cl", "co", "cr", "cu", "do", "ec", "gt", "hn", "mx", "ni", "pa", "pe", "pr", "py", "sv", "us",
    "uy", "ve",
  ];
  if (tag.startsWith("es-") && spanishLatinAmericaRegions.includes(tag.split("-")[1])) return "es-419";
  const exact = SUPPORTED_LANGUAGE_CODES.find((c) => c.toLowerCase() === tag);
  if (exact) return exact;
  const base = tag.split("-")[0];
  const byBase = SUPPORTED_LANGUAGE_CODES.find((c) => c.toLowerCase().split("-")[0] === base);
  return byBase ?? FALLBACK_LANGUAGE;
};
