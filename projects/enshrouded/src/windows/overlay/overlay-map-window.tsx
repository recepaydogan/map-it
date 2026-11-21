import { LockKeyhole, MousePointer2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import MapWorkspace from "../../features/map/map-workspace";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import {
  getLatestLivePosition,
  subscribeLivePosition,
} from "../../features/live-position/live-position-store";
import { initializeOverlayMinimap } from "../../features/overlay/overlay-preferences";
import { useOverlayInputLocked } from "../../features/overlay/use-overlay-input-lock";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { cn } from "../../lib/cn";
import { useAnalytics } from "../../state/use-analytics";
import { subscribeToCurrentWindowState } from "../../overwolf-utils/window-manager";
import OverlayMinimapHeader from "./overlay-minimap-header";
import OverlayResizeHandle from "./overlay-resize-handle";

/**
 * The small always-on-top minimap that floats over the game. Draggable by its
 * header, resizable from every edge, and (when a live position feed
 * exists) following the player until the user pans away.
 */
const OverlayMapWindow = () => {
  // Stamps `surface: "overlay"` on anything captured here. The window mounts
  // once and is then hidden/shown from the outside, so per-show visibility is
  // reported by the background (see background-analytics), not this mount.
  useAnalytics("overlay");
  const { t } = useTranslation();
  const inputLocked = useOverlayInputLocked();
  const controlsIntroVisible = useMapControlIntro();
  // The minimap opens following the player — that is what it is for — but the
  // camera is no longer welded to them: panning or the follow button lets go,
  // and the centre button brings it back.
  const [followLivePosition, setFollowLivePosition] = useState(true);
  const [hasLivePosition, setHasLivePosition] = useState(() => getLatestLivePosition() !== null);
  const [cursorHintVisible, setCursorHintVisible] = useState(false);
  const toggleFollowLivePosition = useCallback(
    () => setFollowLivePosition((current) => !current),
    [],
  );

  useEffect(() => {
    return initializeOverlayMinimap();
  }, []);

  useEffect(() => {
    let wasVisible = false;
    let dismissTimer: number | undefined;
    const unsubscribe = subscribeToCurrentWindowState((state) => {
      const normalizedState = state.toLowerCase();
      const visible = normalizedState === "normal" || normalizedState === "maximized";
      if (visible && !wasVisible) {
        const count = Number(localStorage.getItem("gm:minimap-cursor-hint-shown") || "0");
        if (count < 5) {
          localStorage.setItem("gm:minimap-cursor-hint-shown", String(count + 1));
          setCursorHintVisible(true);
          window.clearTimeout(dismissTimer);
          dismissTimer = window.setTimeout(() => setCursorHintVisible(false), 7_000);
        }
      } else if (!visible) {
        setCursorHintVisible(false);
        window.clearTimeout(dismissTimer);
      }
      wasVisible = visible;
    });
    return () => {
      unsubscribe();
      window.clearTimeout(dismissTimer);
    };
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
      if (hasPosition !== hadPosition) setHasLivePosition(hasPosition);
      hadPosition = hasPosition;
    });
  }, []);

  return (
    <main className={cn(
      "overlay-minimap-shell",
      controlsIntroVisible && "map-controls-intro-visible",
      !hasLivePosition && "overlay-minimap-location-pending",
    )}>
      <OverlayResizeHandle />
      <OverlayMinimapHeader />
      <section className="overlay-map-surface relative min-h-0 flex-1 bg-transparent">
        <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
        <MapWorkspace
          overlayMode
          minimapMode
          controlsIntroVisible={controlsIntroVisible}
          followLivePosition={followLivePosition}
          onToggleFollowLivePosition={toggleFollowLivePosition}
        />
      </section>
      {!hasLivePosition && (
        <div className="overlay-minimap-tracker-status" role="status">
          {t("overlay.minimap.preparingLocationTracker")}
        </div>
      )}
      {cursorHintVisible && (
        <button
          type="button"
          className="overlay-minimap-cursor-hint"
          onClick={() => setCursorHintVisible(false)}
          aria-label={t("overlay.minimap.cursorHintDismiss")}
        >
          <MousePointer2 size={12} aria-hidden="true" />
          <span>{t("overlay.minimap.cursorHint")}</span>
        </button>
      )}
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
