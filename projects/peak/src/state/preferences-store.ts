import { useSyncExternalStore } from "react";

// Every user-facing preference lives here. The store is a plain localStorage
// snapshot rather than a React context because the background page, the
// desktop window and the in-game overlay are three separate browser contexts:
// the `storage` event is what keeps them in sync, so a change made in Settings
// reaches the overlay while the game is running.

export interface AppPreferences {
  // ── General ──────────────────────────────────────────────────
  minimizeToTray: boolean;

  // ── Game integration ─────────────────────────────────────────
  openOnGameLaunch: boolean;
  showOverlayOnGameLaunch: boolean;
  /** Move the desktop window to the second monitor when PEAK takes over one. */
  moveWindowOffGameMonitor: boolean;

  // ── Atlas map ────────────────────────────────────────────────
  /** Pin size relative to the default, in percent. */
  markerScalePercent: number;
  showTrail: boolean;
  showPreviousTrails: boolean;
  showDeaths: boolean;
  /** Keep the desktop map centred on the scout as soon as a run is live. */
  followPlayerOnMap: boolean;
  /** Carry the legend's category selection over to the next session. */
  rememberMapFilters: boolean;
  /** Shared desktop/overlay selection; null means "everything is on". */
  mapCategoryFilters: string[] | null;

  // ── In-game overlay ──────────────────────────────────────────
  overlayOpacityPercent: number;
  /** Mini-map zoom as a share of the map's maximum zoom. */
  overlayZoomPercent: number;
  /** Hide the drag bar so the overlay cannot be moved by accident. */
  overlayLocked: boolean;
}

export const DEFAULT_PREFERENCES: AppPreferences = {
  minimizeToTray: true,
  openOnGameLaunch: true,
  showOverlayOnGameLaunch: true,
  moveWindowOffGameMonitor: true,
  markerScalePercent: 100,
  showTrail: true,
  showPreviousTrails: true,
  showDeaths: true,
  followPlayerOnMap: false,
  rememberMapFilters: false,
  mapCategoryFilters: null,
  overlayOpacityPercent: 100,
  overlayZoomPercent: 100,
  overlayLocked: false,
};

/** Slider bounds, shared by the store's clamp and the Settings UI. */
export const PREFERENCE_RANGES = {
  markerScalePercent: { min: 60, max: 220, step: 5 },
  overlayOpacityPercent: { min: 35, max: 100, step: 5 },
  overlayZoomPercent: { min: 25, max: 100, step: 5 },
} as const;

const STORAGE_KEY = "peak-map:preferences";
const listeners = new Set<() => void>();

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const clamped = (
  value: unknown,
  fallback: number,
  range: { min: number; max: number },
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(range.max, Math.max(range.min, Math.round(value)))
    : fallback;

const stringList = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? (value as string[])
    : null;

// Preferences written by an older app version are missing whatever shipped
// since, so every field falls back to its default rather than to `undefined`.
const sanitize = (parsed: Partial<AppPreferences>): AppPreferences => ({
  minimizeToTray: bool(parsed.minimizeToTray, DEFAULT_PREFERENCES.minimizeToTray),
  openOnGameLaunch: bool(parsed.openOnGameLaunch, DEFAULT_PREFERENCES.openOnGameLaunch),
  showOverlayOnGameLaunch: bool(
    parsed.showOverlayOnGameLaunch,
    DEFAULT_PREFERENCES.showOverlayOnGameLaunch,
  ),
  moveWindowOffGameMonitor: bool(
    parsed.moveWindowOffGameMonitor,
    DEFAULT_PREFERENCES.moveWindowOffGameMonitor,
  ),
  markerScalePercent: clamped(
    parsed.markerScalePercent,
    DEFAULT_PREFERENCES.markerScalePercent,
    PREFERENCE_RANGES.markerScalePercent,
  ),
  showTrail: bool(parsed.showTrail, DEFAULT_PREFERENCES.showTrail),
  showPreviousTrails: bool(parsed.showPreviousTrails, DEFAULT_PREFERENCES.showPreviousTrails),
  showDeaths: bool(parsed.showDeaths, DEFAULT_PREFERENCES.showDeaths),
  followPlayerOnMap: bool(parsed.followPlayerOnMap, DEFAULT_PREFERENCES.followPlayerOnMap),
  rememberMapFilters: bool(parsed.rememberMapFilters, DEFAULT_PREFERENCES.rememberMapFilters),
  mapCategoryFilters: stringList(parsed.mapCategoryFilters),
  overlayOpacityPercent: clamped(
    parsed.overlayOpacityPercent,
    DEFAULT_PREFERENCES.overlayOpacityPercent,
    PREFERENCE_RANGES.overlayOpacityPercent,
  ),
  overlayZoomPercent: clamped(
    parsed.overlayZoomPercent,
    DEFAULT_PREFERENCES.overlayZoomPercent,
    PREFERENCE_RANGES.overlayZoomPercent,
  ),
  overlayLocked: bool(parsed.overlayLocked, DEFAULT_PREFERENCES.overlayLocked),
});

const readStoredPreferences = (): AppPreferences => {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;
  try {
    return sanitize(
      JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<AppPreferences>,
    );
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

let snapshot = readStoredPreferences();

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

const onStorage = (event: StorageEvent): void => {
  if (event.key !== STORAGE_KEY) return;
  snapshot = readStoredPreferences();
  emitChange();
};

if (typeof window !== "undefined") {
  window.addEventListener("storage", onStorage);
}

export const getPreferences = (): AppPreferences => snapshot;

export const setPreference = <Key extends keyof AppPreferences>(
  key: Key,
  value: AppPreferences[Key],
): void => {
  snapshot = sanitize({ ...snapshot, [key]: value });
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  emitChange();
};

export const resetPreferences = (): void => {
  snapshot = DEFAULT_PREFERENCES;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  emitChange();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePreferences = (): AppPreferences =>
  useSyncExternalStore(subscribe, getPreferences, () => DEFAULT_PREFERENCES);
