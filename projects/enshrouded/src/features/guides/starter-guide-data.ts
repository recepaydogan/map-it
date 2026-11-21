import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface StarterGuideSummary {
  id: string;
  group: string;
  title: string;
  intro: string;
  headings: { id: string; title: string; depth: number }[];
}

export interface StarterGuide extends StarterGuideSummary {
  html: string;
}

let indexRequest: Promise<StarterGuideSummary[]> | null = null;
const guideRequests = new Map<string, Promise<StarterGuide>>();

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(contentUrl(path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export function loadStarterGuideIndex() {
  indexRequest ??= getJson<{ version: number; guides: StarterGuideSummary[] }>("data/guides/index.json")
    .then((data) => {
      if (data.version !== 1 || data.guides.length < 14) throw new Error("Incomplete starter guide index");
      return data.guides;
    })
    .catch((error: unknown) => { indexRequest = null; throw error; });
  return indexRequest;
}

export function loadStarterGuide(id: string) {
  if (!/^[a-z0-9-]+$/.test(id)) return Promise.reject(new Error("Invalid guide ID"));
  if (!guideRequests.has(id)) {
    guideRequests.set(id, getJson<StarterGuide>(`data/guides/${id}.json`).then((data) => {
      if (data.id !== id || !data.html || data.headings.length < 3) throw new Error(`Incomplete guide ${id}`);
      return data;
    }).catch((error: unknown) => { guideRequests.delete(id); throw error; }));
  }
  return guideRequests.get(id)!;
}

export function useStarterGuideIndex() {
  const [state, setState] = useState<{ rows: StarterGuideSummary[] | null; error: boolean }>({ rows: null, error: false });
  useEffect(() => {
    let active = true;
    void loadStarterGuideIndex().then((rows) => { if (active) setState({ rows, error: false }); }).catch(() => { if (active) setState({ rows: null, error: true }); });
    return () => { active = false; };
  }, []);
  return state;
}

export function useStarterGuide(id: string) {
  const [state, setState] = useState<{ id: string; guide: StarterGuide | null; error: boolean }>({ id: "", guide: null, error: false });
  useEffect(() => {
    let active = true;
    void loadStarterGuide(id).then((guide) => { if (active) setState({ id, guide, error: false }); }).catch(() => { if (active) setState({ id, guide: null, error: true }); });
    return () => { active = false; };
  }, [id]);
  return state.id === id ? { guide: state.guide, error: state.error } : { guide: null, error: false };
}
