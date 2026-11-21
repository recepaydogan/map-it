import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface ForeverDbClassGuide {
  roles: string[];
  racePicks: { alliance: string[]; horde: string[] };
}

interface GuideIndex {
  version: 1;
  entries: Record<string, ForeverDbClassGuide>;
}

let cached: GuideIndex | null = null;
let pending: Promise<GuideIndex> | null = null;

const loadGuides = () => {
  if (cached) return Promise.resolve(cached);
  pending ??= fetch(contentUrl("data/classes/foreverdb-guides.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Class guides: HTTP ${response.status}`);
      const value = await response.json() as GuideIndex;
      if (value.version !== 1 || !value.entries) throw new Error("Invalid class guide format");
      cached = value;
      return value;
    })
    .catch((error: unknown) => { pending = null; throw error; });
  return pending;
};

export const useForeverDbClassGuides = () => {
  const [data, setData] = useState<GuideIndex | null>(cached);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadGuides().then((value) => { if (active) setData(value); }).catch((cause: unknown) => {
      console.error("Failed to load class guides", cause);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);
  return { entries: data?.entries, error };
};
