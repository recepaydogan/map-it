import raw from "./generated/er-markers.json";
import type { Marker } from "./types";

/**
 * Real Elden Ring overworld markers, built by data/src/build-er-markers.mjs from
 * WorldMapPointParam (extracted from the player's regulation.bin). Coordinates
 * are world→pixel via the calibrated affine, then NOMINAL-rescaled.
 *
 * `erMarkers` is a LIVE BINDING: the English data is the frozen single source of
 * truth (positions, ids, drops, everything spatial). When the UI language
 * changes, `applyMarkerOverlay` reassigns `erMarkers` to localized COPIES — only
 * the text fields (name / region / description / dungeonBoss / drop names) are
 * swapped, by id; a marker can never move or disappear. See data/localized-data.ts.
 */
const BASE = raw as Marker[];
const BASE_MARKER_NAME_BY_ID = new Map(BASE.map((marker) => [marker.id, marker.name]));

/** Stable English marker name for matching generated relationships after localization. */
export const erMarkerEnglishName = (markerId: string): string | undefined =>
  BASE_MARKER_NAME_BY_ID.get(markerId);

/** Per-marker localized text, keyed by the SAME marker id (text-only, no coords). */
export type MarkerTextOverlay = Record<
  string,
  { name?: string; region?: string; description?: string; dungeonBoss?: string; drops?: string[] }
>;

export let erMarkers: Marker[] = BASE;

/** Swap to localized marker text (or back to English with `null`). Structure —
 *  ids, pixels, categories, drops, everything — is copied verbatim from BASE. */
export const applyMarkerOverlay = (ov: MarkerTextOverlay | null): void => {
  if (!ov) {
    erMarkers = BASE;
    return;
  }
  erMarkers = BASE.map((m) => {
    const e = ov[m.id];
    if (!e) return m;
    const o: Marker = { ...m };
    if (e.name) o.name = e.name;
    if (e.region) o.region = e.region;
    if (e.description) o.description = e.description;
    if (e.dungeonBoss) o.dungeonBoss = e.dungeonBoss;
    if (e.drops && m.drops) {
      o.drops = m.drops.map((d, i) => (e.drops![i] != null ? { ...d, name: e.drops![i] } : d));
    }
    return o;
  });
};
