/**
 * How the map draws itself — the preferences the Settings page owns.
 *
 * Shared by every window that renders the map (desktop dashboard and the in-game
 * overlay), so it uses the same localStorage-backed external store as the launch
 * preferences: writes notify this window directly, the `storage` event carries
 * them to the others. Layer visibility and filters are deliberately NOT here —
 * those are per-view map state, not settings.
 */

export interface MapDisplayPreferences {
  /** Collapse nearby pins of the same type into one icon while zoomed out. */
  clusterMarkers: boolean;
  /** Zoom in when a marker is picked, instead of only panning to it. */
  selectionZoomEnabled: boolean;
  /**
   * How close a pick zooms, as a percentage of the default close-up (100%).
   * Only ever a floor: a view already closer than this keeps its zoom.
   */
  selectionZoomPercent: number;
  /** Opacity of the in-game minimap's map content. */
  minimapOpacityPercent: number;
}

const STORAGE_KEY = "phantom-blade-app:map-display-preferences";

export const SELECTION_ZOOM_MIN_PERCENT = 100;
export const SELECTION_ZOOM_MAX_PERCENT = 300;
export const MINIMAP_OPACITY_MIN_PERCENT = 20;
export const MINIMAP_OPACITY_MAX_PERCENT = 100;
export const MINIMAP_OPACITY_STEP_PERCENT = 5;

export const DEFAULT_MAP_DISPLAY_PREFERENCES: MapDisplayPreferences = {
  clusterMarkers: true,
  selectionZoomEnabled: true,
  selectionZoomPercent: 100,
  minimapOpacityPercent: MINIMAP_OPACITY_MAX_PERCENT,
};

const clampPercent = (value: number) =>
  Math.min(SELECTION_ZOOM_MAX_PERCENT, Math.max(SELECTION_ZOOM_MIN_PERCENT, Math.round(value)));

const normalizeMinimapOpacity = (value: number) => {
  const rounded = Math.round(value / MINIMAP_OPACITY_STEP_PERCENT) * MINIMAP_OPACITY_STEP_PERCENT;
  return Math.min(MINIMAP_OPACITY_MAX_PERCENT, Math.max(MINIMAP_OPACITY_MIN_PERCENT, rounded));
};

/** Defensive merge — stored shape may be partial, stale, or hand-edited. */
const normalize = (raw: unknown): MapDisplayPreferences => {
  const value = (typeof raw === "object" && raw !== null ? raw : {}) as Partial<MapDisplayPreferences>;
  return {
    clusterMarkers:
      typeof value.clusterMarkers === "boolean"
        ? value.clusterMarkers
        : DEFAULT_MAP_DISPLAY_PREFERENCES.clusterMarkers,
    selectionZoomEnabled:
      typeof value.selectionZoomEnabled === "boolean"
        ? value.selectionZoomEnabled
        : DEFAULT_MAP_DISPLAY_PREFERENCES.selectionZoomEnabled,
    selectionZoomPercent:
      typeof value.selectionZoomPercent === "number" && Number.isFinite(value.selectionZoomPercent)
        ? clampPercent(value.selectionZoomPercent)
        : DEFAULT_MAP_DISPLAY_PREFERENCES.selectionZoomPercent,
    minimapOpacityPercent:
      typeof value.minimapOpacityPercent === "number" && Number.isFinite(value.minimapOpacityPercent)
        ? normalizeMinimapOpacity(value.minimapOpacityPercent)
        : DEFAULT_MAP_DISPLAY_PREFERENCES.minimapOpacityPercent,
  };
};

const readSettings = (): MapDisplayPreferences => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : { ...DEFAULT_MAP_DISPLAY_PREFERENCES };
  } catch {
    return { ...DEFAULT_MAP_DISPLAY_PREFERENCES };
  }
};

const writeSettings = (settings: MapDisplayPreferences): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Non-fatal — a display preference, never worth breaking the map over.
  }
};

// --- Reactive store (useSyncExternalStore-friendly) -------------------------

type Listener = () => void;
const listeners = new Set<Listener>();
/** Stable snapshot reference — only changes when the value changes. */
let snapshot: MapDisplayPreferences | null = null;

const invalidate = (): void => {
  snapshot = null;
  for (const listener of listeners) listener();
};

export const subscribeMapDisplayPreferences = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getMapDisplayPreferences = (): MapDisplayPreferences => {
  if (!snapshot) snapshot = readSettings();
  return snapshot;
};

/** Merge a partial update, persist, and notify this window's consumers. */
export const updateMapDisplayPreferences = (patch: Partial<MapDisplayPreferences>): void => {
  const next = normalize({ ...getMapDisplayPreferences(), ...patch });
  snapshot = next;
  writeSettings(next);
  // `storage` only fires in *other* windows, so notify this one directly.
  for (const listener of listeners) listener();
};

// Keep the desktop map and the in-game overlay map in step.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY || event.key === null) invalidate();
  });
}
