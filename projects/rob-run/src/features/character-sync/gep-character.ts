import type { CharacterSnapshot, CharacterProfession } from "./character-snapshot";
import { PROFESSION_IDENTITIES } from "./profession-identities";

const classes: Record<number, string> = { 1: "warrior", 2: "paladin", 3: "hunter", 4: "rogue", 5: "priest", 6: "deathknight", 7: "shaman", 8: "mage", 9: "warlock", 10: "monk", 11: "druid", 12: "demonhunter" };
const number = (raw: unknown) => {
  if (typeof raw !== "number" && (typeof raw !== "string" || !raw.trim())) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
};
export const gepObject = (raw: unknown): Record<string, unknown> => {
  try { if (typeof raw === "string") raw = JSON.parse(raw); } catch { return {}; }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
};

/** Merge deltas within one session; names alone are not a cross-realm identity. */
export function mergeGepCharacter(previous: CharacterSnapshot | null, raw: unknown, sessionId: string, now: number): CharacterSnapshot | null {
  const info = gepObject(raw);
  const name = typeof info.character_name === "string" ? info.character_name.trim().slice(0, 160) || undefined : undefined;
  const changedCharacter = name !== undefined && previous?.name && name !== previous.name;
  const base = changedCharacter ? null : previous;
  const result: CharacterSnapshot = base ? { ...base } : {
    id: changedCharacter ? `${sessionId}:${encodeURIComponent(name!)}` : sessionId, source: "gep", guid: "", name: "", realm: "", classId: "", raceId: "", faction: null,
    level: null, updatedAt: Math.floor(now / 1000), locale: "", professions: [], bags: null, bank: null, quests: null,
  };
  let changed = false;
  if (name !== undefined) { result.name = name; changed = true; }
  const level = number(info.player_level);
  if (level !== null && level >= 1 && level <= 100) { result.level = level; changed = true; }
  if ("player_class" in info) {
    const rawClass = info.player_class;
    const id = classes[Number(rawClass)] ?? (typeof rawClass === "string" ? Object.values(classes).find(c => c === rawClass.toLowerCase().replace(/\s/g, "")) : undefined);
    if (id) { result.classId = id; changed = true; }
  }
  for (const [key, target] of [["player_exp", "experience"], ["player_exp_max", "maxExperience"],
    ["player_money_gold", "gold"], ["player_money_silver", "silver"], ["player_money_copper", "copper"]] as const) {
    const value = number(info[key]);
    if (value !== null) { result[target] = value; changed = true; }
  }
  if ("player_professions" in info) {
    let entries = info.player_professions;
    try { if (typeof entries === "string") entries = JSON.parse(entries); } catch { entries = null; }
    if (Array.isArray(entries)) {
      result.professionsKnown = true;
      result.professions = entries.flatMap((raw): CharacterProfession[] => {
        const entry = gepObject(raw);
        const match = PROFESSION_IDENTITIES.find(p => p.skillLineId === number(entry.skill_line));
        if (!match) return [];
        const saved = base?.professions.find(profession => profession.id === match.id);
        return [{ id: match.id, name: typeof entry.name === "string" ? entry.name : match.names[0]!,
          type: entry.type === "primary" || entry.type === "secondary" ? entry.type : saved?.type ?? null,
          skill: saved?.skill ?? null, maxSkill: saved?.maxSkill ?? null, learned: saved?.learned ?? [],
          unlearned: saved?.unlearned ?? [], recipesAt: saved?.recipesAt ?? null, complete: saved?.complete ?? false }];
      });
      changed = true;
    }
  }
  if (!changed) return base;
  result.source = "gep";
  result.updatedAt = Math.floor(now / 1000);
  return result;
}
