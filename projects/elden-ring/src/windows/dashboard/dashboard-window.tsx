import { IS_MAP_IT_HOSTED } from "../../components/layout/navigation-host";
import { useEffect } from "react";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import NitroAdRail from "../../features/ads/nitro-ad-rail";
import SecondScreenBanner from "../../features/ads/second-screen-banner";
import GameNavigation from "../../components/layout/game-navigation";
import WindowHeader from "../../components/layout/window-header";
import { GetAppDialog } from "../../features/get-app";
import { MapExperienceProvider } from "../../features/map-experience/map-experience";
import OnboardingTour from "../../features/onboarding/onboarding-tour";
import WhatsNewDialog from "../../features/whats-new/whats-new-dialog";
import GepBridge from "../../features/nightreign/gep-bridge";
import { useOAuthDeepLink } from "../../features/account/use-oauth-deeplink";
import { setupGameLaunchMonitorSwitch } from "../../overwolf-utils/game-launch-monitor-switch";
import { AuthProvider } from "../../state/auth-provider";
import { useAnalytics } from "../../state/use-analytics";
import { useNotificationWatch } from "../../state/use-notification-watch";
import { useUiStore } from "../../store/ui-store";
import { IS_OVERWOLF } from "../../utils/platform";
import MapShell from "./map-shell";

/**
 * The main desktop window: title bar, then a content row split into the
 * interactive map (left, flexible) and the Overwolf ad rail (right, fixed).
 *
 * The map shell owns the whole non-ads region and treats the ad rail as a hard
 * wall — overlays are scoped to this side, never over the ads.
 */
const DashboardWindow = () => {
  // Completes Google sign-in when the eldenringatlas:// deep-link relays back.
  useOAuthDeepLink();
  // Boots PostHog (main window only) and tracks overlay navigation as pageviews.
  useAnalytics();
  // Keeps the header's support dot honest: polls slowly for replies while open.
  useNotificationWatch();

  // The Account and Settings sections are ad-free: hide the rail while either is
  // open so the map region reclaims the full width, then restore it on close.
  // Help & Feedback is NOT in that list — it keeps the rail like every other
  // surface.
  const hideAdRail = useUiStore(
    (s) => s.activeOverlay === "account" || s.activeOverlay === "settings",
  );

  // The main window moves ITSELF off the game's monitor when Elden Ring /
  // Nightreign launches — and, via its startup probe, even when the game is
  // ALREADY running as the app opens (the "installed while playing" case). A
  // probe-based engine ported from BF6: it retries getRunningGameInfo for ~8s
  // until the game's monitorHandle is known, so it no longer misses the move
  // when the handle arrives late. App.tsx guarantees DashboardWindow only mounts
  // in the "main" window, so this never runs in the overlay windows.
  useEffect(() => {
    if (typeof overwolf === "undefined") return;
    setupGameLaunchMonitorSwitch();
  }, []);

  return (
    <AuthProvider>
      {/* h-full, not h-screen: #root is already 100dvh (index.css), which tracks
          the VISIBLE viewport as a mobile browser's address bar shows and hides.
          `100vh` is the taller, static number, so the shell used to hang below
          the fold and clip its own bottom row on a phone. No effect in Overwolf
          (fixed-size native window). */}
      <div className="app-dashboard-window relative flex h-full w-full flex-col overflow-hidden bg-background">
        {IS_OVERWOLF && <WindowHeader standaloneDashboard={!IS_MAP_IT_HOSTED} title="" />}

        <div className="flex min-h-0 flex-1">
          <GameNavigation />
          {/* `relative`: the second-screen ask docks to the bottom-right of the
              map region, so it needs this element as its containing block — and
              being a sibling of MapShell (rather than living inside it) is what
              keeps it out of the in-game overlay, which shares MapShell. */}
          <main data-app-window-page-content className="game-page-artwork relative min-w-0 flex-1">
            <MapExperienceProvider>
              <GepBridge />
              <MapShell />
            </MapExperienceProvider>

            {/* One-time thank-you/ask for players with a spare monitor, now that
                the in-game overlay carries no ads. Self-gating (single screen,
                web build, already acknowledged → renders null). */}
            <SecondScreenBanner />
          </main>

          {/* Ad rail is Overwolf-only (the OwAds SDK requires the Overwolf client).
              The web/mobile build drops it entirely so the map reclaims the full
              width — no empty bordered gutter. */}
          {IS_OVERWOLF && !hideAdRail && (
            <div className="app-window-ad-column flex shrink-0 items-stretch border-l border-border bg-background">
              <OverwolfAdRail />
            </div>
          )}

          {/* Same column on the web, filled by Nitro instead of the OwAds SDK.
              Renders nothing on narrow viewports or when no ad fills, so the map
              keeps the full width rather than showing an empty gutter. */}
          {!IS_OVERWOLF && !hideAdRail && <NitroAdRail />}
        </div>

        {/* Guided first-run tour. A fixed, pointer-events-none overlay whose dim is
            clipped to the map region — it never covers the ad rail and never blocks
            the title-bar controls. Renders null unless the tour is active. */}
        <OnboardingTour />

        {/* Release announcement — same two rules as the tour (never over the ad
            rail, never over the title-bar controls), shown once per release to
            players who already know the app. */}
        <WhatsNewDialog />

        {/* Why the desktop build is worth installing, opened by the title-bar
            pill or the phone drawer's card. Renders null in Overwolf, where the
            app is already installed and a centred dialog would cover the ads. */}
        <GetAppDialog />
      </div>
    </AuthProvider>
  );
};

export default DashboardWindow;
