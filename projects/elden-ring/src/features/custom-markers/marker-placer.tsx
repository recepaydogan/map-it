import { useEffect } from "react";
import { useMap } from "react-leaflet";
import type * as L from "leaflet";
import { NOMINAL_SIZE } from "../../data/maps";
import type { Game, MapLayer } from "../../data/types";
import { useMapExperience } from "../map-experience/map-experience";
import { useCustomMarkerUi } from "./custom-marker-ui";

interface MarkerPlacerProps {
  imageWidth: number;
  imageHeight: number;
  game?: Game;
  layer?: MapLayer;
}

/**
 * While "placing mode" is armed (the Add-marker button), the next click on the map
 * drops a new custom marker: the click point is converted from Leaflet CRS back to
 * NOMINAL pixel space (the inverse of marker-layer's latLngFor) and handed to the
 * create dialog. The map cursor becomes a crosshair, and ESC cancels.
 *
 * Lives inside the MapContainer (needs the live Leaflet map) but renders nothing.
 */
const MarkerPlacer = ({
  imageWidth,
  imageHeight,
  game: gameOverride,
  layer: layerOverride,
}: MarkerPlacerProps) => {
  const map = useMap();
  const experience = useMapExperience();
  const game = gameOverride ?? experience.game;
  const layer = layerOverride ?? experience.layer;
  const placing = useCustomMarkerUi((s) => s.placing);
  const beginCreate = useCustomMarkerUi((s) => s.beginCreate);
  const disarm = useCustomMarkerUi((s) => s.disarm);

  useEffect(() => {
    if (!placing) return;
    const container = map.getContainer();
    const prevCursor = container.style.cursor;
    container.style.cursor = "crosshair";

    const sx = imageWidth / NOMINAL_SIZE;
    const sy = imageHeight / NOMINAL_SIZE;
    const clamp = (v: number) => Math.min(NOMINAL_SIZE, Math.max(0, v));

    const onClick = (e: L.LeafletMouseEvent) => {
      beginCreate({
        pixel: {
          x: clamp(e.latlng.lng / sx),
          y: clamp((imageHeight - e.latlng.lat) / sy),
        },
        game,
        layer,
      });
    };
    // Capture-phase ESC so placing cancels before the app-wide ESC (selection / rail).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      disarm();
    };

    map.on("click", onClick);
    window.addEventListener("keydown", onKey, true);
    return () => {
      container.style.cursor = prevCursor;
      map.off("click", onClick);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [placing, map, game, layer, imageWidth, imageHeight, beginCreate, disarm]);

  return null;
};

export default MarkerPlacer;
