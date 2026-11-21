import { parseEventPreferences, type EventPreferences } from "../../features/events/event-preferences.ts";
import { EVENT_PREFERENCES_KEY, EVENT_PREFERENCES_RELOAD_EVENT } from "../../features/events/event-preferences-store.ts";
import {
  COMPLETED_LOCATIONS_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
  sanitizeLocationIds,
  sanitizeMarkers,
  sanitizeNotes,
} from "../../features/map/saved-map-storage.ts";
import type { UserMapMarker } from "../../features/map/types.ts";
import {
  CHARACTER_PROFILE_RELOAD_EVENT,
  LAST_CHARACTER_KEY,
  normalizeSavedCharacterProfile,
  type SavedCharacterProfile,
} from "../../features/character-profiles/character-profile-store.ts";

const CHECKLIST_PREFIX = "player-checklist-v1:";
const CHECKLIST_RELOAD_EVENT = "gm:checklists-reloaded";
const MAP_CHANGE_EVENT = "gm:saved-state-changed";

/** Durable player data that follows an account. Add new user-owned stores here
 * when they are introduced; window layout stays device-local. */
export interface SavedUserData {
  favorites: string[];
  completed: string[];
  markers: UserMapMarker[];
  notes: Record<string, string>;
  checklists: Record<string, string[]>;
  eventPreferences: EventPreferences | null;
  lastCharacter: SavedCharacterProfile | null;
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export const emptySavedUserData = (): SavedUserData => ({
  favorites: [], completed: [], markers: [], notes: {}, checklists: {}, eventPreferences: null,
  lastCharacter: null,
});

export const normalizeSavedUserData = (value: unknown): SavedUserData => {
  const source = record(value) ? value : {};
  const checklistSource = record(source.checklists) ? source.checklists : {};
  const checklists: Record<string, string[]> = {};
  for (const [scope, ids] of Object.entries(checklistSource)) {
    if (scope.length <= 100) checklists[scope] = sanitizeLocationIds(ids);
  }
  let eventPreferences: EventPreferences | null = null;
  if (source.eventPreferences !== null && source.eventPreferences !== undefined) {
    try { eventPreferences = parseEventPreferences(JSON.stringify(source.eventPreferences)); }
    catch (error) { console.error("Could not read saved event preferences", error); }
  }
  return {
    favorites: sanitizeLocationIds(source.favorites),
    completed: sanitizeLocationIds(source.completed),
    markers: sanitizeMarkers(source.markers) as UserMapMarker[],
    notes: sanitizeNotes(source.notes) as Record<string, string>,
    checklists,
    eventPreferences,
    lastCharacter: normalizeSavedCharacterProfile(source.lastCharacter),
  };
};

const parse = (raw: string | null): unknown => {
  if (raw === null) return null;
  try { return JSON.parse(raw) as unknown; }
  catch (error) { console.error("Could not read saved user data", error); return null; }
};

export const readSavedUserData = (storage: StorageLike): SavedUserData => {
  const checklists: Record<string, unknown> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(CHECKLIST_PREFIX)) checklists[key.slice(CHECKLIST_PREFIX.length)] = parse(storage.getItem(key));
  }
  return normalizeSavedUserData({
    favorites: parse(storage.getItem(FAVORITES_STORAGE_KEY)),
    completed: parse(storage.getItem(COMPLETED_LOCATIONS_STORAGE_KEY)),
    markers: parse(storage.getItem(MARKERS_STORAGE_KEY)),
    notes: parse(storage.getItem(NOTES_STORAGE_KEY)),
    checklists,
    eventPreferences: parse(storage.getItem(EVENT_PREFERENCES_KEY)),
    lastCharacter: parse(storage.getItem(LAST_CHARACTER_KEY)),
  });
};

export const writeSavedUserData = (storage: StorageLike, value: SavedUserData): void => {
  const data = normalizeSavedUserData(value);
  storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(data.favorites));
  storage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(data.completed));
  storage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(data.markers));
  storage.setItem(NOTES_STORAGE_KEY, JSON.stringify(data.notes));
  const oldKeys: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key?.startsWith(CHECKLIST_PREFIX)) oldKeys.push(key);
  }
  for (const key of oldKeys) {
    if (!Object.hasOwn(data.checklists, key.slice(CHECKLIST_PREFIX.length))) storage.removeItem(key);
  }
  for (const [scope, ids] of Object.entries(data.checklists)) {
    storage.setItem(`${CHECKLIST_PREFIX}${scope}`, JSON.stringify(ids));
  }
  if (data.eventPreferences) storage.setItem(EVENT_PREFERENCES_KEY, JSON.stringify(data.eventPreferences));
  else storage.removeItem(EVENT_PREFERENCES_KEY);
  if (data.lastCharacter) storage.setItem(LAST_CHARACTER_KEY, JSON.stringify(data.lastCharacter));
  else storage.removeItem(LAST_CHARACTER_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MAP_CHANGE_EVENT));
    window.dispatchEvent(new Event(CHECKLIST_RELOAD_EVENT));
    window.dispatchEvent(new Event(EVENT_PREFERENCES_RELOAD_EVENT));
    window.dispatchEvent(new Event(CHARACTER_PROFILE_RELOAD_EVENT));
  }
};

const mergeIds = (base: string[], local: string[], remote: string[]): string[] => {
  const removed = new Set(base.filter((id) => !local.includes(id)));
  return [...new Set([...remote.filter((id) => !removed.has(id)), ...local])];
};

const mergeRecords = <T,>(
  base: Record<string, T>, local: Record<string, T>, remote: Record<string, T>,
): Record<string, T> => {
  const result = new Map(Object.entries(remote));
  for (const key of new Set([...Object.keys(base), ...Object.keys(local)])) {
    if (equal(base[key], local[key])) continue;
    if (Object.hasOwn(local, key)) result.set(key, local[key]!);
    else result.delete(key);
  }
  return Object.fromEntries(result);
};

const byId = (markers: UserMapMarker[]): Record<string, UserMapMarker> =>
  Object.fromEntries(markers.map((marker) => [marker.id, marker]));

const mergeNotes = (
  base: Record<string, string>, local: Record<string, string>, remote: Record<string, string>,
): Record<string, string> => {
  const result = mergeRecords(base, local, remote);
  for (const [id, guestNote] of Object.entries(local)) {
    const accountNote = remote[id];
    if (base[id] === undefined && accountNote && guestNote && accountNote !== guestNote) {
      if (accountNote.endsWith(`\n\n${guestNote}`)) result[id] = accountNote;
      else {
        const combined = `${accountNote}\n\n${guestNote}`;
        result[id] = combined.length <= 10_000 ? combined : guestNote;
      }
    }
  }
  return result;
};

/** Apply only local changes since base to the newest server version. */
export const mergeSavedUserData = (
  base: SavedUserData, local: SavedUserData, remote: SavedUserData,
): SavedUserData => {
  const eventPreferences = equal(base.eventPreferences, local.eventPreferences)
    ? remote.eventPreferences
    : local.eventPreferences === null ? null
      : remote.eventPreferences && base.eventPreferences === null
        ? { ...remote.eventPreferences, ...local.eventPreferences,
          serverRegion: local.eventPreferences.serverRegion ?? remote.eventPreferences.serverRegion,
          enabled: mergeIds([], local.eventPreferences.enabled, remote.eventPreferences.enabled) }
        : local.eventPreferences;
  const checklists: Record<string, string[]> = { ...remote.checklists };
  for (const scope of new Set([...Object.keys(base.checklists), ...Object.keys(local.checklists)])) {
    checklists[scope] = mergeIds(base.checklists[scope] ?? [], local.checklists[scope] ?? [], remote.checklists[scope] ?? []);
  }
  return {
    favorites: mergeIds(base.favorites, local.favorites, remote.favorites),
    completed: mergeIds(base.completed, local.completed, remote.completed),
    markers: Object.values(mergeRecords(byId(base.markers), byId(local.markers), byId(remote.markers))),
    notes: mergeNotes(base.notes, local.notes, remote.notes),
    checklists,
    eventPreferences,
    lastCharacter: equal(base.lastCharacter, local.lastCharacter) ? remote.lastCharacter
      : local.lastCharacter === null ? null
        : !remote.lastCharacter || local.lastCharacter.viewedAt >= remote.lastCharacter.viewedAt
          ? local.lastCharacter : remote.lastCharacter,
  };
};

export const savedUserDataEqual = equal;
