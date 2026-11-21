import { useCallback, useEffect, useSyncExternalStore } from "react";
import { GAME_CONFIG } from "../game-config";
import { contentUrl } from "../lib/content-url";
import { useAppLanguage } from "./app-language";

interface PackedValues {
  version: number;
  values: (string | null)[];
}

interface PackedSource extends PackedValues {
  keys: string[];
}

interface ItemKeyIndex {
  version: number;
  entries: Record<string, number>;
}

interface GameDictionary {
  byKey: Map<string, string>;
  byEnglish: Map<string, string>;
  byItemId: Map<string, string>;
}

const dictionaries = new Map<string, GameDictionary>();
const requests = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let revision = 0;
let sourceRequest: Promise<PackedSource> | undefined;
let itemIndexRequest: Promise<ItemKeyIndex | undefined> | undefined;

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

const getSnapshot = () => revision;
const getServerSnapshot = () => 0;

async function fetchPack<T>(file: string): Promise<T> {
  const directory = GAME_CONFIG.gameLocaleDirectory;
  if (!directory) throw new Error("Game locale directory is not configured");
  const response = await fetch(contentUrl(`${directory}/${file}`));
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

function loadItemIndex(): Promise<ItemKeyIndex | undefined> {
  if (!GAME_CONFIG.itemLocaleIndexFile) return Promise.resolve(undefined);
  itemIndexRequest ??= fetchPack<ItemKeyIndex>(GAME_CONFIG.itemLocaleIndexFile).then((index) => {
    if (index.version !== 1 || !index.entries || typeof index.entries !== "object") {
      throw new Error("Invalid item locale index");
    }
    return index;
  }).catch((error: unknown) => { itemIndexRequest = undefined; throw error; });
  return itemIndexRequest;
}

export function createGameDictionary(source: PackedSource, translated: PackedValues, itemIndex?: ItemKeyIndex): GameDictionary {
  if (translated.version !== 1 || !Array.isArray(translated.values) ||
    translated.values.length !== source.keys.length) {
    throw new Error("Invalid game locale translation");
  }
  const byKey = new Map<string, string>();
  const byEnglish = new Map<string, string>();
  const byItemId = new Map<string, string>();
  const conflicts = new Set<string>();
  for (let index = 0; index < source.keys.length; index += 1) {
    const key = source.keys[index];
    const english = source.values[index];
    const value = translated.values[index];
    if (typeof key !== "string" || (english !== null && typeof english !== "string")
      || (value !== null && typeof value !== "string")) {
      throw new Error(`Invalid game locale entry at index ${index}`);
    }
    if (!value) continue;
    byKey.set(key, value);
    if (!english || conflicts.has(english)) continue;
    const existing = byEnglish.get(english);
    if (existing !== undefined && existing !== value) {
      byEnglish.delete(english);
      conflicts.add(english);
    } else {
      byEnglish.set(english, value);
    }
  }
  for (const [itemId, index] of Object.entries(itemIndex?.entries ?? {})) {
    if (!/^\d+$/.test(itemId) || !Number.isInteger(index) || index < 0 || index >= source.keys.length) {
      throw new Error(`Invalid item locale index entry: ${itemId}`);
    }
    const value = translated.values[index];
    if (value) byItemId.set(itemId, value);
  }
  return { byKey, byEnglish, byItemId };
}

export function loadGameText(language: string): Promise<void> {
  if (language === "en" || !GAME_CONFIG.gameLocaleDirectory) return Promise.resolve();
  const locale = GAME_CONFIG.gameLocaleCodes?.[language];
  if (!locale) return Promise.reject(new Error(`Missing game locale mapping: ${language}`));
  if (dictionaries.has(language)) return Promise.resolve();
  let request = requests.get(language);
  if (!request) {
    request = Promise.all([loadSource(), fetchPack<PackedValues>(`${locale}.json`), loadItemIndex()]).then(([source, translated, itemIndex]) => {
      dictionaries.set(language, createGameDictionary(source, translated, itemIndex));
      revision += 1;
      listeners.forEach((listener) => listener());
    }).catch((error: unknown) => { requests.delete(language); throw error; });
    requests.set(language, request);
  }
  return request;
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
  return useCallback((english: string, key?: string): string => {
    return (key && (dictionary?.byItemId.get(key) || dictionary?.byKey.get(key)))
      || dictionary?.byEnglish.get(english) || english;
  }, [dictionary]);
}
