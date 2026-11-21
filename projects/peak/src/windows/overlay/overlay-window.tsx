import { useEffect, useRef, useState } from "react";
import MapScreen from "../../features/map/map-screen";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import { subscribeToCurrentWindowState } from "../../overwolf/window-manager";
import { useAnalytics } from "../../state/use-analytics";
import { usePreferences } from "../../state/preferences-store";
import { twMerge } from "tailwind-merge";
import OverlayMinimapHeader from "./overlay-minimap-header";
import OverlayResizeHandle from "./overlay-resize-handle";

const INTERACTION_HINT_STORAGE_KEY = "peak-map:overlay-interaction-hint-seen-v1";

const shouldShowInteractionHint = (): boolean => {
  try {
    return window.localStorage.getItem(INTERACTION_HINT_STORAGE_KEY) !== "1";
  } catch {
    return true;
  }
};

const OverlayWindow = () => {
  useAnalytics("in_game", "overlay");

  const { overlayOpacityPercent } = usePreferences();
  const controlsIntroVisible = useMapControlIntro();
  const [openRevision, setOpenRevision] = useState(0);
  const [interactionHintVisible, setInteractionHintVisible] = useState(shouldShowInteractionHint);
  const wasVisible = useRef(false);

  const markInteractionHintSeen = () => {
    if (!interactionHintVisible) return;
    setInteractionHintVisible(false);
    try {
      window.localStorage.setItem(INTERACTION_HINT_STORAGE_KEY, "1");
    } catch {
      // The hint can safely return next session when storage is unavailable.
    }
  };

  useEffect(
    () => subscribeToCurrentWindowState((state) => {
      const visible = !["closed", "hidden", "minimized"].includes(state);
      if (visible && !wasVisible.current) setOpenRevision((revision) => revision + 1);
      wasVisible.current = visible;
    }),
    [],
  );

  return (
    <main
      className={twMerge(
        "overlay-minimap-shell",
        controlsIntroVisible && "map-controls-intro-visible",
      )}
      style={{ opacity: overlayOpacityPercent / 100 }}
      onPointerDownCapture={markInteractionHintSeen}
    >
      <OverlayResizeHandle />
      <OverlayMinimapHeader showInteractionHint={interactionHintVisible} />
      <section className="overlay-map-surface relative min-h-0 flex-1 bg-transparent">
        <MapScreen isMiniMap miniMapOpenRevision={openRevision} />
      </section>
    </main>
  );
};

export default OverlayWindow;
