import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface ProfessionLevelingCraftStep {
  from: number;
  to: number;
  recipeName: string;
  crafts?: number;
  approximate?: boolean;
}

export interface ProfessionLevelingGatherStep {
  from: number;
  to: number;
  targets: string[];
}

export type ProfessionLevelingGuide =
  | { kind: "crafting"; steps: ProfessionLevelingCraftStep[]; hordeDifferences: ProfessionLevelingCraftStep[]; routeFaction: "Alliance"; sourceUrl: string; sourceBuild: string; maxSkill: number; betaCap: number }
  | { kind: "gathering"; steps: ProfessionLevelingGatherStep[]; sourceUrl: string; maxSkill: number };

interface ProfessionLevelingCatalog {
  version: 4;
  guides: Record<string, ProfessionLevelingGuide>;
}

let request: Promise<ProfessionLevelingCatalog> | null = null;
const routePath = "data/professions/leveling.json";

const fetchGuide = async (url: string): Promise<ProfessionLevelingCatalog> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Profession leveling: HTTP ${response.status}`);
  const data = await response.json() as ProfessionLevelingCatalog;
  if (data.version !== 4 || !data.guides) throw new Error("Invalid profession leveling guide");
  return data;
};

const load = () => {
  const remoteUrl = contentUrl(routePath);
  const bundledUrl = `${import.meta.env?.BASE_URL ?? "/"}${routePath}`;
  request ??= fetchGuide(remoteUrl).catch((error: unknown) => {
    if (remoteUrl === bundledUrl) throw error;
    return fetchGuide(bundledUrl);
  }).catch((error: unknown) => { request = null; throw error; });
  return request;
};

export const useProfessionLeveling = (id: string) => {
  const [state, setState] = useState<{ id: string; guide: ProfessionLevelingGuide | null; error: boolean; missing: boolean }>({ id: "", guide: null, error: false, missing: false });
  useEffect(() => {
    if (id === "camping") return;
    let active = true;
    void load().then((data) => {
      if (active) setState({ id, guide: data.guides[id] ?? null, error: false, missing: !data.guides[id] });
    }).catch(() => { if (active) setState({ id, guide: null, error: true, missing: false }); });
    return () => { active = false; };
  }, [id]);
  return state.id === id ? { guide: state.guide, error: state.error, missing: state.missing } : { guide: null, error: false, missing: false };
};
