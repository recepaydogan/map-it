import { LockKeyhole } from "lucide-react";
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
import OverlayMinimapHeader from "./overlay-minimap-header";
import OverlayResizeHandle from "./overlay-resize-handle";
import InGameAutoOpenBanner from "../dashboard/in-game-auto-open-banner";

/**
 * The small always-on-top minimap that floats over the game. Draggable by its
 * header, resizable from the top-left corner, and (when a live position feed
 * exists) following the player until the user pans away.
 */
const OverlayMapWindow = () => {
  // Stamps `surface: "overlay"` on interactions captured here.
  useAnalytics("overlay");
  const { t } = useTranslation();
  const inputLocked = useOverlayInputLocked();
  const controlsIntroVisible = useMapControlIntro();
  // The minimap opens following the player — that is what it is for — but the
  // camera is no longer welded to them: panning or the follow button lets go,
  // and the centre button brings it back.
  const [followLivePosition, setFollowLivePosition] = useState(true);
  const toggleFollowLivePosition = useCallback(
    () => setFollowLivePosition((current) => !current),
    [],
  );

  useEffect(() => {
    void initializeOverlayMinimap();
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
          controlsIntroVisible={controlsIntroVisible}
          followLivePosition={followLivePosition}
          onToggleFollowLivePosition={toggleFollowLivePosition}
        />
        <InGameAutoOpenBanner minimap />
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
