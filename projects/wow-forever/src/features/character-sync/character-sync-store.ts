import { useSyncExternalStore } from "react";
import type { CharacterSnapshot } from "./character-snapshot";
import { getProfessionType } from "./profession-identities";

// The source changes; saved characters and their identities stay in the same store.
export const CHARACTER_SYNC_KEY = "wfm:character-sync:v1";
export const CHARACTER_SYNC_EVENT = "wfm-character-sync-updated";
export interface CharacterSyncState {
  version: 1;
  characters: Record<string, CharacterSnapshot>;
  currentId: string | null;
  /** Identity from the last imported SavedVariables root.current, independent of GEP deltas. */
  savedCurrentId?: string | null;
  savedCurrentAt?: number;
  phase: "checking" | "waiting" | "synced" | "error" | "browser";
  checkedAt: number | null;
  liveConnected?: boolean;
}
const initial: CharacterSyncState = { version: 1, characters: {}, currentId: null, phase: typeof overwolf === "undefined" ? "browser" : "checking", checkedAt: null };
let cachedText: string | null | undefined;
let cachedState = initial;
export function getCharacterSyncState(): CharacterSyncState {
  let serialized: string | null;
  try { serialized = localStorage.getItem(CHARACTER_SYNC_KEY); } catch { return cachedState; }
  if (serialized === cachedText) return cachedState;
  cachedText = serialized;
  try {
    const value = JSON.parse(serialized ?? "null") as CharacterSyncState | null;
    if (!value || value.version !== 1 || !value.characters || typeof value.characters !== "object" ||
      !Object.values(value.characters).every(c => c && typeof c.id === "string" && typeof c.name === "string" && Array.isArray(c.professions))) throw new Error("invalid-cache");
    // Restore the added field for offline characters cached by older app versions.
    cachedState = { version: 1, currentId: value.currentId ?? null,
      savedCurrentId: value.savedCurrentId ?? null, savedCurrentAt: value.savedCurrentAt,
      phase: value.phase ?? initial.phase,
      checkedAt: value.checkedAt ?? null, liveConnected: value.liveConnected === true, characters: Object.fromEntries(Object.entries(value.characters).map(([id, character]) =>
      [id, { ...character, updatedAt: character.updatedAt > 1e12 ? Math.floor(character.updatedAt / 1000) : character.updatedAt, professions: character.professions.map(profession =>
        ({ ...profession, type: character.source === "gep" ? profession.type : getProfessionType(profession.id) })) }])) };
  } catch { cachedState = initial; }
  return cachedState;
}
export function writeCharacterSyncState(value: CharacterSyncState) {
  const serialized = JSON.stringify(value);
  localStorage.setItem(CHARACTER_SYNC_KEY, serialized);
  cachedText = serialized; cachedState = value;
  window.dispatchEvent(new Event(CHARACTER_SYNC_EVENT));
}
const subscribe = (listener: () => void) => {
  const changed = (event: Event) => { if (!(event instanceof StorageEvent) || !event.key || event.key === CHARACTER_SYNC_KEY) listener(); };
  window.addEventListener("storage", changed); window.addEventListener(CHARACTER_SYNC_EVENT, changed);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener(CHARACTER_SYNC_EVENT, changed); };
};
export const useCharacterSync = () => useSyncExternalStore(subscribe, getCharacterSyncState, () => initial);
