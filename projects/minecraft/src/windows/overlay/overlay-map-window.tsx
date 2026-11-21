import { LockKeyhole } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import MapWorkspace from "../../features/map/map-workspace";
import {
  MAP_WINDOW_COMMAND_MESSAGE_ID,
  parseMapWindowCommand,
  type MapWindowCommand,
} from "../../features/map/map-window-command";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import { useGameSession } from "../../features/game-session/use-game-session";
import {
  getLatestLivePosition,
  subscribeLivePosition,
} from "../../features/live-position/live-position-store";
import { initializeOverlayMinimap } from "../../features/overlay/overlay-preferences";
import { useOverlayInputLocked } from "../../features/overlay/use-overlay-input-lock";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { cn } from "../../lib/cn";
import { useAnalytics } from "../../state/use-analytics";
import OverlayMinimapHeader from "./overlay-minimap-header";
import OverlayResizeHandle from "./overlay-resize-handle";

/**
 * The small always-on-top minimap that floats over the game. Draggable by its
 * header, resizable from the top-left corner, and (when a live position feed
 * exists) following the player until the user pans away.
 */
const OverlayMapWindow = () => {
  // Stamps `surface: "overlay"` on anything captured here. The window mounts
  // once and is then hidden/shown from the outside, so per-show visibility is
  // reported by the background (see background-analytics), not this mount.
  useAnalytics("overlay");
  const { t } = useTranslation();
  const inputLocked = useOverlayInputLocked();
  const gameSession = useGameSession();
  const controlIntroSessionKey = gameSession.session?.connected
    ? `${gameSession.session.id}:${gameSession.session.generation}`
    : null;
  const controlsIntroVisible = useMapControlIntro(Boolean(controlIntroSessionKey), {
    durationMs: 60_000,
    revealKey: controlIntroSessionKey,
    revealOncePerKey: true,
  });
  // The minimap opens following the player — that is what it is for — but the
  // camera is no longer welded to them: panning or the follow button lets go,
  // and the centre button brings it back.
  const [followLivePosition, setFollowLivePosition] = useState(true);
  const [zoomCommand, setZoomCommand] = useState<MapWindowCommand | null>(null);
  const toggleFollowLivePosition = useCallback(
    () => setFollowLivePosition((current) => !current),
    [],
  );

  useEffect(() => {
    void initializeOverlayMinimap();
  }, []);

  useEffect(() => {
    if (typeof overwolf === "undefined") return;
    const receiveCommand = (message: { id: string; content?: unknown }) => {
      if (message.id !== MAP_WINDOW_COMMAND_MESSAGE_ID) return;
      const command = parseMapWindowCommand(message.content);
      if (!command) return;
      setZoomCommand((current) => ({ ...command, revision: (current?.revision ?? 0) + 1 }));
    };
    overwolf.windows.onMessageReceived.addListener(receiveCommand);
    return () => overwolf.windows.onMessageReceived.removeListener(receiveCommand);
  }, []);

  // This window mounts once and outlives game sessions, so a follow switched
  // off during one session would silently stay off for the next. The store is
  // cleared when the game exits, so the first position after a gap IS the new
  // session's first fix — re-arm follow on it, the way a fresh mount would.
  useEffect(() => {
    let hadPosition = getLatestLivePosition() !== null;
    return subscribeLivePosition((position) => {
      const hasPosition = position !== null;
      if (hasPosition && !hadPosition) setFollowLivePosition(true);
      hadPosition = hasPosition;
    });
  }, []);

  return (
    <main className={cn(
      "overlay-minimap-shell",
      controlsIntroVisible && "map-controls-intro-visible",
    )}>
      <OverlayResizeHandle />
      <OverlayMinimapHeader />
      <section className="overlay-map-surface relative min-h-0 flex-1 bg-transparent">
        <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
        <MapWorkspace
          overlayMode
          minimapMode
          viewScope="in-game"
          controlsIntroVisible={controlsIntroVisible}
          zoomCommand={zoomCommand}
          followLivePosition={followLivePosition}
          onToggleFollowLivePosition={toggleFollowLivePosition}
        />
      </section>
      {inputLocked && (
        <div className="overlay-lock-badge" aria-live="polite">
          <LockKeyhole size={12} aria-hidden="true" />
          {t("overlay.minimap.locked")}
        </div>
      )}
    </main>
  );
};

export default OverlayMapWindow;
