import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";
import { SPELL_CLASSES } from "./spell-data";

export interface SpellWriteup {
  summary: string;
  details?: string[];
  forever?: string;
  useWhen?: string[];
  avoidWhen?: string[];
  pairsWith?: string[];
  specs?: string[];
}

interface ClassWriteups {
  class: string;
  verified: string;
  abilities: Record<string, SpellWriteup>;
  talents: Record<string, SpellWriteup>;
}

interface ClassSpellData {
  id: number;
  n: string;
  abilities: { n: string; sl?: string; src?: string; rune?: string; races?: string[]; faction?: string; ranks: { id: number; r?: string; lv?: number }[] }[];
  trees: { n: string; talents: { id: number; n: string; row: number; lv: number; ranks: number[] }[] }[];
}

export interface SpellRank {
  id: number;
  name: string;
  level?: number;
}

export interface SpellOwner {
  classId: number;
  className: string;
  name: string;
  ability?: string;
  talentId?: number;
  talentTree?: string;
  talentTier?: number;
  talentLevel?: number;
  source?: string;
  rune?: string;
  classLine?: string;
  races?: string[];
  faction?: string;
  ranks: SpellRank[];
}

let ownersRequest: Promise<Map<number, SpellOwner>> | null = null;
const writeupRequests = new Map<number, Promise<ClassWriteups>>();

export const loadSpellOwners = () => {
  ownersRequest ??= fetch(contentUrl("data/spells/foreverdb/classes.json")).then(async (response) => {
    if (!response.ok) throw new Error(`Spell owners: HTTP ${response.status}`);
    const classes = await response.json() as ClassSpellData[];
    const owners = new Map<number, SpellOwner>();
    for (const cls of classes) {
      for (const ability of cls.abilities) {
        const ranks = ability.ranks.map((rank) => ({ id: rank.id, name: rank.r || ability.n, level: rank.lv }));
        for (const rank of ability.ranks) owners.set(rank.id, {
          classId: cls.id, className: cls.n, name: ability.n, ability: ability.n,
          source: ability.src, rune: ability.rune, classLine: ability.sl,
          races: ability.races, faction: ability.faction, ranks,
        });
      }
      for (const tree of cls.trees) for (const talent of tree.talents) {
        const ranks = talent.ranks.map((id, index) => ({ id, name: `Rank ${index + 1}`, level: talent.lv + index }));
        for (const [index, id] of talent.ranks.entries()) owners.set(id, {
          classId: cls.id, className: cls.n, name: talent.n,
          talentId: talent.id, talentTree: tree.n, talentTier: talent.row + 1,
          talentLevel: talent.lv + index, ranks,
        });
      }
    }
    return owners;
  }).catch((error: unknown) => { ownersRequest = null; throw error; });
  return ownersRequest;
};

export const useSpellOwners = () => {
  const [owners, setOwners] = useState<Map<number, SpellOwner> | null>(null);
  useEffect(() => {
    let active = true;
    void loadSpellOwners().then((value) => { if (active) setOwners(value); }).catch((cause: unknown) => {
      console.error("Failed to load class spell metadata", cause);
    });
    return () => { active = false; };
  }, []);
  return owners;
};

const loadWriteups = (classId: number) => {
  if (!writeupRequests.has(classId)) {
    const className = SPELL_CLASSES[classId]?.toLowerCase();
    if (!className) return Promise.reject(new Error(`Unknown spell class ${classId}`));
    writeupRequests.set(classId, fetch(contentUrl(`data/spells/writeups/${className}.json`)).then(async (response) => {
      if (!response.ok) throw new Error(`Spell write-ups: HTTP ${response.status}`);
      return response.json() as Promise<ClassWriteups>;
    }).catch((error: unknown) => { writeupRequests.delete(classId); throw error; }));
  }
  return writeupRequests.get(classId)!;
};

export const useSpellWriteup = (id: number | null) => {
  const [state, setState] = useState<{ id: number | null; owner: SpellOwner | null; writeup: SpellWriteup | null }>({ id: null, owner: null, writeup: null });
  useEffect(() => {
    if (id === null) return;
    let active = true;
    void loadSpellOwners().then(async (owners) => {
      const owner = owners.get(id) ?? null;
      const writeups = owner ? await loadWriteups(owner.classId) : null;
      const writeup = owner && writeups
        ? owner.ability ? writeups.abilities[owner.ability] ?? null : writeups.talents[String(owner.talentId)] ?? null
        : null;
      if (active) setState({ id, owner, writeup });
    }).catch((cause: unknown) => { console.error("Failed to load spell guide", cause); if (active) setState({ id, owner: null, writeup: null }); });
    return () => { active = false; };
  }, [id]);
  return state.id === id ? state : { id, owner: null, writeup: null };
};
