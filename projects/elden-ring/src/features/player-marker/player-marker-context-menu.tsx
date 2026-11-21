import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import { MapPin } from "lucide-react";
import { NOMINAL_SIZE } from "../../data/maps";
import type { Game, MapLayer } from "../../data/types";
import { useMapStore } from "../../store/map-store";

interface PlayerMarkerContextMenuProps {
  /** The game + layer of the map surface this is mounted on — the coordinate space
   *  the clicked point is interpreted in, and where the "you are here" pin is
   *  dropped. Same props the sibling PlayerMarkerLayer takes. */
  game: Game;
  layer: MapLayer;
  imageWidth: number;
  imageHeight: number;
}

interface MenuState {
  /** Cursor position in map-container pixels (for placing the popup). */
  x: number;
  y: number;
  /** The clicked world point (image-pixel latLng) to home the pin to. */
  latlng: L.LatLng;
}

/** Rough popup footprint, used only to keep it from spilling past the map edge. */
const MENU_W = 176;
const MENU_H = 52;
const EDGE_PAD = 8;

/**
 * Right-click anywhere on the map to drop the "you are here" pin exactly there.
 * A small "I am here" popup opens at the cursor; choosing it homes the shared
 * player marker to the clicked point (converting the click's image-pixel latLng
 * back into the NOMINAL pixel the marker stores — the inverse of how
 * PlayerMarkerLayer renders it, so the pin lands precisely under the cursor).
 *
 * Mounts inside the MapContainer (needs the live Leaflet map) and renders its
 * popup as a child of the map container, positioned at the click. Drop it in
 * next to PlayerMarkerLayer on any CRS.Simple image map.
 */
const PlayerMarkerContextMenu = ({
  game,
  layer,
  imageWidth,
  imageHeight,
}: PlayerMarkerContextMenuProps) => {
  const { t } = useTranslation();
  const map = useMap();
  const placePlayerMarker = useMapStore((s) => s.placePlayerMarker);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Wire the map events once. A right-click opens (or repositions) the popup at the
  // cursor; panning, zooming or a left-press dismiss it.
  useEffect(() => {
    const onContext = (e: L.LeafletMouseEvent) => {
      // Suppress the native browser menu so only ours shows.
      e.originalEvent?.preventDefault?.();
      setMenu({ x: e.containerPoint.x, y: e.containerPoint.y, latlng: e.latlng });
    };
    const onDown = (e: L.LeafletMouseEvent) => {
      // Left-press (drag start / click-away) closes; the right-press that opens the
      // menu is button 2 and must not immediately dismiss it.
      if (e.originalEvent?.button === 0) setMenu(null);
    };
    const close = () => setMenu(null);
    map.on("contextmenu", onContext);
    map.on("mousedown", onDown);
    map.on("movestart", close);
    map.on("zoomstart", close);
    return () => {
      map.off("contextmenu", onContext);
      map.off("mousedown", onDown);
      map.off("movestart", close);
      map.off("zoomstart", close);
    };
  }, [map]);

  // Escape closes it too.
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  // Keep clicks/scrolls on the popup from reaching the Leaflet map underneath (a
  // bare click inside the container would otherwise pan or be swallowed).
  useEffect(() => {
    if (!menuRef.current) return;
    L.DomEvent.disableClickPropagation(menuRef.current);
    L.DomEvent.disableScrollPropagation(menuRef.current);
  }, [menu]);

  if (!menu) return null;

  const place = () => {
    const sx = imageWidth / NOMINAL_SIZE;
    const sy = imageHeight / NOMINAL_SIZE;
    placePlayerMarker({
      game,
      layer,
      pixel: {
        x: menu.latlng.lng / sx,
        y: (imageHeight - menu.latlng.lat) / sy,
      },
    });
    setMenu(null);
  };

  // Clamp within the map viewport so the popup never spills off an edge.
  const size = map.getSize();
  const left = Math.max(EDGE_PAD, Math.min(menu.x, size.x - MENU_W - EDGE_PAD));
  const top = Math.max(EDGE_PAD, Math.min(menu.y, size.y - MENU_H - EDGE_PAD));

  return (
    <div
      ref={menuRef}
      className="absolute z-[1200] overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl animate-fade-in"
      style={{ left, top }}
    >
      <button
        onClick={place}
        className="flex w-full items-center gap-2 whitespace-nowrap rounded-[var(--radius-sm)] px-2.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-accent-soft hover:text-accent cursor-pointer"
      >
        <MapPin size={15} className="shrink-0 text-accent" aria-hidden="true" />
        {t("tracking.iAmHere")}
      </button>
    </div>
  );
};

export default PlayerMarkerContextMenu;
