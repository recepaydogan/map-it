import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import { startCloudSync } from "./store/cloud-sync";
import { startCrossWindowSync } from "./store/cross-window-sync";
import { startAnchorAdInset } from "./features/ads/anchor-ad-inset";
import { startWebUrlSync } from "./store/web-url-sync";
import { IS_OVERWOLF } from "./utils/platform";
import CompanionWindow from "./windows/companion/companion-window";
import DashboardWindow from "./windows/dashboard/dashboard-window";
import OverlayMapWindow from "./windows/overlay/overlay-map-window";
import OverlayWindow from "./windows/overlay/overlay-window";

/**
 * app.html is shared by all visible Overwolf windows. This component
 * figures out which window it is running in and renders the matching UI.
 *
 * In Overwolf we wait for the real window name (getCurrentWindow) before
 * mounting, so the overlay window never briefly boots the main dashboard and
 * runs its window-management effects. Outside Overwolf (dev in a browser) we
 * fall back to the ?window= query param, defaulting to "main".
 */
export const App = () => {
  const [windowName, setWindowName] = useState<string | null>(() => {
    if (typeof window === "undefined") return "main";

    const windowParam = new URLSearchParams(window.location.search).get("window");
    if (windowParam) return windowParam;

    return typeof overwolf === "undefined" ? "main" : null;
  });

  useEffect(() => {
    if (typeof overwolf === "undefined") return;
    overwolf.windows.getCurrentWindow((result) => {
      if (result.success) setWindowName(result.window.name);
    });
  }, []);

  // Once we know which window this is, start live cross-window state sync — but
  // only for the windows that actually render the map. A change in one (clearing
  // a marker, dropping a custom pin, toggling filters) then shows up in the other
  // while both are open. The collapsed `overlay` widget has no map UI, so skip it.
  // Same two windows also mirror the player's own progress (found markers,
  // bookmarks, custom pins, build) to their account when signed in — the promise
  // the sign-in card makes. Signed out it is inert and the map stays local-only.
  useEffect(() => {
    if (windowName === "main" || windowName === "overlay_map") {
      startCrossWindowSync(windowName);
      startCloudSync();
    }
    // Web only: mirror tab switches into the URL so Vercel Analytics counts
    // each surface as its own pageview (and screens become deep-linkable).
    if (!IS_OVERWOLF && windowName === "main") startWebUrlSync();
    // Web only: keep the map's bottom-docked UI clear of Nitro's anchor ad.
    if (!IS_OVERWOLF && windowName === "main") return startAnchorAdInset();
  }, [windowName]);

  if (windowName === null) return null;

  // Vercel Analytics is website-only: the Overwolf windows load from local OPK
  // files where the /_vercel/insights beacon doesn't exist, and app-side
  // analytics are PostHog's job anyway.
  const analytics = IS_OVERWOLF ? null : <Analytics />;

  if (windowName === "overlay") {
    return (
      <>
        <OverlayWindow />
        {analytics}
      </>
    );
  }
  if (windowName === "overlay_map") {
    return (
      <>
        <OverlayMapWindow />
        {analytics}
      </>
    );
  }
  if (windowName === "companion") {
    return (
      <>
        <CompanionWindow />
        {analytics}
      </>
    );
  }
  return (
    <>
      <DashboardWindow />
      {analytics}
    </>
  );
};

export default App;
