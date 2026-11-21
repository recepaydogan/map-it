import { memo, useEffect, useMemo, useRef, useState } from "react";
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

const TILE_BUFFER = 1;
const RETIRED_LAYER_LIFETIME_MS = 520;

interface MapTilePlaneProps extends MapTileLayerProps {
  level: number;
  retiring?: boolean;
}

/** One pyramid level. A one-tile guard band keeps a quick pan from exposing an unmounted edge. */
const MapTilePlane = ({ data, view, width, height, level, retiring = false }: MapTilePlaneProps) => {
  const tiles = useMemo(() => {
    if (width === 0 || height === 0) return [];
    const tileWorldSize = data.tileSize * 2 ** level;
    const minWorldX = view.centerX - width / 2 / view.zoom;
    const maxWorldX = view.centerX + width / 2 / view.zoom;
    const minWorldY = view.centerY - height / 2 / view.zoom;
    const maxWorldY = view.centerY + height / 2 / view.zoom;
    const mapWidth = data.bounds.maxX - data.bounds.minX;
    const mapHeight = data.bounds.maxY - data.bounds.minY;
    const minColumn = Math.max(0, Math.floor((minWorldX - data.bounds.minX) / tileWorldSize) - TILE_BUFFER);
    const maxColumn = Math.min(
      Math.ceil(mapWidth / tileWorldSize) - 1,
      Math.floor((maxWorldX - data.bounds.minX) / tileWorldSize) + TILE_BUFFER,
    );
    const minRow = Math.max(0, Math.floor((minWorldY - data.bounds.minY) / tileWorldSize) - TILE_BUFFER);
    const maxRow = Math.min(
      Math.ceil(mapHeight / tileWorldSize) - 1,
      Math.floor((maxWorldY - data.bounds.minY) / tileWorldSize) + TILE_BUFFER,
    );

    const visible = [];
    for (let column = minColumn; column <= maxColumn; column += 1) {
      for (let row = minRow; row <= maxRow; row += 1) {
        visible.push({ column, row, level, tileWorldSize });
      }
    }
    return visible;
  }, [data, height, level, view, width]);

  return (
    <div
      className={`map-tile-plane pointer-events-none absolute inset-0 ${retiring ? "map-tile-plane-retiring" : ""}`}
    >
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

/**
 * The base imagery. When zoom selects another pyramid level, the previous one
 * remains underneath the incoming tiles for a short cross-fade. This mirrors
 * the retained-parent behaviour of mature map renderers and removes the black
 * flash between levels without making tile loading block camera movement.
 */
const MapTileLayer = ({ data, view, width, height }: MapTileLayerProps) => {
  const selectedLevel = selectMapDetailLevel(view.zoom, data.detailLevels);
  const [levels, setLevels] = useState<{ active: number; retiring: number | null }>({
    active: selectedLevel,
    retiring: null,
  });
  const retirementTimerRef = useRef<number | null>(null);

  // React supports adjusting derived state during render: it re-renders this
  // component immediately, before any child sees the stale pyramid level.
  if (selectedLevel !== levels.active) {
    setLevels({ active: selectedLevel, retiring: levels.active });
  }

  const activeLevel = selectedLevel;
  const retiringLevel = selectedLevel === levels.active ? levels.retiring : levels.active;

  useEffect(() => {
    if (retiringLevel === null) return;
    if (retirementTimerRef.current !== null) window.clearTimeout(retirementTimerRef.current);
    retirementTimerRef.current = window.setTimeout(() => {
      setLevels(current => ({ ...current, retiring: null }));
      retirementTimerRef.current = null;
    }, RETIRED_LAYER_LIFETIME_MS);
    return () => {
      if (retirementTimerRef.current !== null) window.clearTimeout(retirementTimerRef.current);
      retirementTimerRef.current = null;
    };
  }, [retiringLevel]);

  return (
    <div className="map-tile-layer pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {retiringLevel !== null && retiringLevel !== activeLevel && (
        <MapTilePlane
          key={`retiring-${retiringLevel}`}
          data={data}
          view={view}
          width={width}
          height={height}
          level={retiringLevel}
          retiring
        />
      )}
      <MapTilePlane
        key={`active-${activeLevel}`}
        data={data}
        view={view}
        width={width}
        height={height}
        level={activeLevel}
      />
    </div>
  );
};

export default memo(MapTileLayer);
