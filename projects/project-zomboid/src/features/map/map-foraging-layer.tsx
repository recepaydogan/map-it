import { memo, useEffect, useRef } from "react";
import { FORAGING_ZONE_APPEARANCE, FORAGING_ZONE_DRAW_ORDER } from "./map-foraging-config";
import {
  drawScreenPolygon,
  getRectangleScreenPoints,
  getVisibleWorldBounds,
  type MapProjectionMode,
} from "./map-projection";
import type { MapForagingData, MapView } from "./types";

interface MapForagingLayerProps {
  data: MapForagingData;
  view: MapView;
  width: number;
  height: number;
  projection: MapProjectionMode;
}

/** Draws every visible game-defined foraging zone on one canvas. */
const MapForagingLayer = ({ data, view, width, height, projection }: MapForagingLayerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    context.lineWidth = 1;
    const visible = getVisibleWorldBounds(view, width, height, projection);

    for (const kind of FORAGING_ZONE_DRAW_ORDER) {
      const appearance = FORAGING_ZONE_APPEARANCE[kind];
      context.fillStyle = appearance.fill;
      context.strokeStyle = appearance.stroke;

      for (const [x, y, zoneWidth, zoneHeight] of data.zones[kind]) {
        if (
          x + zoneWidth < visible.minX
          || x > visible.maxX
          || y + zoneHeight < visible.minY
          || y > visible.maxY
        ) continue;

        drawScreenPolygon(
          context,
          getRectangleScreenPoints(x, y, zoneWidth, zoneHeight, view, width, height, projection),
        );
      }
    }
  }, [data, height, projection, view, width]);

  return <canvas ref={canvasRef} className="map-world-canvas-layer" aria-hidden="true" />;
};

export default memo(MapForagingLayer);
