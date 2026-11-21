import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import { nudgeZoom } from "../map/map-view";
import { erMapContentBoundsFor } from "./er-map-bounds";
import type { ErMapLayerDefinition } from "./types";

const TILE_SIZE = 256;
export const BLANK_TILE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const minNativeZoomFor = (width: number, height: number) =>
  Math.floor(Math.log2(TILE_SIZE / Math.max(width, height)));

const ErMapTiles = ({ layer }: { layer: ErMapLayerDefinition }) => {
  const map = useMap();

  useEffect(() => {
    const tileLayer = L.tileLayer(
      `/maps/tiles/${layer.tileSet}/{z}/{x}/{y}.webp`,
      {
        tileSize: TILE_SIZE,
        noWrap: true,
        bounds: erMapContentBoundsFor(layer),
        minZoom: -5,
        maxZoom: 3,
        minNativeZoom: minNativeZoomFor(layer.imageWidth, layer.imageHeight),
        maxNativeZoom: 0,
        keepBuffer: 3,
        errorTileUrl: BLANK_TILE,
        className: "er-map-tiles",
      },
    );
    tileLayer.addTo(map);
    // Same cure as the live map's TiledMap (see map-view.tsx): a freshly-added
    // GridLayer can race the map's size/zoom state and its first _update draws
    // nothing → black map until a manual zoom. A deferred invisible zoom-nudge
    // forces a viewreset once the swap has settled, so tiles paint on their own.
    const raf = requestAnimationFrame(() => nudgeZoom(map));
    return () => {
      cancelAnimationFrame(raf);
      map.removeLayer(tileLayer);
    };
  }, [layer, map]);

  return null;
};

export default ErMapTiles;
