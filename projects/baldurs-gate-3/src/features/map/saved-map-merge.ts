import type { UserMapMarker } from "./types";

export interface SavedMapSnapshot {
  favoriteIds: string[];
  completedIds: string[];
  markers: UserMapMarker[];
  notes: Record<string, string>;
  /** Preserve both versions of conflicting edits, including intentional deletes. */
  conflicts?: Record<string, unknown[]>;
}

export const emptySavedMapSnapshot = (): SavedMapSnapshot => ({ favoriteIds: [], completedIds: [], markers: [], notes: {} });
const canonicalJson = (value: unknown) => JSON.stringify(value, (_key, entry: unknown) =>
  entry && typeof entry === "object" && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right, "en")))
    : entry);
export const sameSavedValue = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

/** Three-way merge: unchanged local fields accept remote updates; local removals stay removed. */
export const mergeSavedMapSnapshots = (
  base: SavedMapSnapshot | null,
  local: SavedMapSnapshot,
  remote: SavedMapSnapshot,
): SavedMapSnapshot => {
  const conflicts = structuredClone(remote.conflicts ?? {});
  for (const [key, versions] of Object.entries(local.conflicts ?? {})) {
    conflicts[key] = [...(conflicts[key] ?? []), ...versions].filter((value, index, all) => all.findIndex((other) => sameSavedValue(value, other)) === index);
  }
  const mergeRecords = <T,>(before: Record<string, T>, here: Record<string, T>, there: Record<string, T>, kind: string): Record<string, T> => {
    const result = new Map(Object.entries(there));
    for (const key of new Set([...Object.keys(before), ...Object.keys(here)])) {
      const previous = Object.hasOwn(before, key) ? before[key] : undefined;
      const current = Object.hasOwn(here, key) ? here[key] : undefined;
      if (base && sameSavedValue(previous, current)) continue;
      if (kind !== "flag" && there[key] !== undefined && !sameSavedValue(there[key], current)
        && (!base || !sameSavedValue(there[key], previous))) {
        const conflictKey = `${kind}:${key}`;
        const versions = [...(conflicts[conflictKey] ?? []), there[key]];
        conflicts[conflictKey] = versions.filter((value, index) => versions.findIndex((other) => sameSavedValue(value, other)) === index);
      }
      if (current === undefined) result.delete(key);
      else result.set(key, current);
    }
    return Object.fromEntries([...result].sort(([a], [b]) => a.localeCompare(b, "en")));
  };
  const flags = (ids: string[]) => Object.fromEntries(ids.map((id) => [id, true]));
  const markers = (items: UserMapMarker[]) => Object.fromEntries(items.map((item) => [item.id, item]));
  const initial = base ?? emptySavedMapSnapshot();
  return {
    favoriteIds: Object.keys(mergeRecords(flags(initial.favoriteIds), flags(local.favoriteIds), flags(remote.favoriteIds), "flag")),
    completedIds: Object.keys(mergeRecords(flags(initial.completedIds), flags(local.completedIds), flags(remote.completedIds), "flag")),
    notes: mergeRecords(initial.notes, local.notes, remote.notes, "note"),
    markers: Object.values(mergeRecords(markers(initial.markers), markers(local.markers), markers(remote.markers), "marker")),
    ...(Object.keys(conflicts).length ? { conflicts } : {}),
  };
};

/** Reject malformed remote state instead of silently replacing a user's records. */
export const parseSavedMapSnapshot = (value: unknown): SavedMapSnapshot => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid saved map state");
  const state = value as SavedMapSnapshot;
  for (const ids of [state.favoriteIds, state.completedIds]) {
    if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && id.length <= 160)) throw new Error("Invalid saved marker IDs");
  }
  if (!Array.isArray(state.markers) || !state.markers.every((marker) => marker && typeof marker.id === "string"
    && marker.id.length <= 160 && typeof marker.name === "string" && marker.name.length <= 200
    && marker.category === "custom" && marker.subtype === "custom" && marker.regionId === "personal"
    && typeof marker.label === "string" && typeof marker.region === "string"
    && Number.isFinite(marker.x) && Number.isFinite(marker.y))) throw new Error("Invalid personal markers");
  if (!state.notes || typeof state.notes !== "object" || Array.isArray(state.notes)
    || !Object.entries(state.notes).every(([id, note]) => id.length <= 160 && typeof note === "string" && note.length <= 10000)) throw new Error("Invalid saved notes");
  if (state.conflicts !== undefined && (!state.conflicts || typeof state.conflicts !== "object" || Array.isArray(state.conflicts)
    || !Object.values(state.conflicts).every(Array.isArray))) throw new Error("Invalid saved conflicts");
  return state;
};
