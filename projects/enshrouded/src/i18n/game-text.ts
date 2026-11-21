import { useCallback, useEffect, useSyncExternalStore } from "react";
import { GAME_CONFIG } from "../game-config";
import { contentUrl } from "../lib/content-url";
import { fetchLocaleJson } from "./fetch-locale-json";
import { useAppLanguage } from "./app-language";
import { createGameDictionary, translateDisplayValue, type GameDictionary, type PackedSource, type PackedValues } from "./game-dictionary";

const dictionaries = new Map<string, GameDictionary>();
const contentDictionaries = new Map<string, GameDictionary>();
const requests = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let revision = 0;
let sourceRequest: Promise<PackedSource> | undefined;
let contentSourceRequest: Promise<PackedSource> | undefined;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = () => revision;
const getServerSnapshot = () => 0;

async function fetchPack<T>(file: string, directory = GAME_CONFIG.gameLocaleDirectory): Promise<T> {
  if (!directory) throw new Error("Game locale directory is not configured");
  const path = `${directory.replace(/^\/+|\/+$/g, "")}/${file}`;
  return fetchLocaleJson<T>(contentUrl(path), `${import.meta.env?.BASE_URL ?? "/"}${path}`);
}

function loadSource(): Promise<PackedSource> {
  sourceRequest ??= fetchPack<PackedSource>("source.json").then((source) => {
    if (source.version !== 1 || !Array.isArray(source.keys) ||
      !Array.isArray(source.values) || source.keys.length !== source.values.length) {
      throw new Error("Invalid game locale source");
    }
    return source;
  }).catch((error: unknown) => { sourceRequest = undefined; throw error; });
  return sourceRequest;
}

export function loadGameText(language: string): Promise<void> {
  if (language === "en" || !GAME_CONFIG.gameLocaleDirectory) return Promise.resolve();
  const locale = GAME_CONFIG.gameLocaleCodes?.[language];
  if (!locale) return Promise.reject(new Error(`Missing game locale mapping: ${language}`));
  if (dictionaries.has(language) && (!GAME_CONFIG.contentLocaleDirectory || contentDictionaries.has(language))) return Promise.resolve();
  let request = requests.get(language);
  if (!request) {
    request = Promise.all([loadSource(), fetchPack<PackedValues>(`${locale}.json`)]).then(([source, translated]) => {
      dictionaries.set(language, createGameDictionary(source, translated));
      return loadContentText(language);
    }).then(() => {
      revision += 1;
      listeners.forEach((listener) => listener());
    }).catch((error: unknown) => { requests.delete(language); throw error; });
    requests.set(language, request);
  }
  return request;
}

async function loadContentText(language: string): Promise<void> {
  const directory = GAME_CONFIG.contentLocaleDirectory;
  if (!directory) return;
  contentSourceRequest ??= fetchPack<PackedSource>("source.json", directory)
    .catch((error: unknown) => { contentSourceRequest = undefined; throw error; });
  const [source, translated] = await Promise.all([contentSourceRequest,
    fetchPack<PackedValues>(`${language.toLowerCase()}.json`, directory)]);
  contentDictionaries.set(language, createGameDictionary(source, translated));
}

export function useGameText() {
  const language = useAppLanguage();
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void loadGameText(language).catch((error: unknown) => {
      console.error("Failed to load game text", error);
    });
  }, [language]);
  const dictionary = dictionaries.get(language);
  const content = contentDictionaries.get(language);
  return useCallback(<T,>(english: T, key?: string): T =>
    translateDisplayValue(english, dictionary, content, key), [dictionary, content]);
}
