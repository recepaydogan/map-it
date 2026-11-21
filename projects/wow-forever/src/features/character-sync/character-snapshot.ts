import { parseCharacterSavedVariables } from "./saved-variables-parser";
import { PROFESSION_IDENTITIES } from "./profession-identities";
import type { ProfessionType } from "./profession-identities";

export interface CharacterProfession {
  id: string; name: string; type: ProfessionType | null; skill: number | null; maxSkill: number | null;
  learned: string[]; unlearned: string[]; recipesAt: number | null; complete: boolean;
}
export interface CharacterInventory { counts: Record<string, number>; capturedAt: number }
export interface CharacterQuestObjective {
  text: string; type: string; done: boolean | null; have: number | null; need: number | null;
}
export interface CharacterQuest {
  id: string; title: string; level: number | null; ready: boolean | null; objectives: CharacterQuestObjective[];
}
export interface CharacterQuestLog { capturedAt: number; active: CharacterQuest[] }
export interface CompletedCharacterQuests { capturedAt: number; ids: string[] }
export interface CharacterSnapshot {
  id: string; guid: string; name: string; realm: string; classId: string; raceId: string;
  faction: "alliance" | "horde" | null; level: number | null; updatedAt: number; locale: string;
  source?: "gep" | "addon";
  /** Last character capture saved by the addon; GEP updates do not refresh this clock. */
  savedAt?: number;
  professionsKnown?: boolean;
  experience?: number; maxExperience?: number; gold?: number; silver?: number; copper?: number;
  professions: CharacterProfession[]; bags: CharacterInventory | null; bank: CharacterInventory | null;
  /** Optional for caches saved before quest-log import was introduced. */
  quests?: CharacterQuestLog | null;
  completedQuests?: CompletedCharacterQuests | null;
}
const classes: Record<number, string> = { 1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest", 7: "shaman", 8: "mage", 9: "warlock", 11: "druid" };
const races: Record<number, string> = { 1: "human", 2: "orc", 3: "dwarf", 4: "nightelf", 5: "undead", 6: "tauren", 7: "gnome", 8: "troll", 95: "skyborne", 96: "skyborne" };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const label = (value: unknown): string => typeof value === "string" ? value.trim().slice(0, 160) : "";
const integer = (value: unknown, max = 1e9): number | null => typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;
const timestamp = (value: unknown, now: number) => {
  const time = integer(value, now / 1000 + 300);
  return time && time >= 1_700_000_000 ? time : null;
};
const recipeIds = (value: unknown) => Object.entries(object(value)).filter(([id, known]) => /^[1-9]\d{0,8}$/.test(id) && known === true).map(([id]) => id);
const identity = (value: Record<string, unknown>) => PROFESSION_IDENTITIES.find(entry =>
  (integer(value.skillLineId) !== null && entry.skillLineId === value.skillLineId) ||
  entry.names.some(name => name.toLocaleLowerCase() === label(value.name).toLocaleLowerCase()));
const inventory = (value: unknown, now: number): CharacterInventory | null => {
  const raw = object(value);
  const capturedAt = timestamp(raw.capturedAt, now);
  if (!capturedAt || !raw.counts || typeof raw.counts !== "object") return null;
  const counts: Record<string, number> = {};
  for (const [id, count] of Object.entries(object(raw.counts))) {
    if (!/^[1-9]\d{0,8}$/.test(id) || integer(count) === null) return null;
    counts[id] = count as number;
  }
  return { counts, capturedAt };
};

const completedQuests = (value: unknown, now: number): CompletedCharacterQuests | null => {
  const raw = object(value), capturedAt = timestamp(raw.capturedAt, now);
  if (!capturedAt || !raw.ids || typeof raw.ids !== "object" || Array.isArray(raw.ids)) return null;
  const entries = Object.entries(raw.ids);
  if (entries.length > 100_000) return null;
  return { capturedAt, ids: entries.filter(([id, done]) => /^[1-9]\d{0,8}$/.test(id) && done === true).map(([id]) => id) };
};

const questLog = (value: unknown, now: number): CharacterQuestLog | null => {
  const raw = object(value), capturedAt = timestamp(raw.capturedAt, now);
  if (!capturedAt || !raw.active || typeof raw.active !== "object") return null;
  const entries = Object.entries(object(raw.active));
  if (entries.length > 100) return null;
  const active: CharacterQuest[] = [];
  for (const [id, value] of entries) {
    const quest = object(value), title = label(quest.title);
    if (!/^[1-9]\d{0,8}$/.test(id) || String(quest.id) !== id || !title) continue;
    active.push({ id, title, level: integer(quest.level, 100), ready: typeof quest.ready === "boolean" ? quest.ready : null,
      objectives: Object.values(object(quest.objectives)).slice(0, 100).map(value => {
        const objective = object(value);
        return { text: typeof objective.text === "string" ? objective.text.trim().slice(0, 512) : "",
          type: label(objective.type), done: typeof objective.done === "boolean" ? objective.done : null,
          have: integer(objective.have, 1e6), need: integer(objective.need, 1e6) };
      }).filter(objective => objective.text) });
  }
  return { capturedAt, active };
};

export function readCharacterSnapshot(source: string, now = Date.now()) {
  return readCharacterSnapshotValue(parseCharacterSavedVariables(source), now);
}

/** Locale-independent identity matching; unknown/incomplete recipes remain unknown. */
export function readCharacterSnapshotValue(value: unknown, now = Date.now()): { characters: CharacterSnapshot[]; currentId: string | null } {
  const root = object(value);
  if (root.schemaVersion !== 1 || !root.characters || typeof root.characters !== "object") throw new Error("unsupported-snapshot");
  const characters: CharacterSnapshot[] = [];
  let currentId: string | null = null;
  const entries = Object.entries(object(root.characters));
  if (entries.length > 100) throw new Error("too-many-characters");
  for (const [guid, raw] of entries) {
    const data = object(raw);
    const classId = classes[Number(data.classId)];
    const raceId = races[Number(data.raceId)];
    const updatedAt = timestamp(data.updatedAt, now);
    const name = label(data.name), realm = label(data.realm);
    const level = integer(data.level, 60);
    const faction = label(data.faction).toLowerCase();
    if (!/^Player-[a-zA-Z0-9-]{1,100}$/.test(guid) || data.guid !== guid || !name || !realm || !classId || !raceId || !updatedAt || !level ||
      (faction !== "alliance" && faction !== "horde")) continue;
    const id = `addon:${integer(data.region, 20) ?? "unknown"}:${guid}`;
    const professions = new Map<string, CharacterProfession>();
    const rawProfessions = object(data.professions).entries ?? object(data.skills).entries;
    for (const rawEntry of Object.values(object(rawProfessions))) {
      const entry = object(rawEntry), match = identity(entry);
      // Canonical identity also supplies the type for Classic APIs and older addons.
      if (match) professions.set(match.id, { id: match.id, name: label(entry.name), type: match.type, skill: integer(entry.skill, 1000), maxSkill: integer(entry.maxSkill, 1000), learned: [], unlearned: [], recipesAt: null, complete: false });
    }
    for (const value of Object.values(object(data.recipes))) {
      const group = object(value), match = identity(group);
      const capturedAt = timestamp(group.capturedAt, now);
      if (!match || !capturedAt) continue;
      // A captured profession list takes precedence over an old recipe window.
      if (rawProfessions && !professions.has(match.id)) continue;
      const existing = professions.get(match.id);
      if (existing?.recipesAt && existing.recipesAt > capturedAt) continue;
      const unlearned = recipeIds(group.unlearned);
      professions.set(match.id, { id: match.id, name: existing?.name ?? label(group.name), type: match.type,
        skill: existing?.skill ?? integer(group.skill, 1000), maxSkill: existing?.maxSkill ?? integer(group.maxSkill, 1000),
        learned: recipeIds(group.learned).filter(id => !unlearned.includes(id)), unlearned,
        recipesAt: capturedAt, complete: group.complete === true });
    }
    const experience = integer(data.xp), maxExperience = integer(data.xpMax), money = integer(data.money, 1e12);
    characters.push({ id, guid, name, realm, classId, raceId, faction, level, updatedAt, savedAt: updatedAt, source: "addon", locale: label(root.locale),
      ...(experience !== null ? { experience } : {}),
      ...(maxExperience !== null ? { maxExperience } : {}),
      ...(money !== null ? { gold: Math.floor(money / 10000), silver: Math.floor(money / 100) % 100, copper: money % 100 } : {}),
      professions: [...professions.values()], bags: inventory(data.bags, now), bank: inventory(data.bank, now), quests: questLog(data.quests, now),
      completedQuests: completedQuests(data.completedQuests, now) });
    if (root.current === guid) currentId = id;
  }
  return { characters, currentId };
}
