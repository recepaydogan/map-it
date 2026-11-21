import { getSupabaseClient } from "../../data/supabase-client";
import { parseEventPreferences, type EventPreferences } from "../../features/events/event-preferences";
import { EVENT_PREFERENCES_KEY } from "../../features/events/event-preferences-store";
import {
  COMPLETED_LOCATIONS_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  migrateSavedMapStorage,
  NOTES_STORAGE_KEY,
} from "../../features/map/saved-map-storage";
import type { UserMapMarker } from "../../features/map/types";
import { SAVED_DATA_CHANGE_EVENT, SAVED_DATA_REFRESH_EVENT } from "./saved-data-events";
import { emptySavedData, hasGuestData, mergeGuestData, mergeSavedData, sameSavedData, type SavedData } from "./saved-data-model";

/** Add new account-owned local data here when a feature starts persisting it. */
const ACTIVE_OWNER_KEY = "gm:saved-data-owner";
const CHECKLIST_PREFIX = "player-checklist-v1:";
const GUEST = "guest";
const CACHE_PREFIX = "gm:saved-data-cache:";
const BASE_PREFIX = "gm:saved-data-base:";
const cacheKey = (owner: string) => `${CACHE_PREFIX}${owner}`;
const baseKey = (userId: string) => `${BASE_PREFIX}${userId}`;
const managedKeys = new Set([
  FAVORITES_STORAGE_KEY, COMPLETED_LOCATIONS_STORAGE_KEY, MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY, EVENT_PREFERENCES_KEY,
]);

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const parse = (raw: string | null): unknown => {
  try { return raw === null ? null : JSON.parse(raw) as unknown; }
  catch { return null; }
};
const ids = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((id): id is string => typeof id === "string" && id.length <= 160))]
  : [];
const notes = (value: unknown): Record<string, string> => record(value)
  ? Object.fromEntries(Object.entries(value).filter(([id, note]) =>
    id.length <= 160 && typeof note === "string" && note.length <= 10_000)) as Record<string, string>
  : {};
const markers = (value: unknown): UserMapMarker[] => Array.isArray(value)
  ? value.filter((marker): marker is UserMapMarker => record(marker)
    && typeof marker.id === "string" && marker.id.length <= 160
    && typeof marker.name === "string" && marker.name.length <= 200
    && marker.category === "custom" && marker.subtype === "custom"
    && marker.regionId === "personal" && typeof marker.label === "string"
    && typeof marker.region === "string" && typeof marker.x === "number"
    && Number.isFinite(marker.x) && typeof marker.y === "number" && Number.isFinite(marker.y))
  : [];
const preferences = (value: unknown): EventPreferences | null => {
  if (value === null) return null;
  try { return parseEventPreferences(JSON.stringify(value)); }
  catch { return null; }
};
const normalize = (value: unknown): SavedData => {
  const source = record(value) ? value : {};
  const rawChecklists = record(source.checklists) ? source.checklists : {};
  return {
    favorites: ids(source.favorites), completed: ids(source.completed), markers: markers(source.markers),
    notes: notes(source.notes),
    checklists: Object.fromEntries(Object.entries(rawChecklists)
      .filter(([key]) => key.startsWith(CHECKLIST_PREFIX) && key.length <= 200)
      .map(([key, value]) => [key, ids(value)])),
    eventPreferences: preferences(source.eventPreferences),
  };
};
const readCache = (key: string): SavedData => normalize(parse(localStorage.getItem(key)));
const readActive = (): SavedData => {
  migrateSavedMapStorage();
  const checklists: Record<string, string[]> = {};
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key?.startsWith(CHECKLIST_PREFIX)) checklists[key] = ids(parse(localStorage.getItem(key)));
  }
  return normalize({
    favorites: parse(localStorage.getItem(FAVORITES_STORAGE_KEY)),
    completed: parse(localStorage.getItem(COMPLETED_LOCATIONS_STORAGE_KEY)),
    markers: parse(localStorage.getItem(MARKERS_STORAGE_KEY)),
    notes: parse(localStorage.getItem(NOTES_STORAGE_KEY)), checklists,
    eventPreferences: parse(localStorage.getItem(EVENT_PREFERENCES_KEY)),
  });
};
const writeActive = (data: SavedData) => {
  const current = readActive();
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(data.favorites));
  localStorage.setItem(COMPLETED_LOCATIONS_STORAGE_KEY, JSON.stringify(data.completed));
  localStorage.setItem(MARKERS_STORAGE_KEY, JSON.stringify(data.markers));
  localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(data.notes));
  for (const key of Object.keys(current.checklists)) {
    if (!(key in data.checklists)) localStorage.removeItem(key);
  }
  for (const [key, value] of Object.entries(data.checklists)) localStorage.setItem(key, JSON.stringify(value));
  if (data.eventPreferences) localStorage.setItem(EVENT_PREFERENCES_KEY, JSON.stringify(data.eventPreferences));
  else localStorage.removeItem(EVENT_PREFERENCES_KEY);
  window.dispatchEvent(new Event(SAVED_DATA_REFRESH_EVENT));
};

let activeUser: string | null = null;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let started = false;
let pending = false;
let retryDelay = 3_000;
let missingSchemaLogged = false;

const clearAccountSnapshots = () => {
  const keys: string[] = [];
  for (let index = 0; index < localStorage.length; index++) {
    const key = localStorage.key(index);
    if (key && (key.startsWith(BASE_PREFIX)
      || (key.startsWith(CACHE_PREFIX) && key !== cacheKey(GUEST)))) keys.push(key);
  }
  for (const key of keys) localStorage.removeItem(key);
};

const switchOwner = (owner: string) => {
  const previous = localStorage.getItem(ACTIVE_OWNER_KEY) ?? GUEST;
  if (previous === owner) {
    if (owner === GUEST) clearAccountSnapshots();
    return;
  }
  if (owner === GUEST) {
    // Sign-out removes account content from the active keys and every account
    // snapshot. The next person on this device starts with a blank guest state.
    localStorage.setItem(ACTIVE_OWNER_KEY, "switching");
    writeActive(emptySavedData());
    localStorage.setItem(cacheKey(GUEST), JSON.stringify(emptySavedData()));
    clearAccountSnapshots();
    localStorage.setItem(ACTIVE_OWNER_KEY, GUEST);
    return;
  }
  localStorage.setItem(cacheKey(previous), JSON.stringify(readActive()));
  localStorage.setItem(ACTIVE_OWNER_KEY, "switching");
  const saved = readCache(cacheKey(owner));
  writeActive(owner === GUEST ? saved : mergeGuestData(saved, readCache(cacheKey(GUEST))));
  localStorage.setItem(ACTIVE_OWNER_KEY, owner);
};

/** Do not discard edits that are still waiting for the database on explicit sign-out. */
export const flushSavedDataBeforeSignOut = async (userId: string): Promise<boolean> => {
  if (localStorage.getItem(ACTIVE_OWNER_KEY) !== userId) return true;
  for (let attempt = 0; attempt < 5; attempt++) {
    const local = readActive();
    const base = readCache(baseKey(userId));
    const guest = readCache(cacheKey(GUEST));
    if (sameSavedData(local, base) && !hasGuestData(guest)) return true;
    await sync(userId, generation);
    if (localStorage.getItem(ACTIVE_OWNER_KEY) !== userId) return false;
  }
  return sameSavedData(readActive(), readCache(baseKey(userId)))
    && !hasGuestData(readCache(cacheKey(GUEST)));
};

const sync = async (userId: string, epoch: number) => {
  const client = getSupabaseClient();
  if (!client) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (epoch !== generation || localStorage.getItem(ACTIVE_OWNER_KEY) !== userId) return;
    const { data: row, error: readError } = await client.from("user_saved_state")
      .select("state, revision").eq("user_id", userId).maybeSingle();
    if (readError) throw readError;
    if (epoch !== generation || localStorage.getItem(ACTIVE_OWNER_KEY) !== userId) return;
    const remote = normalize(row?.state);
    const base = readCache(baseKey(userId));
    const local = readActive();
    const guest = readCache(cacheKey(GUEST));
    const merged = mergeSavedData(base, local, hasGuestData(guest) ? mergeGuestData(remote, guest) : remote);
    if (epoch !== generation || localStorage.getItem(ACTIVE_OWNER_KEY) !== userId) return;
    if (!row || !sameSavedData(merged, remote)) {
      if (!row) {
        const { error } = await client.from("user_saved_state")
          .insert({ user_id: userId, state: merged, revision: 1 });
        if (error) {
          if (error.code === "23505") continue;
          throw error;
        }
      } else {
        const { data: updated, error } = await client.from("user_saved_state")
          .update({ state: merged, revision: row.revision + 1 })
          .eq("user_id", userId).eq("revision", row.revision).select("revision").maybeSingle();
        if (error) throw error;
        if (!updated) continue;
      }
    }
    if (epoch !== generation || localStorage.getItem(ACTIVE_OWNER_KEY) !== userId) return;
    localStorage.setItem(baseKey(userId), JSON.stringify(merged));
    if (hasGuestData(guest)) localStorage.setItem(cacheKey(GUEST), JSON.stringify(emptySavedData()));
    // Preserve edits made while the request ran. The acknowledged state is the
    // new comparison base, so a quick second toggle is not lost.
    if (!sameSavedData(local, readActive())) { schedule(); return; }
    if (!sameSavedData(local, merged)) writeActive(merged);
    return;
  }
  throw new Error("Saved data changed repeatedly while syncing");
};

const schedule = (delay = 150) => {
  if (!activeUser) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    if (running) { pending = true; return; }
    if (!activeUser) return;
    running = true;
    const userId = activeUser, epoch = generation;
    void sync(userId, epoch).then(() => { retryDelay = 3_000; missingSchemaLogged = false; }).catch((error: unknown) => {
      const code = record(error) ? error.code : undefined;
      const missingSchema = code === "PGRST205" || code === "42P01";
      if (!missingSchema || !missingSchemaLogged) {
        console.error("[Saved data] Sync failed; local edits are retained:", error);
      }
      if (missingSchema) missingSchemaLogged = true;
      if (epoch === generation) {
        if (!missingSchema) {
          schedule(retryDelay);
          retryDelay = Math.min(retryDelay * 2, 60_000);
        }
      }
    }).finally(() => {
      running = false;
      if (pending) { pending = false; schedule(); }
    });
  }, delay);
};

export const setSavedDataUser = (userId: string | null) => {
  if (activeUser === userId && started) return;
  started = true;
  activeUser = userId;
  generation++;
  retryDelay = 3_000;
  if (timer) clearTimeout(timer);
  timer = undefined;
  switchOwner(userId ?? GUEST);
  if (userId) schedule();
};

export const startSavedDataSync = () => {
  const onChange = () => schedule();
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key?.startsWith(CHECKLIST_PREFIX) || managedKeys.has(event.key ?? "")) schedule();
  };
  window.addEventListener(SAVED_DATA_CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  window.addEventListener("online", onChange);
  const interval = window.setInterval(onChange, 120_000);
  return () => {
    window.removeEventListener(SAVED_DATA_CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("online", onChange);
    window.clearInterval(interval);
  };
};
