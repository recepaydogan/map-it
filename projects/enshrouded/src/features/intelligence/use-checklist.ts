import { useCallback, useSyncExternalStore } from "react";
import { notifySavedDataChange, SAVED_DATA_REFRESH_EVENT } from "../../services/saved-data/saved-data-events";

type Snapshot = { ids: string[]; error: boolean };
const memory = new Map<string, string>();
const eventName = "player-checklist-change";
function read(key: string): string {
  if (!memory.has(key)) {
    try {
      const ids: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
      if (!Array.isArray(ids) || ids.some(id => typeof id !== "string")) throw new Error("Invalid checklist data");
      memory.set(key, JSON.stringify({ ids, error: false }));
    } catch (error) {
      console.error("Could not restore player checklist", error);
      memory.set(key, JSON.stringify({ ids: [], error: true }));
    }
  }
  return memory.get(key)!;
}

export function useChecklist(scope: string) {
  const key = `player-checklist-v1:${scope}`;
  const subscribe = useCallback((callback: () => void) => {
    const updated = () => callback();
    const changed = (event: StorageEvent) => { if (event.key === key || event.key === null) { memory.delete(key); callback(); } };
    const refreshed = () => { memory.delete(key); callback(); };
    window.addEventListener(eventName, updated);
    window.addEventListener("storage", changed);
    window.addEventListener(SAVED_DATA_REFRESH_EVENT, refreshed);
    return () => { window.removeEventListener(eventName, updated); window.removeEventListener("storage", changed); window.removeEventListener(SAVED_DATA_REFRESH_EVENT, refreshed); };
  }, [key]);
  const snapshot = useSyncExternalStore(subscribe, () => read(key));
  const state = JSON.parse(snapshot) as Snapshot;
  const toggle = (id: string) => {
    const current = JSON.parse(read(key)) as Snapshot;
    const ids = current.ids.includes(id) ? current.ids.filter(value => value !== id) : [...current.ids, id];
    let error = false;
    try { localStorage.setItem(key, JSON.stringify(ids)); notifySavedDataChange(); }
    catch (cause) { error = true; console.error("Could not save player checklist", cause); }
    memory.set(key, JSON.stringify({ ids, error }));
    window.dispatchEvent(new Event(eventName));
  };
  return { ids: new Set(state.ids), error: state.error, toggle };
}
