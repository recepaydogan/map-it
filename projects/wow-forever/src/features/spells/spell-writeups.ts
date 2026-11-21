import { useEffect, useState } from "react";
import { contentUrl } from "../../lib/content-url";
import { useAppLanguage } from "../../i18n/app-language";
import { fetchSupplementalLocalePack } from "../../i18n/locale-content";
import { SPELL_CLASSES } from "./spell-data";
import { applySpellWriteupText, type SpellWriteupLocalePack } from "./spell-writeup-localization";

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
const writeupLocaleRequests = new Map<string, Promise<Record<string, string>>>();
let writeupLocaleSourceRequest: Promise<{ version: number; strings: string[] }> | undefined;
const fetchWriteupLocale = <T,>(file: string) =>
  fetchSupplementalLocalePack<T>(`data/spells/writeups/locales/${file}`);

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
        const ids = [...new Set(talent.ranks)];
        const ranks = ids.map((id, index) => ({ id, name: `Rank ${index + 1}`, level: talent.lv + index }));
        for (const [index, id] of ids.entries()) {
          const abilityOwner = owners.get(id);
          const fullRanks = abilityOwner?.name === talent.n && abilityOwner.ranks.length > ranks.length
            ? abilityOwner.ranks.map((rank) => ({ ...rank, level: Math.max(talent.lv, rank.level ?? talent.lv) })) : ranks;
          for (const rank of fullRanks) owners.set(rank.id, {
            classId: cls.id, className: cls.n, name: talent.n,
            talentId: talent.id, talentTree: tree.n, talentTier: talent.row + 1,
            talentLevel: rank.level ?? talent.lv + index, ranks: fullRanks,
          });
        }
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

const loadWriteupLocale = (language: string): Promise<Record<string, string>> => {
  if (language === "en") return Promise.resolve({});
  let request = writeupLocaleRequests.get(language);
  if (!request) {
    writeupLocaleSourceRequest ??= fetchWriteupLocale<{ version: number; strings: string[] }>("source.json")
      .then((source) => {
        if (source.version !== 1 || !Array.isArray(source.strings)) throw new Error("Invalid spell write-up source");
        return source;
      }).catch((error: unknown) => { writeupLocaleSourceRequest = undefined; throw error; });
    request = Promise.all([writeupLocaleSourceRequest,
      fetchWriteupLocale<SpellWriteupLocalePack>(`${language}.json`),
    ]).then(([source, pack]) => {
      if (pack.version !== 1 || pack.language !== language ||
        !Array.isArray(pack.values) || pack.values.length !== source.strings.length) {
        throw new Error(`Invalid spell write-up locale ${language}`);
      }
      return Object.fromEntries(source.strings.map((text, index) => [text, pack.values[index]]));
    }).catch((error: unknown) => { writeupLocaleRequests.delete(language); throw error; });
    writeupLocaleRequests.set(language, request);
  }
  return request;
};

export const useSpellWriteup = (id: number | null) => {
  const language = useAppLanguage();
  const [state, setState] = useState<{ id: number | null; language: string; owner: SpellOwner | null; writeup: SpellWriteup | null }>({ id: null, language: "", owner: null, writeup: null });
  useEffect(() => {
    if (id === null) return;
    let active = true;
    void loadSpellOwners().then(async (owners) => {
      const owner = owners.get(id) ?? null;
      const [writeups, translations] = owner ? await Promise.all([
        loadWriteups(owner.classId), loadWriteupLocale(language).catch(() => ({})),
      ]) : [null, {}];
      const writeup = owner && writeups
        ? owner.ability ? writeups.abilities[owner.ability] ?? null : writeups.talents[String(owner.talentId)] ?? null
        : null;
      if (active) setState({ id, language, owner, writeup: writeup ? applySpellWriteupText(writeup, translations) : null });
    }).catch((cause: unknown) => { console.error("Failed to load spell guide", cause); if (active) setState({ id, language, owner: null, writeup: null }); });
    return () => { active = false; };
  }, [id, language]);
  return state.id === id && state.language === language ? state : { id, owner: null, writeup: null };
};
