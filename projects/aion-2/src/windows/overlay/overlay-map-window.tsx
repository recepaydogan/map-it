import { LockKeyhole } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import MapWorkspace from "../../features/map/map-workspace";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import { initializeOverlayMinimap } from "../../features/overlay/overlay-preferences";
import { useOverlayInputLocked } from "../../features/overlay/use-overlay-input-lock";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { cn } from "../../lib/cn";
import { useAnalytics } from "../../state/use-analytics";
import OverlayMinimapHeader from "./overlay-minimap-header";
import OverlayResizeHandle from "./overlay-resize-handle";

/**
 * The small always-on-top minimap that floats over the game. Draggable by its
 * header and resizable from the top-left corner.
 */
const OverlayMapWindow = () => {
  // Stamps `surface: "overlay"` on anything captured here. The window mounts
  // once and is then hidden/shown from the outside, so per-show visibility is
  // reported by the background (see background-analytics), not this mount.
  useAnalytics("overlay");
  const { t } = useTranslation();
  const inputLocked = useOverlayInputLocked();
  const controlsIntroVisible = useMapControlIntro();
  useEffect(() => {
    void initializeOverlayMinimap().catch(error => console.error("[Minimap] initialize", error));
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
