import { useCallback, useEffect, useSyncExternalStore } from "react";
import { GAME_CONFIG } from "../../game-config";
import { useAppLanguage } from "../../i18n/app-language";
import { fetchGameLocalePack } from "../../i18n/locale-content";

export interface LocalizedSpellText {
  r?: string;
  d?: string;
  a?: string;
  old?: string;
}

interface SpellTooltipPack {
  version: number;
  clientBuild: number;
  locale: string;
  entries: Record<string, LocalizedSpellText>;
}

const packs = new Map<string, SpellTooltipPack>();
const requests = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
let revision = 0;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};

export function loadSpellTooltipLocales(language: string): Promise<void> {
  if (language === "en" || !GAME_CONFIG.gameLocaleDirectory || packs.has(language)) {
    return Promise.resolve();
  }
  const locale = GAME_CONFIG.gameLocaleCodes?.[language];
  if (!locale) return Promise.reject(new Error(`Missing game locale mapping: ${language}`));
  let request = requests.get(language);
  if (!request) {
    request = fetchGameLocalePack<SpellTooltipPack>(`spell-tooltip-${locale}.json`).then((pack) => {
      if (pack.version !== 1 || pack.locale !== locale || !pack.entries) {
        throw new Error(`Invalid spell tooltip locale ${locale}`);
      }
      packs.set(language, pack);
      revision += 1;
      listeners.forEach((listener) => listener());
    }).catch((error: unknown) => { requests.delete(language); throw error; });
    requests.set(language, request);
  }
  return request;
}

export function useLocalizedSpellText() {
  const language = useAppLanguage();
  useSyncExternalStore(subscribe, () => revision, () => 0);
  useEffect(() => {
    void loadSpellTooltipLocales(language).catch((error: unknown) => {
      console.error("Failed to load localized spell text", error);
    });
  }, [language]);
  const pack = packs.get(language);
  return useCallback((id: number): LocalizedSpellText | undefined =>
    pack?.entries[id], [pack]);
}
