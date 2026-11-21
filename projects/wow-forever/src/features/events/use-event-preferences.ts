import { useSyncExternalStore } from "react";
import { eventPreferencesStore } from "./event-preferences-store";

export type { EventPreferences } from "./event-preferences";

/** One preference store for Events, synchronized across app windows. */
export function useEventPreferences() {
  const result = useSyncExternalStore(eventPreferencesStore.subscribe, eventPreferencesStore.getSnapshot);
  return { preferences: result.preferences, error: result.error, update: eventPreferencesStore.update };
}
