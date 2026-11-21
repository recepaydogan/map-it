import { COMPLETED_LOCATIONS_STORAGE_KEY, FAVORITES_STORAGE_KEY, NOTES_STORAGE_KEY } from "./saved-map-storage.ts";

/** Retain favorites, completion and both notes when source alternatives merge. */
export function migrateMapMarkerAliases(points: { id: string; aliasIds?: string[] }[], storage: Pick<Storage, "getItem" | "setItem">): boolean {
  const aliases = new Map(points.flatMap((point) => (point.aliasIds ?? []).map((id) => [id, point.id] as const)));
  if (!aliases.size) return false;
  let changed = false;
  for (const key of [FAVORITES_STORAGE_KEY, COMPLETED_LOCATIONS_STORAGE_KEY]) {
    const original = storage.getItem(key);
    if (!original) continue;
    const ids: string[] = JSON.parse(original);
    const next = [...new Set(ids.map((id) => aliases.get(id) ?? id))];
    if (JSON.stringify(next) !== JSON.stringify(ids)) {
      storage.setItem(key, JSON.stringify(next));
      changed = true;
    }
  }
  const original = storage.getItem(NOTES_STORAGE_KEY);
  if (original) {
    const notes: Record<string, string> = JSON.parse(original);
    const next = { ...notes };
    for (const [alias, canonical] of aliases) {
      const note = next[alias];
      if (note === undefined) continue;
      if (note && next[canonical] !== note) next[canonical] = [next[canonical], note].filter(Boolean).join("\n\n");
      delete next[alias];
    }
    if (JSON.stringify(next) !== JSON.stringify(notes)) {
      storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(next));
      changed = true;
    }
  }
  return changed;
}
