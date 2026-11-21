import { useAuth } from "../../state/use-auth";
import { IS_OVERWOLF } from "../../utils/platform";
import { IS_MAP_IT_HOSTED, standaloneSidebarFooter } from "../../components/layout/navigation-host";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import SupportPage from "../../features/support/support-page";
import { useSupportBadges, useSupportWatch } from "../../state/use-support";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getDesktopMapFollow, subscribeDesktopMapFollow, toggleDesktopMapFollow } from "../../features/live-position/desktop-map-follow";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import WindowHeader from "../../components/layout/window-header";
import AccountPage from "../../features/account/account-overlay";
import { GAME_CONFIG } from "../../game-config";
import MapWorkspace from "../../features/map/map-workspace";
import {
  getLatestLivePosition,
  subscribeLivePosition,
} from "../../features/live-position/live-position-store";
import {
  requestMapLocationNavigation,
  type MapLocationNavigationTarget,
} from "../../features/map/map-location-navigation";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import ItemDatabasePage from "../../features/items/item-database-page";
import OnboardingTour from "../../features/onboarding/onboarding-tour";
import SettingsPage from "../../features/settings/settings-overlay";
import { cn } from "../../lib/cn";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { setupGameLaunchMonitorSwitch } from "../../overwolf-utils/game-launch-monitor-switch";
import type { AnalyticsSurface } from "../../services/analytics/app-context";
import InGameHotkeyBanner from "./in-game-hotkey-banner";
import { AuthProvider } from "../../state/auth-provider";
import {
  reportDashboardPageview,
  useAnalytics,
} from "../../state/use-analytics";

/** Top-level pages rendered inside the dashboard's non-ad content region. */
type DashboardPage = "map" | "database" | "account" | "settings" | "support";


/**
 * The full app window. Rendered twice by the manifest: as the desktop `main`
 * window and as the `in_game` overlay window that paints over the game.
 */
const DashboardWindow = ({
  surface = "desktop",
}: {
  /** "desktop" for the main window; "in_game" when rendered as the full-app
   *  overlay window. Only the desktop surface owns game start/stop events. */
  surface?: AnalyticsSurface;
}) => {
  // The desktop window moves itself to the other monitor when the game
  // launches on the one it shares (a no-op in any other window).
  useEffect(() => setupGameLaunchMonitorSwitch(), []);
  useAnalytics(surface);
  useSupportWatch();

  return (
    <AuthProvider>
      <DashboardShell surface={surface} />
      {surface === "in_game" && <InGameHotkeyBanner />}
    </AuthProvider>
  );
};

const DashboardShell = ({ surface }: { surface: AnalyticsSurface }) => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [page, setPage] = useState<DashboardPage>("map");
  const [followLivePosition, setFollowLivePosition] = useState(surface === "in_game");
  const desktopMapFollow = useSyncExternalStore(subscribeDesktopMapFollow, getDesktopMapFollow);
  const isDesktopWindow = IS_OVERWOLF && surface === "desktop";
  const controlsIntroVisible = useMapControlIntro(page === "map");

  // Non-map navigation is tracked as dashboard page transitions.
  // The initial map state is skipped — the boot pageview is the map workspace's
  // (it knows which map and sidebar mode are showing).
  const pageSeenRef = useRef(false);
  useEffect(() => {
    if (page === "map" && !pageSeenRef.current) return;
    pageSeenRef.current = true;
    reportDashboardPageview(page);
  }, [page]);

  useEffect(() => {
    if (surface !== "in_game") return;
    let hadPosition = getLatestLivePosition() !== null;
    return subscribeLivePosition((position) => {
      const hasPosition = position !== null;
      if (hasPosition && !hadPosition) setFollowLivePosition(true);
      hadPosition = hasPosition;
    });
  }, [surface]);

  const navigateToMap = useCallback(() => setPage("map"), []);
  const navigateToMapLocation = useCallback((target: MapLocationNavigationTarget) => {
    requestMapLocationNavigation(target);
    setPage("map");
  }, []);

  const navItems: SidebarItem[] = [
    { id: "map", label: t("chrome.map"), active: page === "map", onSelect: navigateToMap },
    { id: "database", label: t("items.title"), active: page === "database", onSelect: () => setPage("database") },
  ];

  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const supportBadge = unreadReplies + (isAdmin ? inboxPending : 0);
  const standaloneItems = standaloneSidebarFooter(
    { label: t("support.title"), active: page === "support", onSelect: () => setPage("support"),
      indicator: supportBadge > 0 ? <span className="app-navigation-dot" /> : undefined },
    { label: t("account.open"), active: page === "account", onSelect: () => setPage("account") },
  );

  return (
    <main className="app-dashboard-window relative flex h-screen w-screen flex-col overflow-hidden bg-background text-white">
      {IS_OVERWOLF && <WindowHeader standaloneDashboard={!IS_MAP_IT_HOSTED}
        title={GAME_CONFIG.appName}
      />}
      <div className="flex min-h-0 flex-1">
        <NavigationSidebar label={GAME_CONFIG.appName} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t("map.markerStyle.icons.pin")} storageKey="app:navigation-pinned" items={navItems} footer={[{ id: "settings", label: t("settings.title"), active: page === "settings", onSelect: () => setPage("settings") }]} systemFooter={standaloneItems} />
        <section data-tour-frame data-app-window-page-content className="game-page-artwork relative min-w-0 flex-1 overflow-hidden bg-map-surface">
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          <div className={cn("h-full", page !== "map" && "hidden")} aria-hidden={page !== "map"} inert={page !== "map"}>
            <MapWorkspace
              active={page === "map"}
              controlsIntroVisible={controlsIntroVisible}
              followLivePosition={isDesktopWindow ? desktopMapFollow : followLivePosition}
              onToggleFollowLivePosition={isDesktopWindow ? toggleDesktopMapFollow : () => setFollowLivePosition((current) => !current)}
            />
          </div>
          {page === "support" && <SupportPage key={user?.id ?? "guest"} />}
          {page === "settings" && <SettingsPage onNavigateMap={navigateToMap} />}
          {page === "account" && <AccountPage onNavigateMap={navigateToMap} />}
          {page === "database" && (
            <ItemDatabasePage onNavigateMapLocation={navigateToMapLocation} />
          )}
        </section>
        {/* The map and item database both keep the reserved ad rail visible.
            Other secondary surfaces remain full-width. */}
        {(page === "map" || page === "database" || page === "support") && <div className="app-window-ad-column"><OverwolfAdRail /></div>}
      </div>
      {/* Fixed overlay — its dim layer is clipped to the map section above, so it
          never shades the ad rail or the window header. */}
      <OnboardingTour
        mapActive={page === "map"}
        onNavigateMap={navigateToMap}
        autoStart={surface === "desktop"}
      />
    </main>
  );
};

/**
 * Header entry to the account surface. Once signed in the accessible label carries the
 * display name, so the header answers "who am I?" without opening anything.
 * It stays put when Supabase isn't configured rather than vanishing: the page
 * says why accounts are unavailable, which is what someone mid-setup needs.
 */


export default DashboardWindow;
