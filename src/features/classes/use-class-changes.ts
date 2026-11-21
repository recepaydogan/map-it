import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";
import { SPELL_CLASS_IDS } from "../spells/spell-data";

export interface EraEntry {
  n: string;
  id?: number;
  lv?: number;
  era?: string;
  tree?: string;
  tier?: number;
  ranks?: number;
}

export interface ClientEntry extends EraEntry {
  fn?: string;
  fid?: number;
  now?: string;
  flv?: number;
  ftree?: string;
  ftier?: number;
  franks?: number;
  sameSpell?: boolean;
  baseline?: { fid: number; now: string; flv?: number };
  ranksAdded?: string[];
  ranksRemoved?: string[];
  levels?: [string, number, number][];
  talentLv?: number;
}

export interface ClassChanges {
  abilitiesRemoved: EraEntry[];
  abilitiesInClientNotTaught: ClientEntry[];
  abilitiesNowTalent: ClientEntry[];
  abilitiesNotTrained: ClientEntry[];
  abilitiesChanged: ClientEntry[];
  abilitiesMerged: { fn: string; fid: number; from: string[]; franks: number }[];
  talentsRemoved: EraEntry[];
  talentsBaseline: ClientEntry[];
  talentsReplaced: ClientEntry[];
  talentsHidden: EraEntry[];
  talentsMoved: ClientEntry[];
  talentRanksChanged: ClientEntry[];
  tooltipChanges: { n: string; r: string; id: number; old: string; new: string }[];
  coefficientChanges: { n: string; r: string; id: number; old: number; new: number }[];
  proficiency: { skill: string; change: "gained" | "lost" | "level"; lv: number; old?: number }[];
}

let request: Promise<Record<string, ClassChanges>> | null = null;

const loadAll = () => {
  request ??= fetch(contentUrl("data/classes/guides/changes.json"))
    .then(async (response) => {
      if (!response.ok) throw new Error(`Class comparisons: HTTP ${response.status}`);
      const data = await response.json() as Record<string, ClassChanges>;
      if (Object.keys(data).length !== Object.keys(SPELL_CLASS_IDS).length) throw new Error("Incomplete class comparisons");
      return data;
    }).catch((error: unknown) => { request = null; throw error; });
  return request;
};

export const useClassChanges = (classId: string) => {
  const [state, setState] = useState<{ id: string; data: ClassChanges | null; error: boolean }>({ id: "", data: null, error: false });
  useEffect(() => {
    let active = true;
    void loadAll().then((all) => {
      if (active) setState({ id: classId, data: all[String(SPELL_CLASS_IDS[classId])] ?? null, error: false });
    }).catch(() => { if (active) setState({ id: classId, data: null, error: true }); });
    return () => { active = false; };
  }, [classId]);
  return state.id === classId ? state : { id: classId, data: null, error: false };
};
