import { useEffect } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import { erRegionsImage } from "../../data/er-regions";
import { useMapStore } from "../../store/map-store";
import { useMapExperience } from "../map-experience/map-experience";

/**
 * Official region overlay — a semi-transparent colour wash of each named overworld region's
 * extent + borders (Limgrave, Liurnia, Caelid, Altus…), straight from the game's own region
 * mask textures (data/src/build-er-region-masks.mjs). One image overlay authored in NOMINAL
 * space, stretched over the whole map bounds — the same way the base map renders — so it
 * lines up with the pins without any per-view maths.
 *
 * Sits UNDER the pins as context (overlayPane is below the marker panes) and never captures
 * clicks (`interactive: false`), so it's pure backdrop. Overworld + Elden Ring only: the mask
 * is overworld-specific, so the layer no-ops on the DLC / underground maps and in Nightreign.
 * Off by default; toggled from the map controls exactly like the map-fragment overlay.
 */
const RegionOverlay = ({
  imageWidth,
  imageHeight,
}: {
  imageWidth: number;
  imageHeight: number;
}) => {
  const map = useMap();
  const { game, layer } = useMapExperience();
  const showRegions = useMapStore((s) => s.showRegions);

  const on = showRegions && game === "elden-ring" && layer === "overworld";

  useEffect(() => {
    if (!on) return;
    // The overlay is authored in NOMINAL space but represents the full map, so it covers the
    // entire bounds; Leaflet scales it to this map's real pixel size, preserving alignment.
    const overlay = L.imageOverlay(
      erRegionsImage.src,
      L.latLngBounds([0, 0], [imageHeight, imageWidth]),
      { opacity: 0.4, interactive: false, className: "er-region-overlay" },
    ).addTo(map);

    return () => {
      map.removeLayer(overlay);
    };
  }, [on, map, imageWidth, imageHeight]);

  return null;
};

export default RegionOverlay;
