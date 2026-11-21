import { IS_OVERWOLF } from "../../utils/platform";
import { useGameLanguages } from "../../components/layout/use-game-languages";
import { setGameContentLanguage, useGameContentLanguage } from "../../game-content/game-content-language";
import { getGameLanguageFlag } from "../../game-content/game-language-flags";
import { IS_MAP_IT_HOSTED, sidebarLanguage, standaloneSidebarFooter } from "../../components/layout/navigation-host";
import { LATEST_RELEASE_VERSION } from "../../features/updates/release-notes";
import { useUpdateReadState } from "../../features/updates/use-update-read-state";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getDesktopMapFollow, subscribeDesktopMapFollow, toggleDesktopMapFollow } from "../../features/live-position/desktop-map-follow";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import WindowHeader from "../../components/layout/window-header";
import AccountPage from "../../features/account/account-overlay";
import { useOAuthDeepLink } from "../../features/account/use-oauth-deeplink";
import FaqPage from "../../features/faq/faq-page";
import { useFaqDiscovery } from "../../features/faq/use-faq-discovery";
import BridgeModNotice from "../../features/live-bridge/bridge-mod-notice";
import MapWorkspace, { type MapWorkspaceHandle } from "../../features/map/map-workspace";
import { MapToolbarToggle } from "../../features/map/map-collapsible-toolbar";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import OnboardingTour from "../../features/onboarding/onboarding-tour";
import SettingsPage from "../../features/settings/settings-overlay";
import SupportPage from "../../features/support/support-page";
import UpdatesPage from "../../features/updates/updates-page";
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
import { useSupportBadges, useSupportWatch } from "../../state/use-support";

/** Top-level pages rendered inside the dashboard's non-ad content region. */
type DashboardPage = "map" | "account" | "faq" | "settings" | "support" | "updates";
type SettingsFocus = "bridge" | "hotkeys" | null;

const DashboardWindow = ({
  surface = "desktop",
}: {
  /** "desktop" for the main window; "in_game" when rendered as the full-app
   *  overlay window. Only the desktop surface owns game start/stop events. */
  surface?: AnalyticsSurface;
}) => {
  useEffect(() => setupGameLaunchMonitorSwitch(), []);
  // Every event from this window is stamped with its surface, and only the
  // desktop window owns the game start/stop events (see use-analytics).
  useAnalytics(surface);
  // Completes a Google sign-in relayed from the background window. Lives above
  // AuthProvider only in the tree sense — the exchange lands in the same
  // Supabase client the provider subscribes to, so the session still surfaces.
  useOAuthDeepLink();
  return (
    <AuthProvider>
      <DashboardShell surface={surface} />
      {surface === "in_game" && <InGameHotkeyBanner />}
    </AuthProvider>
  );
};

const DashboardShell = ({ surface }: { surface: AnalyticsSurface }) => {
  // Watch support inside AuthProvider so account transitions are observed once.
  useSupportWatch();
  const { t } = useTranslation();
  const [page, setPage] = useState<DashboardPage>("map");
  const mapWorkspaceRef = useRef<MapWorkspaceHandle>(null);
  const desktopMapFollow = useSyncExternalStore(subscribeDesktopMapFollow, getDesktopMapFollow);
  const [webMapFollow, setWebMapFollow] = useState(false);
  const [toolbarExpanded, setToolbarExpanded] = useState(true);
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus>(null);
  const { attention: faqAttention, dismiss: dismissFaqAttention } = useFaqDiscovery();
  const controlsIntroVisible = useMapControlIntro(page === "map");

  // Account/settings navigation is tracked as dashboard page transitions.
  // The initial map state is skipped — the boot pageview is the map workspace's
  // (it knows which map and sidebar mode are showing).
  const pageSeenRef = useRef(false);
  useEffect(() => {
    if (page === "map" && !pageSeenRef.current) return;
    pageSeenRef.current = true;
    reportDashboardPageview(page);
  }, [page]);

  const navigateToMap = useCallback(() => setPage("map"), []);

  const { unread: updatesUnread, markRead } = useUpdateReadState(LATEST_RELEASE_VERSION);
  const gameLanguages = useGameLanguages();
  const gameLanguage = useGameContentLanguage();
  const updatesItem: SidebarItem = { id: "updates", label: t("updates.title"), icon: <Bell size={18} />, active: page === "updates",
      indicator: updatesUnread ? <span className="app-navigation-dot" aria-label={t("updates.unread", { version: LATEST_RELEASE_VERSION })} /> : undefined,
      onSelect: () => { markRead(); setPage("updates"); } };
  const sidebarTools: SidebarItem[] = [
    sidebarLanguage(t("gameLanguage.label"), gameLanguage, gameLanguages.map(({ code, name }) => ({
      id: code, label: name, icon: <img src={getGameLanguageFlag(code)} alt="" />,
    })), setGameContentLanguage, <img src={getGameLanguageFlag(gameLanguage)} alt="" />),
    updatesItem,
  ];

  const navItems: SidebarItem[] = [
    { id: "map", label: t("chrome.map"), active: page === "map", onSelect: navigateToMap },
    { id: "faq", tour: "faq", label: t("faq.tab"), active: page === "faq",
      indicator: faqAttention ? <span className="app-navigation-dot" /> : undefined,
      onSelect: () => { dismissFaqAttention(); setPage("faq"); } },
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
      />}
      <div className="flex min-h-0 flex-1">
        <NavigationSidebar label={t("app.name")} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t("map.markerStyle.icons.pin")} storageKey="app:navigation-pinned" items={navItems} footer={[...sidebarTools, { id: "settings", label: t("settings.title"), active: page === "settings",
          onSelect: () => { setSettingsFocus(null); setPage("settings"); } }]} systemFooter={standaloneItems} />
        <section data-tour-frame data-app-window-page-content className="game-page-artwork relative min-w-0 flex-1 overflow-hidden bg-map-surface">
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          {page === "map" && <div className="absolute left-1/2 top-2 z-[1400] -translate-x-1/2">
            <MapToolbarToggle expanded={toolbarExpanded} onExpandedChange={setToolbarExpanded} />
          </div>}
          <div className={cn("h-full", page !== "map" && "hidden")} aria-hidden={page !== "map"} inert={page !== "map"}>
            <MapWorkspace
              ref={mapWorkspaceRef}
              active={page === "map"}
              controlsIntroVisible={controlsIntroVisible}
              toolbarExpanded={toolbarExpanded}
              onToolbarExpandedChange={setToolbarExpanded}
              followLivePosition={surface === "desktop" && (IS_OVERWOLF ? desktopMapFollow : webMapFollow)}
              onToggleFollowLivePosition={surface === "desktop"
                ? IS_OVERWOLF ? toggleDesktopMapFollow : () => setWebMapFollow((current) => !current)
                : undefined}
            />
          </div>
          {page === "settings" && (
            <SettingsPage
              onNavigateMap={navigateToMap}
              focusBridgeReinstall={settingsFocus === "bridge"}
              focusHotkeys={settingsFocus === "hotkeys"}
            />
          )}
          {page === "faq" && (
            <FaqPage
              onNavigateMap={navigateToMap}
              onNavigateBridgeSettings={() => {
                setSettingsFocus("bridge");
                setPage("settings");
              }}
              onNavigateHotkeySettings={() => {
                setSettingsFocus("hotkeys");
                setPage("settings");
              }}
              onNavigateMods={() => {
                setPage("map");
                window.requestAnimationFrame(() => mapWorkspaceRef.current?.openModLibrary());
              }}
            />
          )}
          {page === "account" && <AccountPage onNavigateMap={navigateToMap} />}
          {page === "support" && <SupportPage />}
          {page === "updates" && (
            <UpdatesPage
              onNavigateMap={navigateToMap}
              onRequestMods={() => {
                setPage("map");
                mapWorkspaceRef.current?.openModRequest();
              }}
            />
          )}
          <BridgeModNotice />
        </section>
        {/* Help & Feedback and updates keep the ad rail.
            Settings and account stay ad-free and reclaim the full width. */}
        {(page === "map" || page === "faq" || page === "support" || page === "updates") && <div className="app-window-ad-column"><OverwolfAdRail /></div>}
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


export default DashboardWindow;
