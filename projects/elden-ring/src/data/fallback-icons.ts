/**
 * Local, OPK-bundled fallback icons — one representative real game icon per item
 * category, shown while the CDN item icon streams in and kept if it never arrives
 * (offline). Files live at public/icons/_fallback/<category>.png; the copy that
 * produced them is scripts/build-fallback-icons.mjs (run again if a pick changes).
 *
 * Keyed by the category field markers AND codex items carry, so both the map pins
 * (marker.category, e.g. "golden-seed") and the archive lists (ErItem.category,
 * the coarser "consumable"/"material"/"key" buckets) resolve here. Categories that
 * draw from the small local sets (Landmarks/Dungeons world-map symbols, Nightreign)
 * are intentionally absent — they're always present, so they need no fallback.
 */
export const FALLBACK_CATEGORIES = new Set<string>([
  // Equipment
  "weapon", "shield", "armor", "talisman", "ash-of-war", "spirit-ash", "sorcery", "incantation",
  // Upgrades & collectibles (each map sub-category has its own representative)
  "smithing-stone", "golden-seed", "sacred-tear", "glovewort", "larval-tear", "map-fragment",
  "bell-bearing", "cookbook", "key", "whetblade",
  // NPC group, but drawn with an item icon
  "teardrop-scarab",
  // Codex-only goods buckets (markers split these into the finer categories above)
  "consumable", "material",
]);

/** Local fallback URL for a category, or undefined when the category ships no fallback. */
export const fallbackIconUrl = (category: string): string | undefined =>
  FALLBACK_CATEGORIES.has(category) ? `/icons/_fallback/${category}.png` : undefined;
