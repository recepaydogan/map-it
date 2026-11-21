import { useEffect, useState } from "react";
import { GAME_MAP_DIMENSIONS, GAME_TELEMETRY } from "../../game-config";
import { MAP_WINDOW_COMMAND_MESSAGE_ID } from "../../features/map/map-window-command";
import {
  closeOverlayMarkerDetails,
  readOverlayMarkerDetails,
  subscribeOverlayMarkerDetails,
} from "../../features/overlay/overlay-marker-details";
import { useGameSession } from "../../features/game-session/use-game-session";
import { resolveWorldMapPlayer } from "../../features/worlds/world-map-player";
import WorldStructureMinimapPanel from "../../features/worlds/world-structure-minimap-panel";
import { useWorldLibrary, worldRepository } from "../../features/worlds/use-world-library";
import { bindDragMoveElement, OVERLAY_MAP_WINDOW } from "../../overwolf-utils/window-manager";
import OverlayResizeHandle from "./overlay-resize-handle";

const OverlayMarkerDetailsWindow = () => {
  const [request, setRequest] = useState(readOverlayMarkerDetails);
  const library = useWorldLibrary();
  const live = useGameSession();
  const world = library.data?.worlds.find(candidate => candidate.id === request?.worldId) ?? null;
  const player = world ? resolveWorldMapPlayer(world, live, library.data?.binding ?? null, live.now,
    GAME_TELEMETRY.staleAfterMs, GAME_MAP_DIMENSIONS.map(item => item.id), GAME_TELEMETRY.coordinateLimit) : null;

  useEffect(() => subscribeOverlayMarkerDetails(setRequest), []);
  useEffect(() => bindDragMoveElement(document.querySelector<HTMLElement>("[data-overlay-details-drag]"),
    { disableDoubleClickMaximize: true }), [request?.point.id]);

  if (!request || !world) return null;
  const centerOnMap = () => {
    if (typeof overwolf === "undefined") return;
    overwolf.windows.sendMessage(OVERLAY_MAP_WINDOW, MAP_WINDOW_COMMAND_MESSAGE_ID,
      { type: "center", x: request.point.x, z: request.point.z }, () => {});
  };

  return <main className="overlay-details-shell relative h-full w-full overflow-hidden bg-transparent p-1">
    <OverlayResizeHandle />
    <WorldStructureMinimapPanel key={`${request.worldId}:${request.dimension}:${request.point.id}`}
      standalone world={world} dimension={request.dimension} point={request.point} player={player}
      savePersonal={async (worldId, change) => (await worldRepository.updatePersonal(worldId, change)).personal}
      onCenter={centerOnMap} onClose={() => { void closeOverlayMarkerDetails(); }} />
  </main>;
};

export default OverlayMarkerDetailsWindow;
