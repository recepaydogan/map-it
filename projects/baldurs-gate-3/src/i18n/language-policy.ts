export const DEFAULT_LANGUAGE = "en";
export const ENABLED_LANGUAGES: readonly string[] = [DEFAULT_LANGUAGE];

/** Keep stored preferences and programmatic switches within enabled locales. */
export const normalizeLanguage = (language: string | null | undefined) =>
  language && ENABLED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
