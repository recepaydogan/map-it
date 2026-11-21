import { useEffect, useState } from "react";
import { GAME_CONFIG } from "../game-config";
import { contentUrl } from "../lib/content-url";
import { useAppLanguage } from "./app-language";
import { createQuestTextDictionary, getQuestText, type QuestTextEntry,
  type QuestTextPack, type QuestTextSource } from "./quest-text-dictionary";

const dictionaries = new Map<string, Map<string, QuestTextEntry>>();
const requests = new Map<string, Promise<void>>();
let sourceRequest: Promise<QuestTextSource> | undefined;

async function fetchPack<T>(file: string): Promise<T> {
  const directory = GAME_CONFIG.gameLocaleDirectory;
  if (!directory) throw new Error("Game locale directory is not configured");
  const response = await fetch(contentUrl(`${directory.replace(/^\/+|\/+$/g, "")}/${file}`));
  if (!response.ok) throw new Error(`Quest locale ${file}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function loadSource() {
  sourceRequest ??= fetchPack<QuestTextSource>("quest-text-source.json")
    .catch((error: unknown) => { sourceRequest = undefined; throw error; });
  return sourceRequest;
}

export function loadQuestText(language: string): Promise<void> {
  if (language === "en") return Promise.resolve();
  const locale = GAME_CONFIG.gameLocaleCodes?.[language];
  if (!locale) return Promise.reject(new Error(`Missing game locale mapping: ${language}`));
  if (dictionaries.has(language)) return Promise.resolve();
  let request = requests.get(language);
  if (!request) {
    request = Promise.all([loadSource(), fetchPack<QuestTextPack>(`quest-text-${locale}.json`)])
      .then(([source, translated]) => {
        dictionaries.set(language, createQuestTextDictionary(source, translated));
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
  return (id: string | undefined, field: "description" | "objective", english: string | undefined) =>
    getQuestText(dictionaries.get(language), id, field, english);
}
