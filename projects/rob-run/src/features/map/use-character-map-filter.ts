import { useSyncExternalStore } from "react";
import type { MapCharacterProfile } from "./map-character-profiles";

const STORAGE_KEY = "gm:filter-selected-character:v1";
const UPDATED_EVENT = "gm:character-map-filter-updated";

const readEnabled = () => localStorage.getItem(STORAGE_KEY) !== "false";
const subscribe = (notify: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) notify();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(UPDATED_EVENT, notify);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(UPDATED_EVENT, notify);
  };
};

export function useCharacterMapFilter(selectedCharacter: MapCharacterProfile | null) {
  const enabled = useSyncExternalStore(subscribe, readEnabled);
  return {
    filterCharacter: enabled ? selectedCharacter : null,
    toggle: () => {
      localStorage.setItem(STORAGE_KEY, String(!readEnabled()));
      window.dispatchEvent(new Event(UPDATED_EVENT));
    },
  };
}
