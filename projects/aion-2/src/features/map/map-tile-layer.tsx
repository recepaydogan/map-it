import { memo, useMemo } from "react";
import MapTileImage from "./map-tile-image";
import { screenPointStyle } from "./map-projection";
import { resolveMapTilePath, selectMapDetailLevel } from "./map-tile-utils";
import type { MapMetadata, MapView } from "./types";

interface MapTileLayerProps {
  data: MapMetadata;
  view: MapView;
  width: number;
  height: number;
}

/** The base imagery: only the tiles of one pyramid level that intersect the viewport. */
const MapTileLayer = ({ data, view, width, height }: MapTileLayerProps) => {
  const tiles = useMemo(() => {
    if (width === 0 || height === 0 || data.hideBaseTiles) return [];
    const level = selectMapDetailLevel(view.zoom, data.detailLevels);
    const tileWorldSize = data.tileSize * 2 ** level;
    const minWorldX = view.centerX - width / 2 / view.zoom;
    const maxWorldX = view.centerX + width / 2 / view.zoom;
    const minWorldY = view.centerY - height / 2 / view.zoom;
    const maxWorldY = view.centerY + height / 2 / view.zoom;
    const mapWidth = data.bounds.maxX - data.bounds.minX;
    const mapHeight = data.bounds.maxY - data.bounds.minY;
    const minColumn = Math.max(0, Math.floor((minWorldX - data.bounds.minX) / tileWorldSize));
    const maxColumn = Math.min(
      Math.ceil(mapWidth / tileWorldSize) - 1,
      Math.floor((maxWorldX - data.bounds.minX) / tileWorldSize),
    );
    const minRow = Math.max(0, Math.floor((minWorldY - data.bounds.minY) / tileWorldSize));
    const maxRow = Math.min(
      Math.ceil(mapHeight / tileWorldSize) - 1,
      Math.floor((maxWorldY - data.bounds.minY) / tileWorldSize),
    );

    const visible = [];
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        visible.push({ column, row, level, tileWorldSize });
      }
    }
    return visible;
  }, [data, height, view, width]);

  return (
    <div className="map-tile-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {tiles.map(({ column, row, level, tileWorldSize }) => {
        const size = tileWorldSize * view.zoom + 1;
        const left = (data.bounds.minX + column * tileWorldSize - view.centerX) * view.zoom + width / 2;
        const top = (data.bounds.minY + row * tileWorldSize - view.centerY) * view.zoom + height / 2;
        const path = resolveMapTilePath(data.tileSource.tilePattern, level, column, row);
        return (
          <MapTileImage
            key={`${level}-${column}-${row}`}
            source={`${data.tileSource.basePath}/${path}`}
            style={{ ...screenPointStyle(left, top, { centered: false }), width: size, height: size }}
          />
        );
      })}
    </div>
  );
};

export default memo(MapTileLayer);
