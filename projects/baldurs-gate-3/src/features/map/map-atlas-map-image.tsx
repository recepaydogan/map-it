import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadCachedMapJson } from "./map-data-cache";
import { parseMapRasterMetadata, type MapRasterMetadata } from "./map-raster-metadata";
import type { MapDefinition } from "./map-registry";
import MapTileImage from "./map-tile-image";
import { getMapImageUrl } from "./map-image-url";
import { getVisibleMapTiles, resolveMapTilePath, type MapScreenRectangle } from "./map-tile-utils";

interface MapAtlasMapImageProps {
  map: MapDefinition;
  rectangle: MapScreenRectangle;
  viewport: { width: number; height: number };
  overscan: number;
  selected: boolean;
}

/** Mounted only for visible maps. Fetches metadata, never marker/content files. */
const MapAtlasMapImage = ({ map, rectangle, viewport, overscan, selected }: MapAtlasMapImageProps) => {
  const { t } = useTranslation();
  const [metadata, setMetadata] = useState<{ url: string; data: MapRasterMetadata } | null>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadCachedMapJson<unknown>(`${map.dataUrl}/metadata.json`)
      .then((raw) => parseMapRasterMetadata(raw, map.dataUrl))
      .then((data) => { if (!cancelled) setMetadata({ url: map.dataUrl, data }); })
      .catch((error: unknown) => {
        console.error(`Could not load atlas raster ${map.id}.`, error);
        if (!cancelled) setFailedUrl(map.dataUrl);
      });
    return () => { cancelled = true; };
  }, [map.dataUrl, map.id]);
  const data = metadata?.url === map.dataUrl ? metadata.data : null;
  const pixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const tiles = useMemo(() => data ? getVisibleMapTiles(data, rectangle, viewport, pixelRatio, overscan) : [],
    [data, rectangle, viewport, pixelRatio, overscan]);

  return (
    <div
      data-atlas-map={map.id}
      aria-current={selected ? "location" : undefined}
      className="map-atlas-map"
      style={rectangle}
    >
      <img className="map-atlas-preview" src={getMapImageUrl(map.dataUrl, "overview.webp")} alt="" draggable={false} />
      {data && tiles.map(({ column, row, level, left, top, width, height }) => (
        <MapTileImage
          key={`${map.dataUrl}:${level}:${column}:${row}`}
          source={getMapImageUrl(data.tileSource.basePath, resolveMapTilePath(data.tileSource.tilePattern, level, column, row))}
          style={{ left, top, width: width + 0.5, height: height + 0.5 }}
          onFailure={() => setFailedUrl(map.dataUrl)}
        />
      ))}
      {failedUrl === map.dataUrl && <span role="alert" className="map-atlas-map-error">{t("map.data.errorBody")}</span>}
    </div>
  );
};

export default MapAtlasMapImage;
