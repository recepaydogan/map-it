import type { SpellIndexRow } from "./spell-data";
import type { SpellOwner } from "./spell-writeups";

export type SpellBrowseMode = "player" | "all" | "new";
export type SpellSortOrder = "level-asc" | "level-desc" | "name";

export function getSpellFamilyKey(row: SpellIndexRow): string {
  if (row[4]) return `player:${row[4]}:${row[1]}`;
  // Keep unrelated database effects separate, even when they share a name.
  return /^Rank \d+$/.test(row[2]) ? `ranked:${row[1]}:${row[3]}:${row[6]}` : `record:${row[0]}`;
}

export function getSpellLearnLevel(id: number, owners: ReadonlyMap<number, SpellOwner> | null): number | undefined {
  const owner = owners?.get(id);
  // Client levels on unconfirmed runes and other effects are not learning requirements.
  const level = owner?.talentTree ? owner.talentLevel
    : owner?.source === "trainer" ? owner.ranks.find((rank) => rank.id === id)?.level : undefined;
  return level !== undefined && Number.isInteger(level) && level > 0 ? level : undefined;
}

export function getVisibleSpellRows(rows: SpellIndexRow[], options: {
  mode: SpellBrowseMode;
  classId: number;
  query: string;
  sortOrder: SpellSortOrder;
  owners: ReadonlyMap<number, SpellOwner> | null;
  minLevel?: number;
  maxLevel?: number;
  specialization?: string;
  displayName?: (row: SpellIndexRow) => string;
}): SpellIndexRow[] {
  const { mode, classId, sortOrder, owners, minLevel, maxLevel, specialization } = options;
  const displayName = options.displayName ?? ((row: SpellIndexRow) => row[1]);
  const hasLevelRange = minLevel !== undefined || maxLevel !== undefined;
  const phrase = options.query.trim().toLocaleLowerCase();
  const matches = rows.filter((row) => {
    if (mode === "player" && !row[4]) return false;
    if (mode === "new" && !row[5]) return false;
    if (classId && row[4] !== classId && (mode === "player" || owners?.get(row[0])?.classId !== classId)) return false;
    const owner = owners?.get(row[0]);
    if (specialization && (owner?.talentTree ?? owner?.classLine) !== specialization) return false;
    if (hasLevelRange) {
      const level = getSpellLearnLevel(row[0], owners);
      if (level === undefined || (minLevel !== undefined && level < minLevel) || (maxLevel !== undefined && level > maxLevel)) return false;
    }
    return !phrase || displayName(row).toLocaleLowerCase().includes(phrase)
      || row[1].toLocaleLowerCase().includes(phrase)
      || String(row[0]).includes(phrase) || row[2].toLocaleLowerCase().includes(phrase);
  });
  const relevance = (row: SpellIndexRow) => {
    if (!phrase) return 0;
    const name = displayName(row).toLocaleLowerCase();
    const english = row[1].toLocaleLowerCase();
    return String(row[0]) === phrase || name === phrase || english === phrase ? 0
      : name.startsWith(phrase) || english.startsWith(phrase) ? 1
      : name.includes(phrase) || english.includes(phrase) ? 2 : 3;
  };
  const levels = new Map(matches.map((row) => [row[0], getSpellLearnLevel(row[0], owners)]));
  const exactId = /^\d+$/.test(phrase) ? Number(phrase) : undefined;
  matches.sort((a, b) => {
    if (a[0] === exactId) return -1;
    if (b[0] === exactId) return 1;
    if (sortOrder !== "name") {
      const aLevel = levels.get(a[0]);
      const bLevel = levels.get(b[0]);
      if (aLevel === undefined && bLevel !== undefined) return 1;
      if (bLevel === undefined && aLevel !== undefined) return -1;
      if (aLevel !== undefined && bLevel !== undefined && aLevel !== bLevel) {
        return sortOrder === "level-asc" ? aLevel - bLevel : bLevel - aLevel;
      }
    }
    return relevance(a) - relevance(b) || displayName(a).localeCompare(displayName(b)) ||
      a[4] - b[4] || a[0] - b[0];
  });
  // Filter and sort ranks first so each family represents a matching rank.
  const seen = new Set<string>();
  return matches.filter((row) => {
    const key = getSpellFamilyKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
