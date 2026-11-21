import {
  COMPLETED_LOCATIONS_STORAGE_KEY, FAVORITES_STORAGE_KEY, MARKERS_STORAGE_KEY,
  NOTES_STORAGE_KEY, SAVED_MAP_STORAGE_VERSION_KEY, migrateSavedMapStorage,
} from "./saved-map-storage";
import { emptySavedMapSnapshot, mergeSavedMapSnapshots, parseSavedMapSnapshot, sameSavedValue, type SavedMapSnapshot } from "./saved-map-merge";

export const SAVED_MAP_CHANGE_EVENT = "gm:saved-state-changed";
export const SAVED_MAP_OWNER_KEY = "gm:saved-map-owner";
export const SAVED_MAP_ACCOUNT_PREFIX = "gm:account-map-state:";
const GUEST = "guest";
const LEGACY_KEYS = [FAVORITES_STORAGE_KEY, COMPLETED_LOCATIONS_STORAGE_KEY, MARKERS_STORAGE_KEY, NOTES_STORAGE_KEY, SAVED_MAP_STORAGE_VERSION_KEY];
interface LocalDocument {
  values: Record<string, string>;
  baseline?: SavedMapSnapshot;
  conflicts?: Record<string, unknown[]>;
  guestBackups?: SavedMapSnapshot[];
}

const readDocument = (scope: string): LocalDocument => {
  const value = localStorage.getItem(SAVED_MAP_ACCOUNT_PREFIX + scope);
  if (!value) return { values: {} };
  const document = JSON.parse(value) as LocalDocument;
  if (!document.values || typeof document.values !== "object") throw new Error("Invalid local account map state");
  return document;
};
const writeDocument = (scope: string, document: LocalDocument) => {
  const key = SAVED_MAP_ACCOUNT_PREFIX + scope;
  const value = JSON.stringify(document);
  if (localStorage.getItem(key) !== value) localStorage.setItem(key, value);
};

export const activeSavedMapScope = () => localStorage.getItem(SAVED_MAP_OWNER_KEY) ?? GUEST;
export const notifySavedMapChange = () => window.dispatchEvent(new Event(SAVED_MAP_CHANGE_EVENT));

/** One atomic document per account. Legacy unscoped records seed the guest once. */
export const getSavedMapStorage = (scope = activeSavedMapScope()) => {
  if (!localStorage.getItem(SAVED_MAP_ACCOUNT_PREFIX + GUEST)) {
    const values: Record<string, string> = {};
    for (const key of LEGACY_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) values[key] = value;
    }
    writeDocument(GUEST, { values });
  }
  // The durable scoped documents own these values, including after an earlier app upgrade.
  for (const key of LEGACY_KEYS) if (localStorage.getItem(key) !== null) localStorage.removeItem(key);
  return {
    getItem: (key: string) => readDocument(scope).values[key] ?? null,
    setItem: (key: string, value: string) => {
      const document = readDocument(scope);
      document.values[key] = value;
      writeDocument(scope, document);
    },
  };
};

export const readAccountSnapshot = (scope: string): SavedMapSnapshot => {
  const storage = getSavedMapStorage(scope);
  const read = (key: string, fallback: unknown) => JSON.parse(storage.getItem(key) ?? JSON.stringify(fallback)) as unknown;
  return parseSavedMapSnapshot({
    favoriteIds: read(FAVORITES_STORAGE_KEY, []),
    completedIds: read(COMPLETED_LOCATIONS_STORAGE_KEY, []),
    markers: read(MARKERS_STORAGE_KEY, []),
    notes: read(NOTES_STORAGE_KEY, {}),
    conflicts: readDocument(scope).conflicts,
  });
};

export const readAccountBaseline = (scope: string) => readDocument(scope).baseline ?? null;

/** Never discard offline edits. Acknowledged account caches can be fetched again. */
export const clearSyncedAccountCache = (scope: string) => {
  const baseline = readAccountBaseline(scope);
  if (!baseline || !sameSavedValue(readAccountSnapshot(scope), baseline)) return false;
  localStorage.removeItem(SAVED_MAP_ACCOUNT_PREFIX + scope);
  return true;
};
export const writeAccountSnapshot = (scope: string, snapshot: SavedMapSnapshot, baseline?: SavedMapSnapshot) => {
  const document = readDocument(scope);
  document.values[FAVORITES_STORAGE_KEY] = JSON.stringify(snapshot.favoriteIds);
  document.values[COMPLETED_LOCATIONS_STORAGE_KEY] = JSON.stringify(snapshot.completedIds);
  document.values[MARKERS_STORAGE_KEY] = JSON.stringify(snapshot.markers);
  document.values[NOTES_STORAGE_KEY] = JSON.stringify(snapshot.notes);
  document.conflicts = snapshot.conflicts;
  if (baseline !== undefined) document.baseline = baseline;
  writeDocument(scope, document);
};

/** Called synchronously on auth transitions, before account UI renders. */
export const activateSavedMapAccount = (userId: string | null) => {
  const next = userId ?? GUEST;
  const previous = activeSavedMapScope();
  migrateSavedMapStorage(getSavedMapStorage(next));
  if (userId && previous === GUEST) {
    migrateSavedMapStorage(getSavedMapStorage(GUEST));
    const guest = readAccountSnapshot(GUEST);
    const account = readAccountSnapshot(next);
    if (guest.favoriteIds.length || guest.completedIds.length || guest.markers.length || Object.keys(guest.notes).length) {
      // Preserve the exact pre-claim document, without copying one account into another.
      const document = readDocument(next);
      document.guestBackups = [...(document.guestBackups ?? []), guest];
      writeDocument(next, document);
      writeAccountSnapshot(next, mergeSavedMapSnapshots(null, guest, account));
      writeAccountSnapshot(GUEST, emptySavedMapSnapshot());
    }
  }
  localStorage.setItem(SAVED_MAP_OWNER_KEY, next);
  if (next !== previous && previous !== GUEST) clearSyncedAccountCache(previous);
  if (next !== previous) notifySavedMapChange();
};
