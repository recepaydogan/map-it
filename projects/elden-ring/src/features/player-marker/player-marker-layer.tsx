import { useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import * as L from "leaflet";
import { NOMINAL_SIZE } from "../../data/maps";
import type { Game, MapLayer } from "../../data/types";
import type { PlayerMarker } from "../../store/map-store";
import { buildPlayerIcon } from "./player-marker-icon";

interface PlayerMarkerLayerProps {
  game: Game;
  layer: MapLayer;
  imageWidth: number;
  imageHeight: number;
  marker: PlayerMarker | null;
  label: string;
}

const PlayerMarkerLayer = ({ game, layer, imageWidth, imageHeight, marker, label }: PlayerMarkerLayerProps) => {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const onThisMap = marker?.game === game && marker.layer === layer ? marker : null;
  const present = onThisMap !== null;

  useEffect(() => {
    if (!present) return;
    if (!map.getPane("player")) map.createPane("player");
    const pin = L.marker([0, 0], {
      icon: buildPlayerIcon(), pane: "player", interactive: false, keyboard: false,
    });
    pin.bindTooltip(document.createElement("span"), {
      direction: "bottom", offset: [0, 0], className: "er-player-label", permanent: true,
    });
    pin.addTo(map);
    markerRef.current = pin;
    return () => { pin.remove(); markerRef.current = null; };
  }, [map, present]);

  useEffect(() => {
    const text = document.createElement("span");
    text.textContent = label;
    markerRef.current?.setTooltipContent(text);
  }, [label, present]);

  useEffect(() => {
    if (!onThisMap || !markerRef.current) return;
    markerRef.current.setLatLng([
      imageHeight - onThisMap.pixel.y / NOMINAL_SIZE * imageHeight,
      onThisMap.pixel.x / NOMINAL_SIZE * imageWidth,
    ]);
  }, [onThisMap, imageWidth, imageHeight]);

  return null;
};

export default PlayerMarkerLayer;
