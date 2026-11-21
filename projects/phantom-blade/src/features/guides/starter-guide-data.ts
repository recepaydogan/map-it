import { useEffect, useState } from "react";
import { useAppLanguage } from "../../i18n/app-language";
import { contentUrl } from "../../lib/content-url";

export interface StarterGuideSummary {
  id: string;
  group: string;
  title: string;
  intro: string;
  menuLabel?: string;
  headings: { id: string; title: string; depth: number }[];
}

export interface StarterGuide extends StarterGuideSummary {
  html: string;
}

let indexRequest: Promise<StarterGuideSummary[]> | null = null;
const localizedIndexRequests = new Map<string, Promise<StarterGuideSummary[]>>();
const guideRequests = new Map<string, Promise<StarterGuide>>();

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(contentUrl(path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function loadStarterGuideIndex(language = "en") {
  indexRequest ??= getJson<{ version: number; guides: StarterGuideSummary[] }>("data/guides/index.json")
    .then((data) => {
      if (data.version !== 1 || !Array.isArray(data.guides)) throw new Error("Incomplete starter guide index");
      return data.guides;
    })
    .catch((error: unknown) => { indexRequest = null; throw error; });
  if (language === "en") return indexRequest;
  if (!localizedIndexRequests.has(language)) {
    const request = Promise.all([
      indexRequest,
      getJson<{ version: number; summaries: Record<string, { title: string; intro: string; menuLabel?: string }> }>(
        `data/guides/locales/${language}/index.json`),
    ]).then(([english, localized]) => {
      if (localized.version !== 1 || Object.keys(localized.summaries).length !== english.length) {
        throw new Error(`Incomplete ${language} guide summaries`);
      }
      return english.map((entry) => {
        const translation = localized.summaries[entry.id];
        if (!translation?.title?.trim() || !translation.intro?.trim() ||
          (entry.group === "class" && !translation.menuLabel?.trim())) {
          throw new Error(`Missing ${language} guide summary: ${entry.id}`);
        }
        return { ...entry, ...translation };
      });
    }).catch((error: unknown) => { localizedIndexRequests.delete(language); throw error; });
    localizedIndexRequests.set(language, request);
  }
  return localizedIndexRequests.get(language)!;
}

export function loadStarterGuide(id: string, language = "en") {
  if (!/^[a-z0-9-]+$/.test(id)) return Promise.reject(new Error("Invalid guide ID"));
  const key = `${language}/${id}`;
  if (!guideRequests.has(key)) {
    const path = language === "en" ? `data/guides/${id}.json` : `data/guides/locales/${language}/${id}.json`;
    guideRequests.set(key, getJson<StarterGuide>(path).then((data) => {
      if (data.id !== id || !data.html || data.headings.length < 3) throw new Error(`Incomplete guide ${id}`);
      return data;
    }).catch((error: unknown) => { guideRequests.delete(key); throw error; }));
  }
  return guideRequests.get(key)!;
}

export function useStarterGuideIndex() {
  const language = useAppLanguage();
  const [state, setState] = useState<{ language: string; rows: StarterGuideSummary[] | null; error: boolean }>(
    { language, rows: null, error: false });
  useEffect(() => {
    let active = true;
    void loadStarterGuideIndex(language).then((rows) => { if (active) setState({ language, rows, error: false }); }).catch(() => { if (active) setState({ language, rows: null, error: true }); });
    return () => { active = false; };
  }, [language]);
  return state.language === language ? state : { rows: null, error: false };
}

export function useStarterGuide(id: string) {
  const language = useAppLanguage();
  const [state, setState] = useState<{ key: string; guide: StarterGuide | null; error: boolean }>({ key: "", guide: null, error: false });
  const key = `${language}/${id}`;
  useEffect(() => {
    let active = true;
    void loadStarterGuide(id, language).then((guide) => { if (active) setState({ key, guide, error: false }); }).catch(() => { if (active) setState({ key, guide: null, error: true }); });
    return () => { active = false; };
  }, [id, key, language]);
  return state.key === key ? { guide: state.guide, error: state.error } : { guide: null, error: false };
}
