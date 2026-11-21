import { memo, useEffect, useRef } from "react";
import { drawCanvasIcon, useCanvasIcon } from "./map-canvas-icon";
import { getNormalizedMarkerZoom } from "./map-marker-zoom";
import { VEHICLE_SPAWN_APPEARANCE, VEHICLE_SPAWN_ICON } from "./map-vehicle-spawn-config";
import {
  containsScreenPoint,
  getRectangleScreenPoints,
  getVisibleWorldBounds,
  traceScreenPolygon,
  type MapProjectionMode,
} from "./map-projection";
import { drawSpawnDot, getSpawnDotRadius, SPAWN_DOT_MIN_RADIUS } from "./map-spawn-dot";
import type { MapVehicleSpawnData, MapVehicleSpawnZone, MapView } from "./types";

interface MapVehicleSpawnLayerProps {
  data: MapVehicleSpawnData;
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  /** Zone under the cursor: drawn last, and brighter, so hover is unmistakable. */
  highlightZone: MapVehicleSpawnZone | null;
}

/**
 * A zone narrower than this on screen is drawn as a marker-sized dot instead of
 * a rectangle. A parking stall is only a few tiles across, so tracing it below
 * that size produces a translucent sliver that vanishes into the map art.
 */
const ZONE_DOT_THRESHOLD = 10;
const HALO = "rgba(8, 7, 5, 0.6)";
const HIGHLIGHT_STROKE = "rgba(255, 252, 240, 0.96)";
/** Below this the disc is smaller than the glyph's own line weight. */
const ICON_MIN_RADIUS = 7;
/**
 * A traced zone only earns a centre pin once it is comfortably larger than one,
 * otherwise the pin covers the very rectangle it is labelling.
 */
const PIN_CLEARANCE = 2.5;

/**
 * Outline weight in screen pixels. Zones are sparse and small, so a fixed 1px
 * hairline disappears against the detailed isometric tiles once zoomed in — the
 * outline has to grow with the zoom to stay readable.
 */
const getStrokeWidth = (zoom: number, projection: MapProjectionMode) =>
  Math.min(2.6, Math.max(1, zoom * (projection === "isometric" ? 0.07 : 1.6)));

/**
 * The layer has no zoom cut-off: it stays on all the way out, and the pins get
 * smaller instead. Two thousand zones at full marker size would fuse into one
 * mass with the whole county on screen, so the usual dot floor is relaxed until
 * the view is close enough for a marker-sized pin to mean something.
 */
const getDotFloor = (zoom: number, projection: MapProjectionMode) =>
  Math.min(SPAWN_DOT_MIN_RADIUS, Math.max(1.6, getNormalizedMarkerZoom(zoom, projection) * 30));

const MapVehicleSpawnLayer = ({
  data,
  view,
  width,
  height,
  projection,
  highlightZone,
}: MapVehicleSpawnLayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const icon = useCanvasIcon(VEHICLE_SPAWN_ICON);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const visible = getVisibleWorldBounds(view, width, height, projection);
    const dotRadius = getSpawnDotRadius(view.zoom, projection, getDotFloor(view.zoom, projection));
    const strokeWidth = getStrokeWidth(view.zoom, projection);

    const drawPin = (left: number, top: number, fill: string, highlighted: boolean) => {
      const radius = highlighted ? dotRadius * 1.18 : dotRadius;
      drawSpawnDot(context, left, top, radius, fill, highlighted ? HIGHLIGHT_STROKE : HALO);
      // 1.5x the radius puts an 18px glyph in a 32px disc, matching `.map-marker`
      // — the icon art already carries 25% padding of its own.
      if (icon && radius >= ICON_MIN_RADIUS) drawCanvasIcon(context, icon, left, top, radius * 1.5);
    };

    const drawZone = (zone: MapVehicleSpawnZone, highlighted: boolean) => {
      const [definitionIndex, x, y, zoneWidth, zoneHeight] = zone;
      const definition = data.definitions[definitionIndex];
      if (!definition) return;
      const appearance = VEHICLE_SPAWN_APPEARANCE[definition.category];
      const points = getRectangleScreenPoints(x, y, zoneWidth, zoneHeight, view, width, height, projection);
      const center = points.reduce((sum, point) => ({ left: sum.left + point.left / 4, top: sum.top + point.top / 4 }), { left: 0, top: 0 });
      const renderedWidth = Math.hypot(points[1]!.left - points[0]!.left, points[1]!.top - points[0]!.top);
      const renderedHeight = Math.hypot(points[3]!.left - points[0]!.left, points[3]!.top - points[0]!.top);

      // Zones too small to trace become a pin rather than a speck.
      if (renderedWidth < ZONE_DOT_THRESHOLD || renderedHeight < ZONE_DOT_THRESHOLD) {
        drawPin(center.left, center.top, appearance.dot, highlighted);
        return;
      }

      if (!traceScreenPolygon(context, points)) return;
      // Dark rim under the tint: the zone keeps an edge over bright map art.
      context.lineWidth = strokeWidth + 2;
      context.strokeStyle = HALO;
      context.stroke();
      context.fillStyle = appearance.fill;
      context.fill();
      // Hovering doubles the tint instead of needing a second palette entry.
      if (highlighted) context.fill();
      context.lineWidth = highlighted ? strokeWidth + 1 : strokeWidth;
      context.strokeStyle = highlighted ? HIGHLIGHT_STROKE : appearance.stroke;
      context.stroke();
      // Once the rectangle has room for it, the same pin sits at its centre, so
      // a zoomed-in zone is still labelled rather than being an anonymous tint.
      if (Math.min(renderedWidth, renderedHeight) < dotRadius * PIN_CLEARANCE) return;
      // A lot larger than the viewport has its centre off-screen; pull the pin
      // back into view so standing inside one still tells you what it is.
      const margin = dotRadius + 6;
      const anchor = {
        left: Math.min(Math.max(center.left, margin), width - margin),
        top: Math.min(Math.max(center.top, margin), height - margin),
      };
      const inside = containsScreenPoint(points, anchor.left, anchor.top) ? anchor : center;
      drawPin(inside.left, inside.top, appearance.dot, highlighted);
    };

    for (const zone of data.zones) {
      const [, x, y, zoneWidth, zoneHeight] = zone;
      if (x + zoneWidth < visible.minX || x > visible.maxX || y + zoneHeight < visible.minY || y > visible.maxY) continue;
      if (zone === highlightZone) continue;
      drawZone(zone, false);
    }
    // Last, so a hovered stall is never painted over by the lot around it.
    if (highlightZone) drawZone(highlightZone, true);
  }, [data, height, highlightZone, icon, projection, view, width]);

  return <canvas ref={canvasRef} className="map-world-canvas-layer" aria-hidden="true" />;
};

export default memo(MapVehicleSpawnLayer);
