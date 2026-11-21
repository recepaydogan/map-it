import { GAME_CONFIG } from "../../game-config";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import { getLanguageFlag } from "../../i18n/language-flags";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { IS_OVERWOLF } from "../../utils/platform";
import { IS_MAP_IT_HOSTED, sidebarLanguage, standaloneSidebarFooter } from "../../components/layout/navigation-host";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { GAME_EDITIONS } from "../../game-config";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import WindowHeader from "../../components/layout/window-header";
import AccountPage from "../../features/account/account-overlay";
import MapWorkspace from "../../features/map/map-workspace";
import GameGuidePage from "../../features/knowledge/game-guide-page";
import { GUIDE_KIND_ICONS, GUIDE_MENU_KINDS, type GuideKind } from "../../features/knowledge/game-guide-categories";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import OnboardingTour from "../../features/onboarding/onboarding-tour";
import SettingsPage from "../../features/settings/settings-overlay";
import { cn } from "../../lib/cn";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { setupGameLaunchMonitorSwitch } from "../../overwolf-utils/game-launch-monitor-switch";
import { collapseInGameApp } from "../../overwolf-utils/window-manager";
import type { AnalyticsSurface } from "../../services/analytics/app-context";
import InGameHotkeyBanner from "./in-game-hotkey-banner";
import { AuthProvider } from "../../state/auth-provider";
import {
  reportDashboardPageview,
  useAnalytics,
} from "../../state/use-analytics";
import JourneyHistoryPage from "../../features/journey/journey-history-page";
import SeedDiscoveryPage from "../../features/seeds/seed-discovery-page";
import type { NewWorld, WorldCreateRequest } from "../../features/worlds/world-types";
import type { WorldStructureSearchRequest } from "../../features/worlds/world-structure-search-request";
import SupportPage from "../../features/support/support-page";
import { markSupportNudgeSeen } from "../../features/support/support-nudge-state";
import { useSupportBadges, useSupportWatch } from "../../state/use-support";

/** Top-level pages rendered inside the dashboard's non-ad content region. */
type DashboardPage = "map" | "journeys" | "guide" | "seeds" | "account" | "settings" | "support";


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

  return (
    <AuthProvider>
      <DashboardShell surface={surface} />
      {surface === "in_game" && <InGameHotkeyBanner />}
    </AuthProvider>
  );
};

const DashboardShell = ({ surface }: { surface: AnalyticsSurface }) => {
  useSupportWatch();
  const { t } = useTranslation();
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const supportBadge = unreadReplies + (isAdmin ? inboxPending : 0);
  const [page, setPage] = useState<DashboardPage>("map");
  const [seedEditionFilter, setSeedEditionFilter] = useState<"all" | (typeof GAME_EDITIONS)[number]["id"]>("all");
  const [seedPreferredVersion, setSeedPreferredVersion] = useState<string | null>(null);
  const [createRequest, setCreateRequest] = useState<WorldCreateRequest | null>(null);
  const createRevision = useRef(0);
  const [guideKind, setGuideKind] = useState<GuideKind>("item");
  const [structureSearchRequest, setStructureSearchRequest] = useState<WorldStructureSearchRequest | null>(null);
  const structureSearchRevision = useRef(0);
  const [followLivePosition, setFollowLivePosition] = useState(false);
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
  const exploreSeeds = useCallback((edition: string, version: string) => {
    setSeedEditionFilter(GAME_EDITIONS.find(item => item.id === edition)?.id ?? "all");
    setSeedPreferredVersion(version);
    setPage("seeds");
  }, []);
  const createFromSeed = useCallback((input: NewWorld) => {
    setCreateRequest({ revision: ++createRevision.current, input });
    setPage("map");
  }, []);

  const navItems: SidebarItem[] = [
    { id: "map", tour: "map-nav", label: t("chrome.map"), active: page === "map", onSelect: navigateToMap },
    { id: "guide", tour: "guide", label: t("inspector.guide"), active: page === "guide",
      subItems: GUIDE_MENU_KINDS.map(kind => {
        const Icon = GUIDE_KIND_ICONS[kind];
        return { id: kind, label: t(`inspector.subjectKinds.${kind}`), icon: <Icon size={17} />,
          active: page === "guide" && guideKind === kind,
          onSelect: () => { setGuideKind(kind); setPage("guide"); } };
      }) },
    { id: "journeys", tour: "journeys", label: t("journeyHistory.nav"), active: page === "journeys", onSelect: () => setPage("journeys") },
    { id: "seeds", tour: "seeds", label: t("seeds.nav"), active: page === "seeds",
      onSelect: () => { setSeedEditionFilter("all"); setSeedPreferredVersion(null); setPage("seeds"); } },
  ];

  const language = useAppLanguage();
  const sidebarTools: SidebarItem[] = [
    sidebarLanguage(t("language.label"), language, APP_LANGUAGES.map(({ code, name }) => ({
      id: code, label: name, icon: <img src={getLanguageFlag(code)} alt="" />,
    })), setAppLanguage),
  ];

  const standaloneItems = standaloneSidebarFooter(
    { label: t("support.title"), active: page === "support", onSelect: () => { markSupportNudgeSeen(); setPage("support"); },
      indicator: supportBadge > 0 ? <span className="app-navigation-dot" /> : undefined },
    { label: t("account.open"), active: page === "account", onSelect: () => setPage("account") },
  );

  const hideInGameWindow = () => {
    void collapseInGameApp().catch(error =>
      console.error("[Overlay] Unable to hide the in-game app", error));
  };

  return (
    <main className="app-dashboard-window relative flex h-screen w-screen flex-col overflow-hidden bg-background text-white">
      {IS_OVERWOLF && <WindowHeader standaloneDashboard={!IS_MAP_IT_HOSTED}
        onCloseOverride={surface === "in_game" ? hideInGameWindow : undefined}
        onMinimizeOverride={surface === "in_game" ? hideInGameWindow : undefined}
      />}
      <div className="flex min-h-0 flex-1">
        <NavigationSidebar label={GAME_CONFIG.appName} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t("map.markerStyle.icons.pin")} storageKey="app:navigation-pinned" items={navItems} footer={[...sidebarTools, { id: "settings", label: t("settings.title"), tour: "settings", active: page === "settings", onSelect: () => setPage("settings") }]} systemFooter={standaloneItems} />
        <section data-tour-frame data-app-window-page-content className="game-page-artwork relative min-w-0 flex-1 overflow-hidden bg-map-surface">
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          <div className={cn("h-full", page !== "map" && "hidden")} aria-hidden={page !== "map"} inert={page !== "map"}>
            <MapWorkspace
              active={page === "map"}
              structureSearchRequest={structureSearchRequest}
              onStructureSearchApplied={revision => setStructureSearchRequest(current =>
                current?.revision === revision ? null : current)}
              viewScope={surface === "desktop" ? "desktop" : "in-game"}
              controlsIntroVisible={controlsIntroVisible}
              createRequest={createRequest}
              onExploreSeeds={exploreSeeds}
              followLivePosition={surface === "desktop" && followLivePosition}
              onToggleFollowLivePosition={surface === "desktop"
                ? () => setFollowLivePosition((current) => !current)
                : undefined}
            />
          </div>
          {page === "guide" && <GameGuidePage guideKind={guideKind}
            onSearchStructureMap={knowledgeId => {
              setStructureSearchRequest({ revision: ++structureSearchRevision.current, knowledgeId });
              setPage("map");
            }}
            onGuideKindChange={setGuideKind} onClose={navigateToMap} />}
          {page === "journeys" && <JourneyHistoryPage />}
          {page === "seeds" && <SeedDiscoveryPage initialEdition={seedEditionFilter} preferredVersion={seedPreferredVersion}
            onCreateWorld={createFromSeed} />}
          {page === "settings" && <SettingsPage onNavigateMap={navigateToMap} />}
          {page === "account" && <AccountPage />}
          {page === "support" && <SupportPage />}
        </section>
        {/* Ads ride along with content surfaces. Settings and account are
            full-width surfaces; unmounting shuts the OwAd instances down so
            nothing keeps running behind a hidden rail. */}
        {(page === "map" || page === "journeys" || page === "guide" || page === "seeds" || page === "support") && <div className="app-window-ad-column"><OverwolfAdRail /></div>}
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
