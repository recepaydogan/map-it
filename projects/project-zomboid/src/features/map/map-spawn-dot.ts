import { getNormalizedMarkerZoom, MARKER_DETAIL_ZOOM } from "./map-marker-zoom";
import type { MapProjectionMode } from "./map-projection";

/**
 * Overlay dots (spawn points, vehicle zones too small to draw as a rectangle)
 * grow up to the size of a `.map-marker` pin disc — 32px across — so they read
 * at the same distance as the pins they share the map with.
 */
export const SPAWN_DOT_MAX_RADIUS = 16;
export const SPAWN_DOT_MIN_RADIUS = 5;

/**
 * `minimumRadius` lets a dense overlay keep shrinking past the usual floor.
 * A layer with thousands of points would otherwise merge into one solid mass
 * once the whole county is on screen, which is the reason those layers used to
 * switch themselves off at low zoom instead.
 *
 * The zoom is normalised first: isometric and top-down zoom are different
 * scales, so measuring each projection separately made an isometric dot several
 * times smaller than the top-down one framing the very same streets. Full
 * marker size is reached at the zoom where the marker layer switches to its
 * detail tier, so a dot and a pin match once buildings are individually placed.
 */
export const getSpawnDotRadius = (
  zoom: number,
  projection: MapProjectionMode,
  minimumRadius = SPAWN_DOT_MIN_RADIUS,
) =>
  Math.max(
    minimumRadius,
    Math.min(
      SPAWN_DOT_MAX_RADIUS,
      SPAWN_DOT_MAX_RADIUS * getNormalizedMarkerZoom(zoom, projection) / MARKER_DETAIL_ZOOM,
    ),
  );

/**
 * Disc, dark ring and soft drop — the canvas counterpart of the pin styling in
 * `.map-marker`, so an overlay dot never disappears into the tiles beneath it.
 * The ring is proportional: a fixed weight would eat a zoomed-out dot until only
 * the dark outline was left, which reads as the layer having vanished.
 */
export const drawSpawnDot = (
  context: CanvasRenderingContext2D,
  left: number,
  top: number,
  radius: number,
  fill: string,
  ring: string,
) => {
  context.beginPath();
  context.arc(left, top + radius * 0.12, radius + Math.min(1.8, radius * 0.36), 0, Math.PI * 2);
  context.fillStyle = "rgba(6, 5, 3, 0.5)";
  context.fill();
  context.beginPath();
  context.arc(left, top, radius, 0, Math.PI * 2);
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = Math.min(1.6, Math.max(0.6, radius * 0.2));
  context.strokeStyle = ring;
  context.stroke();
};
