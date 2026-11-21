import { bossPortraitUrl, nrBossPortraitUrl } from "../utils/assets";
import bossImages from "./generated/er-boss-images.json";
import nrBossImages from "./generated/nr-boss-images.json";

/**
 * Portrait screenshots for every boss/miniboss marker, keyed by marker id so
 * lookups survive marker-name localization. The webp set lives in the
 * ER-Atlas-Assets repo and streams from the jsDelivr CDN (VITE_ASSET_BASE),
 * like the item icons; refresh/extend via data/src/fetch-boss-images.mjs.
 */
export const bossImageFor = (markerId: string): string | null => {
  const file = (bossImages as Record<string, string>)[markerId];
  return file ? bossPortraitUrl(file) : null;
};

/** Marker categories that are boss fights on the Nightreign map. */
export const NR_BOSS_CATEGORIES = new Set([
  "field-boss",
  "night-boss",
  "evergaol-boss",
  "arena-boss",
]);

/**
 * Nightreign boss portraits, keyed by the RAW marker name ("Ruins - Runebear").
 * NR marker names are stable English by design — the i18n overlay localizes
 * display strings only, never the marker data (nightreign-data.ts) — so the
 * name is as locale-proof a key as an id. Refresh/extend via
 * data/src/fetch-nr-boss-images.mjs.
 */
export const nrBossImageFor = (markerName: string): string | null => {
  const file = (nrBossImages as Record<string, string>)[markerName];
  return file ? nrBossPortraitUrl(file) : null;
};
