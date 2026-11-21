import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";

export type SpellIndexRow = [id: number, name: string, rank: string, iconId: number, classId: number, isNew: number, partOf: number];

export interface SpellDetail {
  id: number;
  n: string;
  r: string;
  d?: string;
  a?: string;
  ic: number;
  sc?: string;
  ct?: number;
  cd?: number;
  du?: number;
  rg?: [number, number];
  co?: [number, string, number][];
  lv?: number;
  cl?: number;
  pa?: boolean;
  pc?: number;
  sp?: number;
  mc?: string;
  dt?: string;
  new?: boolean;
  old?: string;
  osp?: number;
  ef?: { e: number; a?: number; v?: number; lo?: number; hi?: number; pl?: number; t?: number; r?: number; ch?: number; sp?: number; ap?: number; m?: number; mc?: string; tg?: number; tr?: number }[];
  tr?: [number, string][];
  tb?: [number, string][];
  of?: [number, string];
}

export interface SpellEffectNames {
  effects: Record<string, string>;
  auras: Record<string, string>;
  targets: Record<string, string>;
}

const root = "data/spells/foreverdb";
let indexCache: SpellIndexRow[] | null = null;
let indexRequest: Promise<SpellIndexRow[]> | null = null;
const shardRequests = new Map<number, Promise<Record<string, SpellDetail>>>();
let effectRequest: Promise<SpellEffectNames> | null = null;

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(contentUrl(path));
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

export const loadSpellIndex = () => {
  if (indexCache) return Promise.resolve(indexCache);
  indexRequest ??= fetchJson<SpellIndexRow[]>(`${root}/index.json`).then((rows) => {
    if (!Array.isArray(rows) || rows.length < 30000) throw new Error("Invalid spell index");
    indexCache = rows;
    return rows;
  }).catch((error: unknown) => { indexRequest = null; throw error; });
  return indexRequest;
};

export const loadSpellDetail = (id: number) => {
  const shard = id % 64;
  if (!shardRequests.has(shard)) {
    shardRequests.set(shard, fetchJson<Record<string, SpellDetail>>(`${root}/${shard}.json`)
      .catch((error: unknown) => { shardRequests.delete(shard); throw error; }));
  }
  return shardRequests.get(shard)!.then((records) => records[String(id)] ?? null);
};

export const loadSpellEffectNames = () => {
  effectRequest ??= fetchJson<SpellEffectNames>(`${root}/effects.json`).catch((error: unknown) => {
    effectRequest = null;
    throw error;
  });
  return effectRequest;
};

export const useSpellIndex = () => {
  const [rows, setRows] = useState(indexCache);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void loadSpellIndex().then((value) => { if (active) setRows(value); }).catch((cause: unknown) => {
      console.error("Failed to load spell index", cause);
      if (active) setError(true);
    });
    return () => { active = false; };
  }, []);
  return { rows, error };
};

export const useSpellDetail = (id: number | null) => {
  const [state, setState] = useState<{ id: number | null; detail: SpellDetail | null; error: boolean }>({ id: null, detail: null, error: false });
  useEffect(() => {
    if (id === null) return;
    let active = true;
    void loadSpellDetail(id).then((detail) => { if (active) setState({ id, detail, error: false }); }).catch((cause: unknown) => {
      console.error(`Failed to load spell ${id}`, cause);
      if (active) setState({ id, detail: null, error: true });
    });
    return () => { active = false; };
  }, [id]);
  return state.id === id ? state : { id, detail: null, error: false };
};

export const spellIconUrl = (iconId: number) => contentUrl(`data/spells/icons/${iconId}.webp`);

export const SPELL_CLASSES: Record<number, string> = {
  1: "Warrior", 2: "Paladin", 3: "Hunter", 4: "Rogue", 5: "Priest",
  7: "Shaman", 8: "Mage", 9: "Warlock", 11: "Druid",
};
export const SPELL_CLASS_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(SPELL_CLASSES).map(([id, name]) => [name.toLowerCase(), Number(id)]),
);
