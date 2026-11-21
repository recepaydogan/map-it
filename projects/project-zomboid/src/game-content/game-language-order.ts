const GAME_LANGUAGE_POPULARITY = [
  "en",
  "zh-Hans",
  "es",
  "fr",
  "de",
  "pt-BR",
  "ru",
  "ja",
  "ko",
  "it",
  "tr",
  "pl",
  "id",
  "nl",
  "uk",
  "th",
  "es-MX",
  "es-AR",
  "es-CL",
  "pt",
  "zh-Hant",
  "cs",
  "ro",
  "hu",
  "da",
  "fi",
  "no",
  "ca",
] as const;

const popularityByLanguage = new Map<string, number>(
  GAME_LANGUAGE_POPULARITY.map((language, index) => [language, index]),
);

export const sortGameLanguagesByPopularity = <T extends { code: string }>(
  languages: T[],
) => [...languages].sort((left, right) =>
  (popularityByLanguage.get(left.code) ?? Number.MAX_SAFE_INTEGER)
  - (popularityByLanguage.get(right.code) ?? Number.MAX_SAFE_INTEGER));
