import { GAME_GUIDE_LANGUAGE_SOURCE } from "../../game-config.ts";
import english from "./guide-names.json" with { type: "json" };
import { KNOWLEDGE_DATA_BASE_URL } from "./knowledge-data-url.ts";

type Dictionary = Record<string, string>;
const dictionaries = new Map<string, Dictionary>([["en", english]]);
const pending = new Map<string, Promise<void>>();

export const gameLanguageName = (language: string, key: string): string | undefined =>
  dictionaries.get(language)?.[key] ?? english[key as keyof typeof english];

export const loadGameLanguage = (language: string): Promise<void> => {
  if (dictionaries.has(language)) return Promise.resolve();
  const existing = pending.get(language);
  if (existing) return existing;
  if (!Object.hasOwn(GAME_GUIDE_LANGUAGE_SOURCE.localeCodes, language))
    return Promise.reject(new Error(`Unsupported game language: ${language}`));

  const request = (async () => {
    const path = `${KNOWLEDGE_DATA_BASE_URL}/java/${GAME_GUIDE_LANGUAGE_SOURCE.version}/languages/${language}.json`;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Game language load failed: ${path} (${response.status})`);
    const dictionary: unknown = await response.json();
    if (!dictionary || typeof dictionary !== "object" || Array.isArray(dictionary)
      || Object.values(dictionary).some(value => typeof value !== "string"))
      throw new Error(`Invalid game language dictionary: ${path}`);
    dictionaries.set(language, dictionary as Dictionary);
  })();
  pending.set(language, request);
  void request.then(() => pending.delete(language), () => pending.delete(language));
  return request;
};
