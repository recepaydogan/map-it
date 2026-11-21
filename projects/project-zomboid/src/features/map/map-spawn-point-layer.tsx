import { memo, useEffect, useRef } from "react";
import { drawCanvasIcon, useCanvasIcon } from "./map-canvas-icon";
import {
  getVisibleWorldBounds,
  getWorldUnitsPerPixel,
  type MapProjectionMode,
  worldToScreen,
} from "./map-projection";
import { drawSpawnDot, getSpawnDotRadius } from "./map-spawn-dot";
import { SPAWN_POINT_ICON } from "./map-spawn-point-config";
import { getVisibleSpawnPoints } from "./map-spawn-point-utils";
import type { MapSpawnData, MapSpawnPoint, MapView } from "./types";

interface MapSpawnPointLayerProps {
  data: MapSpawnData;
  professionId: string | null;
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
  /** Point under the cursor: drawn last, and brighter, so hover is unmistakable. */
  highlightId: string | null;
}

/**
 * The whole county holds under a hundred spawn points, so this layer never has
 * to shrink to stay legible the way the vehicle zones do. The floor keeps the
 * disc wide enough for its glyph at every zoom.
 */
const MIN_RADIUS = 7;
const HALO = "rgba(8, 7, 5, 0.72)";
const HIGHLIGHT_STROKE = "rgba(255, 252, 240, 0.96)";

const MapSpawnPointLayer = ({
  data,
  professionId,
  view,
  width,
  height,
  projection,
  highlightId,
}: MapSpawnPointLayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const icon = useCanvasIcon(SPAWN_POINT_ICON);

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
    const radius = getSpawnDotRadius(view.zoom, projection, MIN_RADIUS);
    // The bounds hold point centres, so they are widened by the disc: a pin
    // hanging over the edge of the viewport still draws the half of it that is
    // on screen instead of blinking out while it is still visible.
    const margin = radius * 1.5 * getWorldUnitsPerPixel(view.zoom, projection);
    const visible = getVisibleWorldBounds(view, width, height, projection);
    const fill = professionId ? "rgba(233, 205, 133, 0.96)" : "rgba(179, 206, 195, 0.96)";
    let highlighted: MapSpawnPoint | null = null;
    let renderedPoints = 0;

    const drawPoint = (point: MapSpawnPoint, active: boolean) => {
      const screen = worldToScreen(point, view, width, height, projection);
      const dotRadius = active ? radius * 1.18 : radius;
      drawSpawnDot(context, screen.left, screen.top, dotRadius, fill, active ? HIGHLIGHT_STROKE : HALO);
      // 1.5x the radius puts an 18px glyph in a 32px disc, matching `.map-marker`
      // — the icon art already carries 25% padding of its own. The glyph also
      // keeps overlapping points readable as separate pins.
      if (icon) drawCanvasIcon(context, icon, screen.left, screen.top, dotRadius * 1.5);
    };

    for (const point of getVisibleSpawnPoints(data, professionId)) {
      if (
        point.x < visible.minX - margin || point.x > visible.maxX + margin ||
        point.y < visible.minY - margin || point.y > visible.maxY + margin
      ) continue;
      renderedPoints += 1;
      if (point.id === highlightId) {
        highlighted = point;
        continue;
      }
      drawPoint(point, false);
    }
    if (highlighted) drawPoint(highlighted, true);
    canvas.dataset.renderedPoints = String(renderedPoints);
  }, [data, height, highlightId, icon, professionId, projection, view, width]);

  return <canvas ref={canvasRef} className="map-world-canvas-layer" aria-hidden="true" />;
};

export default memo(MapSpawnPointLayer);
