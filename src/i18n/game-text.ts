import { useEffect, useSyncExternalStore } from "react";
import { GAME_CONFIG } from "../game-config";
import { contentUrl } from "../lib/content-url";
import { useAppLanguage } from "./app-language";
import { createGameDictionary, type GameDictionary, type PackedSource, type PackedValues } from "./game-dictionary";
import { createMapEntityDictionary, getMapEntityText, type MapEntityEntry } from "./map-entity-text";
import { createNativeGameDictionary, nativeGameText, type NativeGameDictionary } from "./native-game-dictionary";
export { createGameDictionary } from "./game-dictionary";

const dictionaries = new Map<string, GameDictionary>();
const nativeDictionaries = new Map<string, NativeGameDictionary>();
export const getGameTextRevision = () => revision;
const mapEntities = new Map<string, Map<string, MapEntityEntry>>();
const requests = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let revision = 0;
let sourceRequest: Promise<PackedSource> | undefined;
let mapFallbackRequest: Promise<{ version: number; locales: Record<string, Record<string, string>> }> | undefined;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = () => revision;
const getServerSnapshot = () => 0;

async function fetchPack<T>(file: string): Promise<T> {
  const directory = GAME_CONFIG.gameLocaleDirectory;
  if (!directory) throw new Error("Game locale directory is not configured");
  const response = await fetch(contentUrl(`${directory.replace(/^\/+|\/+$/g, "")}/${file}`));
  if (!response.ok) throw new Error(`Game locale ${file}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
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

function loadMapFallbacks() {
  mapFallbackRequest ??= fetchPack<{ version: number; locales: Record<string, Record<string, string>> }>(
    "map-entity-app-fallbacks.json",
  ).then((pack) => {
    if (pack.version !== 1 || !pack.locales) throw new Error("Invalid map entity fallbacks");
    return pack;
  }).catch((error: unknown) => { mapFallbackRequest = undefined; throw error; });
  return mapFallbackRequest;
}

export function loadGameText(language: string): Promise<void> {
  if (language === "en" || !GAME_CONFIG.gameLocaleDirectory) return Promise.resolve();
  const locale = GAME_CONFIG.gameLocaleCodes?.[language];
  if (!locale) return Promise.reject(new Error(`Missing game locale mapping: ${language}`));
  if (dictionaries.has(language)) return Promise.resolve();
  let request = requests.get(language);
  if (!request) {
    if (GAME_CONFIG.gameLocaleFormat === "native") {
      request = Promise.all([loadSource(), fetchPack<PackedValues>(`${locale}.json`)]).then(([source, translated]) => {
        const dictionary = createNativeGameDictionary(source, translated);
        nativeDictionaries.set(language, dictionary);
        dictionaries.set(language, dictionary);
        revision += 1;
        listeners.forEach(listener => listener());
      }).catch((error: unknown) => { requests.delete(language); throw error; });
      requests.set(language, request);
      return request;
    }
    request = Promise.all([loadSource(), fetchPack<PackedValues>(`${locale}.json`),
      fetchPack<PackedSource>("map-entity-source.json"),
      fetchPack<PackedValues>(`map-entity-${locale}.json`), loadMapFallbacks()])
      .then(([source, translated, entitySource, entityPack, fallbackPack]) => {
      const fallbacks = fallbackPack.locales[locale];
      if (!fallbacks) throw new Error(`Missing map entity fallbacks: ${locale}`);
      mapEntities.set(language, createMapEntityDictionary(entitySource, entityPack, fallbacks));
      dictionaries.set(language, createGameDictionary(source, translated));
      revision += 1;
      listeners.forEach((listener) => listener());
    }).catch((error: unknown) => { requests.delete(language); throw error; });
    requests.set(language, request);
  }
  return request;
}

/** Lookup for data loaders that cannot use a React hook. */
export function getGameText(language: string, english: string, key?: string): string {
  const native = nativeDictionaries.get(language);
  if (native) return nativeGameText(native, english, key);
  const dictionary = dictionaries.get(language);
  return (key ? dictionary?.byKey.get(key) : undefined)
    ?? getMapEntityText(mapEntities.get(language), english, key)
    ?? (key?.startsWith("Quest:") ? english : dictionary?.byEnglish.get(english)) ?? english;
}

export function useGameText() {
  const language = useAppLanguage();
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    void loadGameText(language).catch((error: unknown) => {
      console.error("Failed to load game text", error);
    });
  }, [language]);
  return (english: string, key?: string): string => {
    return getGameText(language, english, key);
  };
}
