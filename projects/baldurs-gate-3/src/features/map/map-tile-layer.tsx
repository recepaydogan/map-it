import { memo, useMemo } from "react";
import MapTileImage from "./map-tile-image";
import { getMapImageUrl } from "./map-image-url";
import { screenPointStyle } from "./map-projection";
import { getVisibleMapTiles, resolveMapTilePath } from "./map-tile-utils";
import type { MapMetadata, MapView } from "./types";

interface MapTileLayerProps {
  data: MapMetadata;
  view: MapView;
  width: number;
  height: number;
}

/** The base imagery: only the tiles of one pyramid level that intersect the viewport. */
const MapTileLayer = ({ data, view, width, height }: MapTileLayerProps) => {
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const left = (data.bounds.minX - view.centerX) * view.zoom + width / 2;
  const top = (data.bounds.minY - view.centerY) * view.zoom + height / 2;
  const tiles = useMemo(() => {
    return getVisibleMapTiles(data, {
      left, top,
      width: (data.bounds.maxX - data.bounds.minX) * view.zoom,
      height: (data.bounds.maxY - data.bounds.minY) * view.zoom,
    }, { width, height }, pixelRatio);
  }, [data, height, left, pixelRatio, top, view.zoom, width]);

  return (
    <div className="map-tile-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {tiles.map((tile) => {
        const { column, row, level } = tile;
        const path = resolveMapTilePath(data.tileSource.tilePattern, level, column, row);
        return (
          <MapTileImage
            key={`${level}-${column}-${row}`}
            source={getMapImageUrl(data.tileSource.basePath, path)}
            style={{ ...screenPointStyle(left + tile.left, top + tile.top, { centered: false }), width: tile.width + 0.5, height: tile.height + 0.5 }}
          />
        );
      })}
    </div>
  );
};

export default memo(MapTileLayer);
