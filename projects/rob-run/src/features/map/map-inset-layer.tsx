import { memo } from "react";
import { useTranslation } from "react-i18next";
import MapTileImage from "./map-tile-image";
import { screenPointStyle } from "./map-projection";
import type { MapMetadata, MapView } from "./types";

/** Images and their headings share the same camera transform as the markers. */
const MapInsetLayer = ({ data, view, width, height, trackedInsetId }: {
  data: MapMetadata; view: MapView; width: number; height: number; trackedInsetId?: string;
}) => {
  const { t } = useTranslation();
  return <div className="pointer-events-none absolute inset-0 overflow-hidden">
    {data.insets?.map((inset) => {
      const left = (inset.bounds.minX - view.centerX) * view.zoom + width / 2;
      const top = (inset.bounds.minY - view.centerY) * view.zoom + height / 2;
      const imageWidth = (inset.bounds.maxX - inset.bounds.minX) * view.zoom;
      const imageHeight = (inset.bounds.maxY - inset.bounds.minY) * view.zoom;
      const inView = left <= width && top <= height && left + imageWidth >= 0 && top + imageHeight >= 0;
      if (!inView && inset.id !== trackedInsetId) return null;
      return <div key={inset.id} data-map-inset-id={inset.id === trackedInsetId ? inset.id : undefined}
        className="absolute" style={{ ...screenPointStyle(left, top, { centered: false }), width: imageWidth, height: imageHeight }}>
        {inView && <MapTileImage source={`${data.tileSource.basePath}/${inset.image}`} style={{ width: imageWidth, height: imageHeight }} />}
        {inView && imageWidth >= 100 && <div className="absolute inset-x-0 top-[22%] -translate-y-1/2 px-5 text-center font-display text-xs font-semibold text-zinc-100 drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]" style={{ fontSize: `calc(${Math.min(20, Math.max(11, imageWidth / 24))}px * var(--app-font-scale))` }}>
          <span className="line-clamp-2">{t(inset.nameKey)}</span>
        </div>}
      </div>;
    })}
  </div>;
};

export default memo(MapInsetLayer);
