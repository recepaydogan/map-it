import { useMemo } from "react";
import MapTileImage from "./map-tile-image";
import { getVisibleWorldBounds } from "./map-projection";
import { getMapTileSource, resolveMapTilePath, selectMapDetailLevel } from "./map-tile-utils";
import type { MapMetadata, MapView } from "./types";

interface MapIsometricOverviewLayerProps {
  data: MapMetadata;
  view: MapView;
  width: number;
  height: number;
  floor: number;
}

const SOURCE_TILE_SIZE = 256;

const MapIsometricOverviewLayer = ({ data, view, width, height, floor }: MapIsometricOverviewLayerProps) => {
  const tileSource = getMapTileSource(data);
  const tiles = useMemo(() => {
    if (width <= 0 || height <= 0) return [];
    const level = selectMapDetailLevel(view.zoom, data.detailLevels, 1.4);
    const worldUnitsPerPixel = 2 ** level;
    const tileWorldSize = data.tileSize * worldUnitsPerPixel;
    const visibleBounds = getVisibleWorldBounds(view, width, height, "isometric");
    const mapWidth = data.bounds.maxX - data.bounds.minX;
    const mapHeight = data.bounds.maxY - data.bounds.minY;
    const minimumColumn = Math.max(0, Math.floor((visibleBounds.minX - data.bounds.minX) / tileWorldSize));
    const maximumColumn = Math.min(
      Math.ceil(mapWidth / tileWorldSize) - 1,
      Math.floor((visibleBounds.maxX - data.bounds.minX) / tileWorldSize),
    );
    const minimumRow = Math.max(0, Math.floor((visibleBounds.minY - data.bounds.minY) / tileWorldSize));
    const maximumRow = Math.min(
      Math.ceil(mapHeight / tileWorldSize) - 1,
      Math.floor((visibleBounds.maxY - data.bounds.minY) / tileWorldSize),
    );
    const visibleTiles = [];

    for (let column = minimumColumn; column <= maximumColumn; column += 1) {
      for (let row = minimumRow; row <= maximumRow; row += 1) {
        const worldX = data.bounds.minX + column * tileWorldSize;
        const worldY = data.bounds.minY + row * tileWorldSize;
        const horizontalScale = worldUnitsPerPixel * view.zoom / 2;
        const verticalScale = worldUnitsPerPixel * view.zoom / 4;
        const translateX = ((worldX - worldY - view.centerX + view.centerY) / 2) * view.zoom + width / 2;
        const translateY = ((worldX + worldY - view.centerX - view.centerY) / 4) * view.zoom + height / 2;
        visibleTiles.push({
          column,
          row,
          level,
          transform: `matrix(${horizontalScale}, ${verticalScale}, ${-horizontalScale}, ${verticalScale}, ${translateX}, ${translateY})`,
        });
      }
    }
    return visibleTiles;
  }, [data, height, view, width]);

  return (
    <div
      className="map-tile-layer pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: floor === 0 ? 0.92 : 0.38 }}
      aria-hidden="true"
    >
      {tiles.map(({ column, row, level, transform }) => (
        <MapTileImage
          key={`${level}-${column}-${row}`}
          tileSource={tileSource}
          path={resolveMapTilePath(tileSource.tilePattern, level, column, row)}
          style={{
            left: 0,
            top: 0,
            width: SOURCE_TILE_SIZE,
            height: SOURCE_TILE_SIZE,
            transform,
            transformOrigin: "0 0",
          }}
        />
      ))}
    </div>
  );
};

export default MapIsometricOverviewLayer;
