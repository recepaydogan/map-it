import { memo } from "react";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import { IS_OVERWOLF } from "../../utils/platform";

/** Owned by the host window, never by the selected game or its navigation. */
const AppLibraryAdRail = memo(function AppLibraryAdRail() {
  if (!IS_OVERWOLF) return null;
  return <div data-map-it-ad-rail className="absolute top-[var(--map-it-window-controls-height)] right-0 bottom-0 z-20 w-[var(--map-it-ad-rail-width)] overflow-hidden border-l border-border bg-background">
    <OverwolfAdRail />
  </div>;
});

export default AppLibraryAdRail;
