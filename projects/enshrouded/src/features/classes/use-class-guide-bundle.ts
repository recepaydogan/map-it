import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export interface GuideStep { spell?: string; ability?: string; note: string }
export interface ClassGuideSpec {
  tree: string;
  role: string;
  summary: string;
  stats: string[];
  weights: Record<string, number>;
  rotation: { opener?: GuideStep[]; single?: GuideStep[]; aoe?: GuideStep[] };
  cooldowns?: GuideStep[];
  keyTalents?: string[];
  forever?: string;
  tips?: string[];
}
export interface PlayGuideMode {
  summary: string;
  role?: string;
  builds?: Record<string, string>;
  opener?: GuideStep[];
  cooldowns?: GuideStep[];
  burst?: GuideStep[];
  control?: GuideStep[];
  defensive?: GuideStep[];
  stats?: { order: string[]; why: string };
  weights?: Record<string, number>;
  tips?: string[];
  battlegrounds?: string;
  world?: string;
  matchups?: { vs: string; note: string }[];
  at30?: { notes: string; adds?: GuideStep[] };
}
export interface ClassBuild {
  id: string;
  level: number;
  purpose: string;
  title: string;
  summary: string;
  points: Record<string, number>;
  why: Record<string, string>;
  playstyle: string;
}
export interface ClassGuideTalent {
  id: number;
  row: number;
  col: number;
  n: string;
  ic: number;
  lv: number;
  ranks: number[];
  pre: [number, number][];
}
export interface ClassGuideTalentTree {
  n: string;
  ic: number;
  talents: ClassGuideTalent[];
}
export interface ClassGuideBundle {
  classId: string;
  guide: { overview: string; specs: ClassGuideSpec[] };
  play: { specs: Record<string, { pve: PlayGuideMode; pvp: PlayGuideMode }> };
  builds: { specs: Record<string, { role: string; builds: ClassBuild[]; rotations: Record<string, { single?: GuideStep[]; aoe?: GuideStep[]; cooldowns?: GuideStep[]; notes?: string }> }> };
  stats: Record<string, string>;
  gameBuild: { version: string; cap: number; nextCap?: number };
  spellNames: Map<string, { id: number; iconId: number; level: number; talent: boolean; talentId?: number }>;
  talentsById: Map<string, { name: string; spellId: number }>;
  talentTrees: ClassGuideTalentTree[];
}

interface ClassMetadata {
  n: string;
  abilities: { n: string; lv: number; ranks: { id: number; ic: number }[] }[];
  trees: ClassGuideTalentTree[];
}

const root = "data/classes/guides";
const requests = new Map<string, Promise<ClassGuideBundle>>();
let sharedRequest: Promise<[
  { classes: Record<string, { overview: string; specs: ClassGuideSpec[] }> },
  Record<string, string>,
  { version: string; cap: number; nextCap?: number },
  ClassMetadata[],
]> | null = null;

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(contentUrl(path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

function shared() {
  sharedRequest ??= Promise.all([
    getJson<{ classes: Record<string, { overview: string; specs: ClassGuideSpec[] }> }>(`${root}/class-guides.json`),
    getJson<Record<string, string>>(`${root}/stats.json`),
    getJson<{ version: string; cap: number; nextCap?: number }>(`${root}/game-build.json`),
    getJson<ClassMetadata[]>("data/spells/foreverdb/classes.json"),
  ]).catch((error: unknown) => { sharedRequest = null; throw error; });
  return sharedRequest;
}

const load = (id: string) => {
  if (!requests.has(id)) requests.set(id, Promise.all([
    shared(),
    getJson<ClassGuideBundle["play"]>(`${root}/${id}-play.json`),
    getJson<ClassGuideBundle["builds"]>(`${root}/${id}-builds.json`),
  ]).then(([[all, stats, gameBuild, classes], play, builds]) => {
    const cls = classes.find((entry) => entry.n.toLowerCase() === id);
    const guide = all.classes[cls?.n ?? ""];
    if (!cls || !guide || guide.specs.length !== 3) throw new Error(`Incomplete class guide for ${id}`);
    const spellNames = new Map<string, { id: number; iconId: number; level: number; talent: boolean; talentId?: number }>();
    const talentsById = new Map<string, { name: string; spellId: number }>();
    for (const ability of cls.abilities) {
      if (ability.ranks[0]) spellNames.set(ability.n, { id: ability.ranks[0].id, iconId: ability.ranks[0].ic, level: ability.lv, talent: false });
    }
    for (const tree of cls.trees) for (const talent of tree.talents) {
      if (talent.ranks[0]) {
        spellNames.set(talent.n, { id: talent.ranks[0], iconId: talent.ic, level: talent.lv, talent: true, talentId: talent.id });
        talentsById.set(String(talent.id), { name: talent.n, spellId: talent.ranks[0] });
      }
    }
    return { classId: id, guide, play, builds, stats, gameBuild, spellNames, talentsById, talentTrees: cls.trees };
  }).catch((error: unknown) => { requests.delete(id); throw error; }));
  return requests.get(id)!;
};

export const useClassGuideBundle = (id: string) => {
  const [state, setState] = useState<{ id: string; data: ClassGuideBundle | null; error: boolean }>({ id: "", data: null, error: false });
  useEffect(() => {
    let active = true;
    void load(id).then((data) => { if (active) setState({ id, data, error: false }); }).catch((cause: unknown) => {
      console.error(`Failed to load ${id} guide`, cause);
      if (active) setState({ id, data: null, error: true });
    });
    return () => { active = false; };
  }, [id]);
  return state.id === id ? { data: state.data, error: state.error } : { data: null, error: false };
};
