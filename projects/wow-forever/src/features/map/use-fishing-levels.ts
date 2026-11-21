import { useSyncExternalStore } from "react";

const KEY = "gm:map-fishing-levels:v1";
const EVENT = "gm:map-fishing-levels-changed";
const read = () => {
  try { return localStorage.getItem(KEY) === "true"; } catch { return false; }
};
const subscribe = (notify: () => void) => {
  const onStorage = (event: StorageEvent) => { if (event.key === KEY || event.key === null) notify(); };
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", onStorage);
  };
};
export const setFishingLevelsVisible = (visible: boolean) => {
  try { localStorage.setItem(KEY, String(visible)); } catch { return; }
  window.dispatchEvent(new Event(EVENT));
};
export const useFishingLevels = () => useSyncExternalStore(subscribe, read, () => false);
