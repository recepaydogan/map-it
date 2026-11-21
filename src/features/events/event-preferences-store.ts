import { defaultEventPreferences, parseEventPreferences, type EventPreferences } from "./event-preferences.ts";
import { notifySavedDataChange, SAVED_DATA_REFRESH_EVENT } from "../../services/saved-data/saved-data-events";

export const EVENT_PREFERENCES_KEY = "map-it:event-reminders:v1";
type State = { preferences: EventPreferences; error: boolean };

/** Keep reminder choices synchronized across app windows. */
export function createEventPreferencesStore(options: {
  storage: Pick<Storage, "getItem" | "setItem">;
  listen: (sync: () => void) => () => void;
}) {
  const listeners = new Set<() => void>();
  const read = (): State => {
    try { return { preferences: parseEventPreferences(options.storage.getItem(EVENT_PREFERENCES_KEY)), error: false }; }
    catch (error) {
      console.error("Failed to read event preferences", error);
      return { preferences: defaultEventPreferences(), error: true };
    }
  };
  let state = read();
  let removeListener: (() => void) | undefined;
  const emit = () => listeners.forEach((listener) => listener());
  const sync = () => { state = read(); emit(); };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) { removeListener = options.listen(sync); sync(); }
      return () => { listeners.delete(listener); if (!listeners.size) { removeListener?.(); removeListener = undefined; } };
    },
    update: (patch: Partial<EventPreferences>) => {
      const stored = read();
      const preferences = { ...(stored.error ? state.preferences : stored.preferences), ...patch };
      parseEventPreferences(JSON.stringify(preferences));
      try {
        options.storage.setItem(EVENT_PREFERENCES_KEY, JSON.stringify(preferences));
        state = { preferences, error: false };
        notifySavedDataChange();
      } catch (error) {
        console.error("Failed to save event preferences", error);
        state = { preferences, error: true };
      }
      emit();
    },
  };
}

// Lazy initialization avoids reading storage before the browser host is available.
let store: ReturnType<typeof createEventPreferencesStore> | undefined;
const getStore = () => store ??= createEventPreferencesStore({
  storage: { getItem: (key) => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) },
  listen: (sync) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === EVENT_PREFERENCES_KEY || event.key === null) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SAVED_DATA_REFRESH_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SAVED_DATA_REFRESH_EVENT, sync);
    };
  },
});
export const eventPreferencesStore = {
  getSnapshot: () => getStore().getSnapshot(),
  subscribe: (listener: () => void) => getStore().subscribe(listener),
  update: (patch: Partial<EventPreferences>) => getStore().update(patch),
};
