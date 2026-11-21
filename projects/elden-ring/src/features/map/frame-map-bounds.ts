import * as L from "leaflet";
import { MOBILE_QUERY } from "../../utils/platform";

/** Breathing room around a contained map, in CSS pixels. */
const CONTAIN_PADDING: [number, number] = [40, 40];

const isPhoneViewport = (): boolean =>
  typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;

/**
 * The zoom at which `bounds` COVERS the viewport, or `null` off phone widths.
 *
 * Use it as a FLOOR on a restored camera. The live map reopens at the zoom and
 * centre the player left, which is right — except that the stored zoom was very
 * likely sampled on another map (the ER↔NR switch remounts the live map and
 * restores whatever the last map wrote) or on a desktop window. Applied there it
 * can leave a phone staring at a map island in a field of void. Clamping UP to
 * the cover zoom keeps the player's position while guaranteeing the map still
 * fills the screen; it can only ever zoom in, never out.
 */
export const phoneCoverZoom = (map: L.Map, bounds: L.LatLngBoundsExpression): number | null => {
  if (!isPhoneViewport()) return null;
  return map.getBoundsZoom(L.latLngBounds(bounds as L.LatLngBoundsLiteral), true);
};

/**
 * Put a map's whole world in view. ONE definition of "framed", shared by every
 * caller that resets the camera — the view switcher, the recenter control and the
 * blind-mount repair — so the three can never disagree about what a reset looks
 * like.
 *
 * Two behaviours, split at phone width:
 *
 *  • Desktop / Overwolf — CONTAIN. The map tiles are square and desktop viewports
 *    are wide, so the whole world fits with room to spare.
 *  • Phone — COVER (`getBoundsZoom(bounds, true)` is Leaflet's "fit the view
 *    INSIDE these bounds"). Containing a square map in a 390×790 portrait fills
 *    barely 40% of the screen and surrounds it with void, which reads as a broken
 *    map rather than a framed one. Covering opens on a full-bleed, legible map
 *    centred on the world; pinching out to see all of it is one gesture.
 *
 * Always re-measures first: these maps never remount, so a container that resized
 * since the last camera update leaves Leaflet holding a stale size, and the fit
 * would target the wrong rectangle.
 */
export const frameMapBounds = (
  map: L.Map,
  bounds: L.LatLngBoundsExpression,
  { animate = false }: { animate?: boolean } = {},
): void => {
  map.invalidateSize({ animate: false });

  if (!isPhoneViewport()) {
    map.fitBounds(bounds, { padding: CONTAIN_PADDING, animate });
    return;
  }

  const latLngBounds = L.latLngBounds(bounds as L.LatLngBoundsLiteral);
  map.setView(latLngBounds.getCenter(), map.getBoundsZoom(latLngBounds, true), { animate });
};
