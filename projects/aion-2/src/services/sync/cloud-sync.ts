import { getSupabaseClient } from "../../data/supabase-client";
import { EVENT_PREFERENCES_CHANGE_EVENT, EVENT_PREFERENCES_KEY } from "../../features/events/event-preferences-store";
import { CHARACTER_PROFILE_CHANGE_EVENT, LAST_CHARACTER_KEY } from "../../features/character-profiles/character-profile-store";
import {
  COMPLETED_LOCATIONS_STORAGE_KEY,
  FAVORITES_STORAGE_KEY,
  MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY,
} from "../../features/map/saved-map-storage";
import {
  emptySavedUserData,
  mergeSavedUserData,
  normalizeSavedUserData,
  readSavedUserData,
  savedUserDataEqual,
  writeSavedUserData,
  type SavedUserData,
} from "./saved-user-data";

const OWNER_KEY = "gm:saved-data-owner";
const SWITCH_KEY = "gm:saved-data-switch";
const GUEST_KEY = "gm:pending-guest-data";
const PURGED_USER_KEY = "gm:signed-out-user";
const cacheKey = (userId: string) => `gm:saved-data-cache:${userId}`;
const baseKey = (userId: string) => `gm:saved-data-base:${userId}`;
const SYNC_DELAY_MS = 500;
const POLL_MS = 60_000;
const SIGN_OUT_SYNC_TIMEOUT_MS = 10_000;
const MAP_KEYS = new Set([
  FAVORITES_STORAGE_KEY, COMPLETED_LOCATIONS_STORAGE_KEY, MARKERS_STORAGE_KEY, NOTES_STORAGE_KEY,
]);

let activeUserId: string | null = null;
let installed = false;
let applying = false;
let syncTask: Promise<void> | null = null;
let pending = false;
let timer: ReturnType<typeof setTimeout> | undefined;
export type CloudSyncStatus = "idle" | "pending" | "syncing" | "synced" | "error";
let status: CloudSyncStatus = "idle";
const statusListeners = new Set<() => void>();
const setStatus = (next: CloudSyncStatus) => {
  if (status === next) return;
  status = next;
  statusListeners.forEach((listener) => listener());
};
export const getCloudSyncStatus = (): CloudSyncStatus => status;
export const subscribeCloudSyncStatus = (listener: () => void): (() => void) => {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
};

const readStored = (key: string): SavedUserData => {
  const raw = localStorage.getItem(key);
  if (!raw) return emptySavedUserData();
  try { return normalizeSavedUserData(JSON.parse(raw) as unknown); }
  catch (error) {
    console.error("Could not restore cached account data", error);
    return emptySavedUserData();
  }
};

const saveStored = (key: string, data: SavedUserData) =>
  localStorage.setItem(key, JSON.stringify(data));

const purgedUserId = (): string | null => {
  const raw = localStorage.getItem(PURGED_USER_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { userId?: unknown };
    return typeof value.userId === "string" ? value.userId : null;
  } catch (error) {
    console.error("Could not read signed-out user marker", error);
    return null;
  }
};

const applyLocal = (data: SavedUserData) => {
  applying = true;
  try { writeSavedUserData(localStorage, data); }
  finally { applying = false; }
};

/** Finish an interrupted account switch before reading the visible keys. */
const recoverPendingSwitch = () => {
  const raw = localStorage.getItem(SWITCH_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as { target?: unknown };
    if (parsed.target !== null && typeof parsed.target !== "string") throw new Error("Invalid saved data owner");
    if (parsed.target) {
      localStorage.setItem(OWNER_KEY, parsed.target);
      applyLocal(mergeSavedUserData(emptySavedUserData(), readStored(GUEST_KEY), readStored(cacheKey(parsed.target))));
    } else {
      localStorage.removeItem(OWNER_KEY);
      applyLocal(readStored(GUEST_KEY));
    }
    localStorage.removeItem(SWITCH_KEY);
  } catch (error) {
    console.error("Could not finish switching saved user data", error);
    throw error;
  }
};

/** Keep one visible local dataset, with an independent cache for each account. */
export const setCloudSyncUser = (userId: string | null): void => {
  recoverPendingSwitch();
  if (userId && purgedUserId() === userId) return;
  const previousUserId = activeUserId;
  activeUserId = userId;
  const owner = localStorage.getItem(OWNER_KEY);
  if (previousUserId === userId && owner === userId) return;
  if (owner !== userId) {
    if (owner && purgedUserId() !== owner) saveStored(cacheKey(owner), readSavedUserData(localStorage));
    else if (userId) {
      const guest = readSavedUserData(localStorage);
      if (!savedUserDataEqual(guest, emptySavedUserData())) saveStored(GUEST_KEY, guest);
      else localStorage.removeItem(GUEST_KEY);
    }

    if (userId) {
      const account = readStored(cacheKey(userId));
      const guest = readStored(GUEST_KEY);
      localStorage.setItem(SWITCH_KEY, JSON.stringify({ target: userId }));
      localStorage.setItem(OWNER_KEY, userId);
      applyLocal(mergeSavedUserData(emptySavedUserData(), guest, account));
    } else {
      localStorage.setItem(SWITCH_KEY, JSON.stringify({ target: null }));
      localStorage.removeItem(OWNER_KEY);
      applyLocal(readStored(GUEST_KEY));
    }
    localStorage.removeItem(SWITCH_KEY);
  }
  if (userId) {
    setStatus("pending");
    scheduleSync(0);
  } else {
    setStatus("idle");
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
};

export const clearSignedOutUserMarker = (userId: string): void => {
  if (purgedUserId() === userId) {
    localStorage.removeItem(PURGED_USER_KEY);
    setCloudSyncUser(userId);
  }
};

const syncOnce = async (userId: string): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) return;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (activeUserId !== userId || localStorage.getItem(OWNER_KEY) !== userId) return;
    const base = readStored(baseKey(userId));
    const local = readSavedUserData(localStorage);
    const { data: row, error: readError } = await client.from("user_saved_data")
      .select("data, revision").eq("user_id", userId).maybeSingle();
    if (readError) throw readError;
    const remote = normalizeSavedUserData(row?.data);
    const merged = mergeSavedUserData(base, local, remote);
    if (!savedUserDataEqual(merged, remote) || !row) {
      if (row) {
        const { data: updated, error } = await client.from("user_saved_data")
          .update({ data: merged, revision: Number(row.revision) + 1 })
          .eq("user_id", userId).eq("revision", row.revision)
          .select("revision");
        if (error) throw error;
        if (!updated?.length) continue;
      } else {
        const { error } = await client.from("user_saved_data")
          .insert({ user_id: userId, data: merged, revision: 1 });
        if (error?.code === "23505") continue;
        if (error) throw error;
      }
    }
    if (activeUserId !== userId || localStorage.getItem(OWNER_KEY) !== userId) {
      if (purgedUserId() === userId) return;
      const cached = readStored(cacheKey(userId));
      saveStored(cacheKey(userId), mergeSavedUserData(local, cached, merged));
      saveStored(baseKey(userId), merged);
      return;
    }
    const current = readSavedUserData(localStorage);
    const rebased = mergeSavedUserData(local, current, merged);
    saveStored(cacheKey(userId), rebased);
    if (!savedUserDataEqual(rebased, current)) applyLocal(rebased);
    saveStored(baseKey(userId), merged);
    if (localStorage.getItem(GUEST_KEY)) localStorage.removeItem(GUEST_KEY);
    if (!savedUserDataEqual(rebased, merged)) pending = true;
    if (activeUserId === userId) setStatus(pending ? "pending" : "synced");
    return;
  }
  throw new Error("Saved user data changed concurrently too many times.");
};

const runSync = (): Promise<void> => {
  if (syncTask) { pending = true; return syncTask; }
  syncTask = Promise.resolve().then(async () => {
    do {
      pending = false;
      const userId = activeUserId;
      if (!userId) break;
      setStatus("syncing");
      try { await syncOnce(userId); }
      catch (error) {
        console.error("Could not synchronize saved user data", error);
        if (activeUserId === userId) setStatus("error");
        else pending = true;
        if (activeUserId === userId) break;
      }
    } while (pending);
  }).finally(() => { syncTask = null; });
  return syncTask;
};

/** Refuse to discard local progress when the server has not received it. */
export const flushCloudSync = async (userId: string): Promise<boolean> => {
  if (activeUserId !== userId || localStorage.getItem(OWNER_KEY) !== userId) return false;
  const hasPendingData = () => !savedUserDataEqual(
    readSavedUserData(localStorage), readStored(baseKey(userId)),
  ) || localStorage.getItem(GUEST_KEY) !== null;
  if (!hasPendingData()) return true;
  if (timer) clearTimeout(timer);
  timer = undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      runSync(),
      new Promise<void>((resolve) => { timeout = setTimeout(resolve, SIGN_OUT_SYNC_TIMEOUT_MS); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return activeUserId === userId && localStorage.getItem(OWNER_KEY) === userId && !hasPendingData();
};

/** Purge account progress after an explicit, successfully synchronized sign-out. */
export const clearCloudSyncAfterSignOut = (userId: string): void => {
  localStorage.setItem(PURGED_USER_KEY, JSON.stringify({ userId, nonce: crypto.randomUUID() }));
  setCloudSyncUser(null);
  localStorage.removeItem(cacheKey(userId));
  localStorage.removeItem(baseKey(userId));
  localStorage.removeItem(GUEST_KEY);
  applyLocal(emptySavedUserData());
};

const scheduleSync = (delayMs = SYNC_DELAY_MS) => {
  if (!activeUserId) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = undefined; void runSync(); }, delayMs);
};

const onLocalChange = () => {
  if (applying || !activeUserId || localStorage.getItem(OWNER_KEY) !== activeUserId) return;
  saveStored(cacheKey(activeUserId), readSavedUserData(localStorage));
  setStatus("pending");
  scheduleSync();
};

/** Called once per dashboard window; auth changes are supplied by AuthProvider. */
export const startCloudSync = (): void => {
  if (installed) return;
  installed = true;
  window.addEventListener("gm:saved-state-changed", onLocalChange);
  window.addEventListener("player-checklist-change", onLocalChange);
  window.addEventListener(EVENT_PREFERENCES_CHANGE_EVENT, onLocalChange);
  window.addEventListener(CHARACTER_PROFILE_CHANGE_EVENT, onLocalChange);
  window.addEventListener("storage", (event) => {
    if (event.key === PURGED_USER_KEY && event.newValue) {
      const userId = purgedUserId();
      if (userId) {
        setCloudSyncUser(null);
        localStorage.removeItem(cacheKey(userId));
        localStorage.removeItem(baseKey(userId));
        localStorage.removeItem(GUEST_KEY);
        applyLocal(emptySavedUserData());
      }
      return;
    }
    if (event.key === OWNER_KEY) return;
    if (event.key === null || MAP_KEYS.has(event.key ?? "")
      || event.key === EVENT_PREFERENCES_KEY || event.key === LAST_CHARACTER_KEY
      || event.key?.startsWith("player-checklist-v1:")) onLocalChange();
  });
  window.addEventListener("online", () => scheduleSync(0));
  setInterval(scheduleSync, POLL_MS);
};
