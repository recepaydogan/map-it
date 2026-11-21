import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import MapTileImage from "./map-tile-image";
import { screenPointStyle } from "./map-projection";
import { resolveMapTilePath, selectMapDetailLevel } from "./map-tile-utils";
import type { MapMetadata, MapTileSource, MapView } from "./types";

interface MapTileLayerProps {
  data: MapMetadata;
  view: MapView;
  width: number;
  height: number;
  overscan: number;
}

interface PositionedPyramid extends MapTileSource {
  id: string;
  tileSize: number;
  detailLevels: number[];
  tileCoverage?: Set<string>[];
  sourceBounds: MapMetadata["bounds"];
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
}

const visibleTiles = (
  layer: PositionedPyramid, view: MapView, width: number, height: number, level: number,
  cullInset = 0,
) => {
  const tileWorldSize = layer.tileSize * 2 ** level;
  const coverage = layer.tileCoverage?.[layer.detailLevels.indexOf(level)];
  const worldMinX = view.centerX - (width / 2 - cullInset) / view.zoom;
  const worldMaxX = view.centerX + (width / 2 - cullInset) / view.zoom;
  const worldMinY = view.centerY - (height / 2 - cullInset) / view.zoom;
  const worldMaxY = view.centerY + (height / 2 - cullInset) / view.zoom;
  const sourceMinX = (worldMinX - layer.originX) / layer.scaleX;
  const sourceMaxX = (worldMaxX - layer.originX) / layer.scaleX;
  const sourceMinY = (worldMinY - layer.originY) / layer.scaleY;
  const sourceMaxY = (worldMaxY - layer.originY) / layer.scaleY;
  const columns = Math.ceil((layer.sourceBounds.maxX - layer.sourceBounds.minX) / tileWorldSize);
  const rows = Math.ceil((layer.sourceBounds.maxY - layer.sourceBounds.minY) / tileWorldSize);
  const minColumn = Math.max(0, Math.floor((sourceMinX - layer.sourceBounds.minX) / tileWorldSize));
  const maxColumn = Math.min(columns - 1, Math.floor((sourceMaxX - layer.sourceBounds.minX) / tileWorldSize));
  const minRow = Math.max(0, Math.floor((sourceMinY - layer.sourceBounds.minY) / tileWorldSize));
  const maxRow = Math.min(rows - 1, Math.floor((sourceMaxY - layer.sourceBounds.minY) / tileWorldSize));
  const tiles = [];
  for (let column = minColumn; column <= maxColumn; column += 1) {
    for (let row = minRow; row <= maxRow; row += 1) {
      if (coverage && !coverage.has(`${column},${row}`)) continue;
      const tilePath = resolveMapTilePath(layer.tilePattern, level, column, row);
      const left = (layer.originX + (layer.sourceBounds.minX + column * tileWorldSize) * layer.scaleX
        - view.centerX) * view.zoom + width / 2;
      const top = (layer.originY + (layer.sourceBounds.minY + row * tileWorldSize) * layer.scaleY
        - view.centerY) * view.zoom + height / 2;
      tiles.push({
        key: `${layer.id}-${level}-${column}-${row}`,
        source: `${layer.basePath}/${tilePath}`,
        left,
        top,
        width: tileWorldSize * layer.scaleX * view.zoom + 0.5,
        height: tileWorldSize * layer.scaleY * view.zoom + 0.5,
      });
    }
  }
  // Image requests in Overwolf can complete one by one. Request tiles around
  // the visible centre first so a slow connection does not paint only an edge.
  return tiles.sort((a, b) => {
    const distance = (tile: typeof a) => {
      const x = tile.left + tile.width / 2 - width / 2;
      const y = tile.top + tile.height / 2 - height / 2;
      return x * x + y * y;
    };
    return distance(a) - distance(b);
  });
};

/** Draws each native map on one uninterrupted world surface. */
const MapTileLayer = ({ data, view, width, height, overscan }: MapTileLayerProps) => {
  const { t } = useTranslation();
  const tiles = useMemo(() => {
    if (width === 0 || height === 0) return [];
    const baseLayer: PositionedPyramid[] = data.hideBaseTiles ? [] : [{
      id: data.id,
      ...data.tileSource,
      tileSize: data.tileSize,
      detailLevels: data.detailLevels,
      tileCoverage: data.tileCoverage,
      sourceBounds: data.bounds,
      originX: 0,
      originY: 0,
      scaleX: 1,
      scaleY: 1,
    }];
    return [...baseLayer, ...(data.terrainLayers ?? [])].flatMap((layer) => {
      const level = selectMapDetailLevel(view.zoom * Math.min(layer.scaleX, layer.scaleY), layer.detailLevels);
      const levelIndex = layer.detailLevels.indexOf(level);
      const fallbackLevel = layer.detailLevels[Math.min(levelIndex + 2, layer.detailLevels.length - 1)];
      return [
        ...(fallbackLevel !== undefined && fallbackLevel !== level
          ? visibleTiles(layer, view, width, height, fallbackLevel) : []),
        // Keep the coarse guard band for camera motion. Detailed requests are
        // limited to the visible area plus half the guard band.
        ...visibleTiles(layer, view, width, height, level, overscan / 2),
      ];
    });
  }, [data, height, overscan, view, width]);

  return (
    <div className="map-tile-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {tiles.map((tile) => (
        <MapTileImage
          key={tile.key}
          source={tile.source}
          style={{ ...screenPointStyle(tile.left, tile.top, { centered: false }),
            width: tile.width, height: tile.height }}
        />
      ))}
      {data.terrainLayers?.filter((layer) => layer.labelKey).map((layer) => {
        const left = (layer.originX + (layer.sourceBounds.minX + layer.sourceBounds.maxX)
          * layer.scaleX / 2 - view.centerX) * view.zoom + width / 2;
        const top = (layer.originY + layer.sourceBounds.maxY * layer.scaleY
          - view.centerY) * view.zoom + height / 2 + 10;
        return <span key={`${layer.id}-label`}
          className="absolute whitespace-nowrap font-display text-[11px] font-semibold uppercase tracking-[0.12em] text-white/85 drop-shadow-[0_2px_3px_black]"
          style={screenPointStyle(left, top)}>{t(layer.labelKey!)}</span>;
      })}
    </div>
  );
};

export default memo(MapTileLayer);
