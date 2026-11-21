import { useEffect, useState } from "react";
import { GAME_CONFIG } from "../game-config";
import { fetchGameLocalePack } from "./locale-content";
import { useAppLanguage } from "./app-language";
import { createQuestTextDictionary, getQuestText, type QuestTextEntry,
  mergeWowheadQuestProse, type QuestTextField, type QuestTextPack,
  type QuestTextSource, type WowheadQuestProsePack } from "./quest-text-dictionary";

const dictionaries = new Map<string, Map<string, QuestTextEntry>>();
const requests = new Map<string, Promise<void>>();
let sourceRequest: Promise<QuestTextSource> | undefined;
let fallbackRequest: Promise<{ version: number; locales: Record<string, Record<string, string>> }> | undefined;
let wowheadRequest: Promise<WowheadQuestProsePack> | undefined;
const wowheadLocaleRequests = new Map<string, Promise<WowheadQuestProsePack>>();
const wowheadObjectiveRequests = new Map<string, Promise<WowheadQuestProsePack>>();

const fetchPack = fetchGameLocalePack;

function loadSource() {
  sourceRequest ??= fetchPack<QuestTextSource>("quest-text-source.json")
    .catch((error: unknown) => { sourceRequest = undefined; throw error; });
  return sourceRequest;
}

function loadFallbacks() {
  fallbackRequest ??= fetchPack<{ version: number; locales: Record<string, Record<string, string>> }>(
    "quest-text-app-fallbacks.json",
  ).then((pack) => {
    if (pack.version !== 1 || !pack.locales) throw new Error("Invalid quest text fallbacks");
    return pack;
  }).catch((error: unknown) => { fallbackRequest = undefined; throw error; });
  return fallbackRequest;
}

function loadWowheadProse() {
  wowheadRequest ??= fetchPack<WowheadQuestProsePack>("quest-prose-wowhead.json")
    .catch((error: unknown) => { wowheadRequest = undefined; throw error; });
  return wowheadRequest;
}

function loadWowheadLocaleProse(locale: string) {
  let request = wowheadLocaleRequests.get(locale);
  if (!request) {
    request = fetchPack<WowheadQuestProsePack>(`quest-prose-wowhead-${locale}.json`)
      .catch((error: unknown) => { wowheadLocaleRequests.delete(locale); throw error; });
    wowheadLocaleRequests.set(locale, request);
  }
  return request;
}

function loadWowheadObjectives(locale: string) {
  let request = wowheadObjectiveRequests.get(locale);
  if (!request) {
    request = fetchPack<WowheadQuestProsePack>(`quest-objective-wowhead-${locale}.json`)
      .catch((error: unknown) => { wowheadObjectiveRequests.delete(locale); throw error; });
    wowheadObjectiveRequests.set(locale, request);
  }
  return request;
}

export function loadQuestText(language: string): Promise<void> {
  if (language === "en") return Promise.resolve();
  const locale = GAME_CONFIG.gameLocaleCodes?.[language];
  if (!locale) return Promise.reject(new Error(`Missing game locale mapping: ${language}`));
  if (dictionaries.has(language)) return Promise.resolve();
  let request = requests.get(language);
  if (!request) {
    request = Promise.all([loadSource(), fetchPack<QuestTextPack>(`quest-text-${locale}.json`),
      loadFallbacks(), loadWowheadProse(), loadWowheadLocaleProse(locale), loadWowheadObjectives(locale)])
      .then(([source, translated, fallbackPack, wowheadProse, wowheadLocaleProse, objectives]) => {
        const fallbacks = fallbackPack.locales[locale];
        if (!fallbacks) throw new Error(`Missing quest text fallbacks: ${locale}`);
        const dictionary = createQuestTextDictionary(source, translated, fallbacks);
        mergeWowheadQuestProse(dictionary, objectives, locale);
        mergeWowheadQuestProse(dictionary, wowheadLocaleProse, locale);
        dictionaries.set(language, mergeWowheadQuestProse(dictionary, wowheadProse, locale));
      }).catch((error: unknown) => { requests.delete(language); throw error; });
    requests.set(language, request);
  }
  return request;
}

export function useQuestText() {
  const language = useAppLanguage();
  const [, refresh] = useState(0);
  useEffect(() => {
    if (language === "en") return;
    let active = true;
    void loadQuestText(language).then(() => { if (active) refresh((value) => value + 1); })
      .catch((error: unknown) => console.error("Failed to load quest text", error));
    return () => { active = false; };
  }, [language]);
  return (id: string | undefined, field: QuestTextField, english: string | undefined) =>
    getQuestText(dictionaries.get(language), id, field, english);
}
