import { useSyncExternalStore } from "react";
import type { MapLandmark, LandmarkStatus } from "./map-landmark-types";
export interface LandmarkFilters {
  name: "all" | LandmarkStatus;
  position: "all" | LandmarkStatus;
  gamePhoto: "all" | "with" | "without";
}
export const DEFAULT_LANDMARK_FILTERS: LandmarkFilters = { name: "all", position: "all", gamePhoto: "all" };
const storageKey = "gta6-app:landmark-filters:v1";
const allowed: Record<keyof LandmarkFilters, readonly string[]> = {
  name: ["all", "confirmed", "unconfirmed", "unknown"], position: ["all", "confirmed", "unconfirmed", "unknown"],
  gamePhoto: ["all", "with", "without"],
};
const read = (): LandmarkFilters => {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? "{}");
    return Object.fromEntries(Object.entries(allowed).map(([key, values]) => [key, values.includes(raw?.[key]) ? raw[key] : "all"])) as unknown as LandmarkFilters;
  } catch { return { ...DEFAULT_LANDMARK_FILTERS }; }
};
let current = read();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(listener => listener());
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
if (typeof window !== "undefined") window.addEventListener("storage", event => { if (event.key === storageKey || event.key === null) { current = read(); emit(); } });
export const useLandmarkFilters = () => useSyncExternalStore(subscribe, () => current);
export const setLandmarkFilters = (value: LandmarkFilters) => {
  current = value;
  try { localStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* The current session still works without storage. */ }
  emit();
};
export const matchesLandmarkFilters = (landmark: MapLandmark | undefined, filters: LandmarkFilters): boolean => {
  if (!landmark) return true;
  return (filters.name === "all" || filters.name === landmark.nameStatus)
    && (filters.position === "all" || filters.position === landmark.positionStatus)
    && (filters.gamePhoto === "all" || Boolean(landmark.gamePhoto) === (filters.gamePhoto === "with"));
};
