import type { MapDisplayPreferences } from "./map-display-preferences.ts";

/** A point selection only zooms in, and only when the user enables it. */
export const getMapJumpZoom = (
  currentZoom: number,
  preferences: MapDisplayPreferences,
  maximumZoom: number,
) => preferences.selectionZoomEnabled
  ? Math.max(currentZoom, Math.min(0.48 * preferences.selectionZoomPercent / 100, maximumZoom))
  : currentZoom;
