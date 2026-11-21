import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as L from "leaflet";
import { iconFor } from "../../data/icon-map";

/**
 * Builds a Leaflet divIcon for a marker. Leaflet needs raw HTML, so the Lucide
 * glyph is rendered to a static SVG string and dropped into a tinted pin.
 *
 * The inline `--pin` custom property is the AGENTS.md-sanctioned escape hatch:
 * the category color is a runtime data value that cannot be a static Tailwind
 * class, so it is passed as a CSS variable that the .er-pin rules consume.
 */
interface MarkerIconOptions {
  color: string;
  iconKey: string;
  selected: boolean;
  dashed: boolean;
  /** Real extracted PNG. When set, shown instead of the glyph. */
  iconUrl?: string;
  /** Local fallback PNG shown under iconUrl while it loads (CDN item icons) / if it fails. */
  fallbackUrl?: string;
  /** Completion: the player has marked this one found/cleared — render it dimmed
   * with a check badge. */
  found?: boolean;
  /** Favorited/bookmarked — render with a star badge. */
  bookmarked?: boolean;
  /** A foot of an open colocated fan (er-map-marker-fan.ts) — render with the web's
   * gold halo so the fanned pins read as the live ones while the rest of the map dims. */
  fanned?: boolean;
}

/**
 * Lucide → SVG markup is the same string for every marker of a category, but
 * `renderToStaticMarkup` is expensive (a full React render). With 600 visible
 * pins re-rendering that 600× per filter/selection change is what froze the map,
 * so the glyph string is cached by icon key (~40 entries, one render each).
 */
const glyphCache = new Map<string, string>();

const innerFor = (
  iconUrl: string | undefined,
  iconKey: string,
  fallbackUrl?: string,
): string => {
  if (!iconUrl) return glyphFor(iconKey);
  // With a fallback (CDN item icons): paint it as the img's background so it shows
  // while the real icon streams in, and swap the src to it if the load fails — so a
  // pin is never blank or broken, online or off.
  if (fallbackUrl) {
    return (
      `<img src="${iconUrl}" alt="" draggable="false"` +
      ` onerror="this.onerror=null;this.src='${fallbackUrl}'"` +
      ` style="background-image:url('${fallbackUrl}');background-size:contain;background-repeat:no-repeat;background-position:center" />`
    );
  }
  return `<img src="${iconUrl}" alt="" draggable="false" />`;
};

const glyphFor = (iconKey: string): string => {
  let svg = glyphCache.get(iconKey);
  if (svg === undefined) {
    svg = renderToStaticMarkup(
      createElement(iconFor(iconKey), {
        size: 18,
        color: "#0b0b0e",
        strokeWidth: 2.5,
      }),
    );
    glyphCache.set(iconKey, svg);
  }
  return svg;
};

/**
 * A pin's appearance is fully determined by these inputs, and most markers share
 * a signature (same category → same icon + colour). Caching the DivIcon by
 * signature means identical pins reuse one instance, so a pan/zoom that re-runs
 * the render never makes react-leaflet rebuild an unchanged pin's DOM.
 */
const iconCache = new Map<string, L.DivIcon>();

export const buildMarkerIcon = (opts: MarkerIconOptions): L.DivIcon => {
  const {
    color,
    iconKey,
    selected,
    dashed,
    iconUrl,
    fallbackUrl,
    found,
    bookmarked,
    fanned,
  } = opts;
  const cacheKey = `${iconKey}|${color}|${selected}|${dashed}|${iconUrl ?? ""}|${fallbackUrl ?? ""}|${found ? "f" : ""}|${bookmarked ? "b" : ""}|${fanned ? "w" : ""}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const inner = innerFor(iconUrl, iconKey, fallbackUrl);
  const classes = [
    "er-pin",
    iconUrl && "er-pin--img",
    iconKey === "grace" && "er-pin--grace",
    selected && "er-pin--sel",
    dashed && "er-pin--dashed",
  ]
    .filter(Boolean)
    .join(" ");

  // Found/favorite live on the WRAP, not the disc: their badges (check / star) must
  // sit outside the disc's `overflow:hidden` clip and stay full-opacity while the
  // found state dims the disc — so they're drawn off the un-clipped, un-dimmed wrap.
  const wrapClasses = [
    "er-pin-wrap",
    found && "er-pin-wrap--found",
    bookmarked && "er-pin-wrap--fav",
    fanned && "er-pin-wrap--fan",
  ]
    .filter(Boolean)
    .join(" ");

  // Graces are rendered a touch larger (.er-pin--grace) so the divIcon box must
  // match, otherwise Leaflet anchors them off-centre from their map point.
  const size = iconKey === "grace" ? 36 : 32;
  const half = size / 2;
  const icon = L.divIcon({
    className: wrapClasses,
    html: `<div class="${classes}" style="--pin:${color}">${inner}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
    tooltipAnchor: [0, -(half + 2)],
  });
  iconCache.set(cacheKey, icon);
  return icon;
};

/**
 * Cluster bubble icon: the category's own pin look (same disc, glyph/art, colour),
 * just a touch larger. No count — a collapsed group simply shows that type's icon
 * (per-category cluster groups guarantee every child is the same type). Reuses the
 * glyph cache via the pin markup.
 */
export const buildClusterIcon = (opts: {
  color: string;
  iconKey: string;
  iconUrl?: string;
  fallbackUrl?: string;
}): L.DivIcon => {
  const { color, iconKey, iconUrl, fallbackUrl } = opts;
  const inner = innerFor(iconUrl, iconKey, fallbackUrl);
  const classes = [
    "er-pin",
    "er-cluster-pin",
    iconUrl && "er-pin--img",
  ]
    .filter(Boolean)
    .join(" ");
  const size = 38;
  const half = size / 2;
  return L.divIcon({
    className: "er-cluster-wrap",
    html: `<div class="${classes}" style="--pin:${color}">${inner}</div>`,
    iconSize: [size, size],
    iconAnchor: [half, half],
  });
};
