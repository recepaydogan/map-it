import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useMap } from "react-leaflet";
import { NOMINAL_SIZE } from "../../data/maps";
import type { MapLayer } from "../../data/types";
import { isOverwolf } from "../../utils/overwolf";
import PlayerMarkerLayer from "../player-marker/player-marker-layer";
import { selectedCharacter, useSaveTracking } from "./save-tracking-store";
import { projectSavedPosition } from "./save-position-projection";
import { useSavedPositionAge } from "./use-saved-position-age";

interface SavePositionLayerProps {
  layer: MapLayer;
  imageWidth: number;
  imageHeight: number;
  onViewChange: (layer: string) => void;
}

const SavePositionLayer = ({ layer, imageWidth, imageHeight, onViewChange }: SavePositionLayerProps) => {
  const { t } = useTranslation();
  const map = useMap();
  const character = useSaveTracking(selectedCharacter);
  const focusNonce = useSaveTracking((state) => state.focusNonce);
  const position = isOverwolf() ? projectSavedPosition(character) : null;
  const age = useSavedPositionAge(position ? character?.savedAt : undefined);
  const lastFocus = useRef("");
  // Focus once for each character/layer, or when explicitly requested. Reading a
  // new save updates the pin without fighting the user's subsequent map panning.
  useEffect(() => {
    if (!position || !character) return;
    const key = `${character.id}:${position.layer}:${focusNonce}`;
    if (lastFocus.current === key) return;
    if (position.layer !== layer) { onViewChange(position.layer); return; }
    lastFocus.current = key;
    map.setView([
      imageHeight - position.pixel.y / NOMINAL_SIZE * imageHeight,
      position.pixel.x / NOMINAL_SIZE * imageWidth,
    ], Math.max(map.getZoom(), -1), { animate: false });
  }, [character, position, layer, focusNonce, map, onViewChange, imageWidth, imageHeight]);

  return <PlayerMarkerLayer
    game="elden-ring" layer={layer} imageWidth={imageWidth} imageHeight={imageHeight}
    marker={position} label={t("saveTracking.lastSavedPosition", { age })}
  />;
};

export default SavePositionLayer;
