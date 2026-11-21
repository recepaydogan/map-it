import type { EventPreferences } from "../../features/events/event-preferences";
import type { UserMapMarker } from "../../features/map/types";

export interface SavedData {
  favorites: string[];
  completed: string[];
  markers: UserMapMarker[];
  notes: Record<string, string>;
  checklists: Record<string, string[]>;
  eventPreferences: EventPreferences | null;
}

export const emptySavedData = (): SavedData => ({
  favorites: [], completed: [], markers: [], notes: {}, checklists: {}, eventPreferences: null,
});
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonical(item)]));
  }
  return value;
};
export const sameSavedData = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

const mergeSet = (base: string[], local: string[], remote: string[]) => {
  const b = new Set(base), l = new Set(local), r = new Set(remote);
  return [...new Set([...remote, ...local, ...base])].filter((id) =>
    l.has(id) !== b.has(id) ? l.has(id) : r.has(id));
};
const mergeRecord = <T,>(base: Record<string, T>, local: Record<string, T>, remote: Record<string, T>) => {
  const result: Record<string, T> = Object.create(null) as Record<string, T>;
  for (const key of new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])) {
    const value = sameSavedData(local[key], base[key]) ? remote[key] : local[key];
    if (value !== undefined) result[key] = value;
  }
  return result;
};
const mergeMarkers = (base: UserMapMarker[], local: UserMapMarker[], remote: UserMapMarker[]) => {
  const byId = (values: UserMapMarker[]) => Object.fromEntries(values.map((marker) => [marker.id, marker]));
  return Object.values(mergeRecord(byId(base), byId(local), byId(remote)));
};

/** Account edits use a three-way merge: local changes win; untouched fields take remote changes. */
export const mergeSavedData = (base: SavedData, local: SavedData, remote: SavedData): SavedData => {
  const checklistKeys = new Set([...Object.keys(base.checklists), ...Object.keys(local.checklists), ...Object.keys(remote.checklists)]);
  const checklists: Record<string, string[]> = {};
  for (const key of checklistKeys) checklists[key] = mergeSet(base.checklists[key] ?? [], local.checklists[key] ?? [], remote.checklists[key] ?? []);
  return {
    favorites: mergeSet(base.favorites, local.favorites, remote.favorites),
    completed: mergeSet(base.completed, local.completed, remote.completed),
    markers: mergeMarkers(base.markers, local.markers, remote.markers),
    notes: mergeRecord(base.notes, local.notes, remote.notes), checklists,
    eventPreferences: sameSavedData(local.eventPreferences, base.eventPreferences) ? remote.eventPreferences : local.eventPreferences,
  };
};

/** Guest progress adds to an existing account. Guest notes win for the same marker. */
export const mergeGuestData = (account: SavedData, guest: SavedData): SavedData => {
  const checklists = { ...account.checklists };
  for (const [key, value] of Object.entries(guest.checklists)) {
    checklists[key] = [...new Set([...(checklists[key] ?? []), ...value])];
  }
  return {
    favorites: [...new Set([...account.favorites, ...guest.favorites])],
    completed: [...new Set([...account.completed, ...guest.completed])],
    markers: Object.values({ ...Object.fromEntries(account.markers.map((marker) => [marker.id, marker])),
      ...Object.fromEntries(guest.markers.map((marker) => [marker.id, marker])) }),
    notes: { ...account.notes, ...guest.notes }, checklists,
    eventPreferences: guest.eventPreferences ?? account.eventPreferences,
  };
};

export const hasGuestData = (data: SavedData) => Boolean(data.favorites.length || data.completed.length
  || data.markers.length || Object.keys(data.notes).length
  || Object.values(data.checklists).some((value) => value.length) || data.eventPreferences !== null);
