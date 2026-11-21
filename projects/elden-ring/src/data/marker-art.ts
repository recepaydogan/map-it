import type { Marker } from "./types";
import { itemIconUrl } from "../utils/assets";
import { fallbackIconUrl } from "./fallback-icons";

// Dungeon categories where every entrance shares ONE in-game map symbol (mirrors
// DUN_MAP_ICON in build-er-markers.mjs). Used as a fallback for the few markers that
// were built without their own `mapIcon` — e.g. the Siofra/Ainsel "River Well" entrances
// are category "tunnel" but come from a path that never assigned the tunnel symbol, so
// they'd otherwise drop to the generic glyph while every other tunnel shows "14".
const CATEGORY_MAP_ICON: Record<string, string> = {
  cave: "13",
  tunnel: "14",
  catacomb: "16",
  "divine-tower": "23",
  // Legacy dungeons each carry their OWN map icon (Volcano Manor 58, Castle Morne 25…); the
  // few without one (mostly mislabeled minor/DLC spots) fall back to a generic grand-castle
  // symbol (29) so they read as a real in-game icon instead of a bare glyph.
  "legacy-dungeon": "29",
};

/**
 * The real extracted-art URL a marker shows on the map, or undefined when the
 * marker falls back to its category's Lucide glyph. Single source of truth so
 * the map pins (marker-layer) and the filter chips render a category's symbol
 * identically — item markers carry their own icon, world-map POIs their
 * authentic in-game symbol, Nightreign its own extracted set. Dungeon markers
 * with no own symbol fall back to their category's shared one (CATEGORY_MAP_ICON).
 */
export const markerArtUrl = (m: Marker): string | undefined =>
  m.customIcon != null
    ? m.customIcon
    : m.iconId != null
      ? itemIconUrl(m.iconId)
      : m.mapIcon
        ? `/icons/elden-ring/map/${m.mapIcon.includes(".") ? m.mapIcon : `${m.mapIcon}.png`}`
        : m.icon
          ? `/poi-icons/nightreign/${m.icon}`
          : CATEGORY_MAP_ICON[m.category]
            ? `/icons/elden-ring/map/${CATEGORY_MAP_ICON[m.category]}.png`
            : undefined;

/**
 * The local fallback shown beneath a marker's art while its CDN item icon loads
 * (and kept if it fails). Only item markers (`iconId`) stream from the CDN; world-
 * map symbols and Nightreign POIs ship locally, so they never need a fallback.
 */
export const markerFallbackUrl = (m: Marker): string | undefined =>
  m.iconId != null ? fallbackIconUrl(m.category) : undefined;

/**
 * The single symbol that represents a whole category in the filter. A category
 * earns a real icon only when its markers consistently share one (world-map
 * POIs: every Site of Grace is a bonfire); item categories whose markers each
 * carry their own icon stay on the category glyph, since no one item speaks for
 * the group. Returns category key → art URL for those that qualify.
 */
const SHARE_THRESHOLD = 0.6;

export const categoryArtUrls = (markers: Marker[]): Map<string, string> => {
  const tally = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const m of markers) {
    totals.set(m.category, (totals.get(m.category) ?? 0) + 1);
    const url = markerArtUrl(m);
    if (!url) continue;
    let counts = tally.get(m.category);
    if (!counts) tally.set(m.category, (counts = new Map()));
    counts.set(url, (counts.get(url) ?? 0) + 1);
  }

  const art = new Map<string, string>();
  for (const [cat, counts] of tally) {
    let best = "";
    let bestN = 0;
    for (const [url, n] of counts) {
      if (n > bestN) {
        bestN = n;
        best = url;
      }
    }
    if (bestN / (totals.get(cat) ?? 1) >= SHARE_THRESHOLD) art.set(cat, best);
  }
  return art;
};
