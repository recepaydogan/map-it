import type { CSSProperties } from "react";
import { IS_MAP_IT_HOSTED, standaloneSidebarFooter } from "../../components/layout/navigation-host";
import { Bell, ChevronDown, CircleHelp, Map as MapIcon, Maximize, Minimize } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import WindowHeader from "../../components/layout/window-header";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import Tooltip from "../../components/tooltip";
import AccountPage from "../../features/account/account-overlay";
import ReferenceArchive from "../../features/reference/reference-archive";
import CraftingPage from "../../features/crafting/crafting-page";
import TalentCalculatorPage from "../../features/classes/talent-calculator-page";
import { REFERENCE_NAVIGATION_EVENT } from "../../features/reference/reference-navigation";
import type { ReferenceTarget } from "../../features/reference/reference-types";
import MapWorkspace from "../../features/map/map-workspace";
import { getDesktopMapFollow, subscribeDesktopMapFollow, toggleDesktopMapFollow } from "../../features/live-position/desktop-map-follow";
import type { MapFilterFocusRequest } from "../../features/map/map-config";
import type { MapMarkerTarget } from "../../features/map/types";
import { MAP_FOCUS_REQUEST_KEY, requestMapDestinationInMain, requestMapPointInMain } from "../../features/map/map-window-bridge";
import { DEFAULT_MAP_ID } from "../../features/map/map-registry";
import { WORLD_ATLAS_ARTWORK } from "../../features/map/world-atlas-artwork";
import { selectMap } from "../../features/map/use-selected-map";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import OnboardingTour from "../../features/onboarding/onboarding-tour";
import { useOnboardingActive } from "../../features/onboarding/use-onboarding";
import SettingsPage from "../../features/settings/settings-overlay";
import { useUpdateReadState } from "../../features/updates/use-update-read-state";
import { UPDATES_VERSION } from "../../features/updates/updates-release";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { getLanguageFlag } from "../../i18n/language-flags";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import UpdatesPage from "../../features/updates/updates-page";
import { useAutoOpenUpdates } from "../../features/updates/use-auto-open-updates";
import SupportPage from "../../features/support/support-page";
import FaqPage from "../../features/support/faq-page";
import FeedbackPrompt from "../../features/support/feedback-prompt";
import { cn } from "../../lib/cn";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { IS_OVERWOLF, IS_WEB } from "../../utils/platform";
import { setupGameLaunchMonitorSwitch } from "../../overwolf-utils/game-launch-monitor-switch";
import type { AnalyticsSurface } from "../../services/analytics/app-context";
import InGameAutoOpenBanner from "./in-game-auto-open-banner";
import { useMapFullscreen } from "./use-map-fullscreen";
import { CharacterSyncPrompt } from "../../features/character-sync/character-connection";
import { AuthProvider } from "../../state/auth-provider";
import {
  reportDashboardPageview,
  useAnalytics,
} from "../../state/use-analytics";
import { useSupportBadges, useSupportWatch } from "../../state/use-support";
import { GAME_CONFIG, REFERENCE_NAV_CATEGORIES, WEEKLY_MISSIONS_REFERENCE } from "../../game-config";
import PremiumPlansPanel from "../../features/subscriptions/premium-plans-panel";
import { SUBSCRIPTIONS_ENABLED, useSubscription, useSubscriptionLifecycle } from "../../features/subscriptions/subscription-runtime";

/** Top-level pages rendered inside the dashboard's non-ad content region. */
type DashboardPage = "crafting" | "map" | "database" | "talent-calculator" | "weekly-missions" | "account" | "settings" | "support" | "updates" | "faq";

type ReferenceHistoryEntry = { key: number; target: ReferenceTarget; initialTarget: ReferenceTarget; showBack: boolean };

/** Preserve the mounted view while updating the selected target used by back navigation. */
const navigateReferenceViews = (
  history: ReferenceHistoryEntry[], current: ReferenceTarget | null, target: ReferenceTarget, nextKey: () => number,
): ReferenceHistoryEntry[] => {
  const trail = current?.id
    ? [...history.slice(0, -1), { ...history[history.length - 1]!, target: current }]
    : [];
  const existing = trail.findIndex((entry) => entry.target.category === target.category && entry.target.id === target.id && entry.target.group === target.group);
  return existing >= 0 ? trail.slice(0, existing + 1) : [...trail, { key: nextKey(), target, initialTarget: target, showBack: Boolean(trail.length) }].slice(-32);
};

const TOP_NAV_ITEMS = ([
  "dungeons",
  ...REFERENCE_NAV_CATEGORIES.filter((category) => category !== "dungeons" && category !== "classes" && category !== "races"),
  "classes",
  "races",
] as const).flatMap((category) =>
  category === "items" ? [category, "talent-calculator"] as const : [category] as const);

const referencePage = (target: ReferenceTarget): DashboardPage =>
  target.category === WEEKLY_MISSIONS_REFERENCE.category && target.group === WEEKLY_MISSIONS_REFERENCE.group
    ? "weekly-missions" : "database";

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
    </AuthProvider>
  );
};

const previewRemoveAds = import.meta.env.DEV && IS_WEB
  && new URLSearchParams(window.location.search).get("preview") === "remove-ads";

const DashboardShell = ({ surface }: { surface: AnalyticsSurface }) => {
  const { t } = useTranslation();
  useSubscriptionLifecycle();
  const subscription = useSubscription();
  const adFree = SUBSCRIPTIONS_ENABLED && subscription.premium;
  const waitingForSubscription = SUBSCRIPTIONS_ENABLED && subscription.status === "loading";
  useSupportWatch();
  const [page, setPage] = useState<DashboardPage>("map");
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const onboardingActive = useOnboardingActive();
  const [tourNavigationItem, setTourNavigationItem] = useState<string | null>(null);
  const [tourFiltersOpen, setTourFiltersOpen] = useState(false);
  const canFullscreenMap = adFree && page === "map" && !onboardingActive;
  const mapFullscreen = useMapFullscreen(canFullscreenMap);
  const fullscreenLabel = t(mapFullscreen.active ? "map.controls.exitFullscreen" : "map.controls.enterFullscreen");
  const controlsToggleLabel = t(controlsExpanded ? "map.controls.hideControls" : "map.controls.showControls");
  const showRemoveAdsPreview = previewRemoveAds && page === "map";
  const [premiumPlansOpen, setPremiumPlansOpen] = useState(false);
  const openPremiumPlans = () => setPremiumPlansOpen(true);
  const closePremiumPlans = useCallback(() => setPremiumPlansOpen(false), []);
  const autoOpenUpdates = useCallback(() => setPage("updates"), []);
  useAutoOpenUpdates(page === "updates", autoOpenUpdates);
  const [talentClassId, setTalentClassId] = useState<string | undefined>();
  const [filterFocusRequest, setFilterFocusRequest] = useState<MapFilterFocusRequest | null>(null);
  const [mapReturn, setMapReturn] = useState<{
    page: "database" | "weekly-missions"; target: ReferenceTarget;
    destination: { mapId: string; pointId: string };
  } | null>(null);
  useEffect(() => {
    const showMap = (event: Event) => {
      if (event instanceof StorageEvent && (event.key !== MAP_FOCUS_REQUEST_KEY || !event.newValue)) return;
      if (page !== "map" && page !== "database" && page !== "weekly-missions") setMapReturn(null);
      setPage("map");
    };
    window.addEventListener(MAP_FOCUS_REQUEST_KEY, showMap);
    window.addEventListener("storage", showMap);
    return () => {
      window.removeEventListener(MAP_FOCUS_REQUEST_KEY, showMap);
      window.removeEventListener("storage", showMap);
    };
  }, [page]);
  const nextReferenceKey = useRef(0);
  const createReferenceEntry = useCallback((target: ReferenceTarget): ReferenceHistoryEntry => ({ key: ++nextReferenceKey.current, target, initialTarget: target, showBack: false }), []);
  const [referenceHistory, setReferenceHistory] = useState<ReferenceHistoryEntry[]>([{ key: 0, target: { category: "items", id: "" }, initialTarget: { category: "items", id: "" }, showBack: false }]);
  const referenceTarget = referenceHistory[referenceHistory.length - 1]!.target;
  const currentReference = useRef<ReferenceTarget | null>(null);
  const selectedMarker = useRef<MapMarkerTarget | null>(null);
  const [returnMarker, setReturnMarker] = useState<MapMarkerTarget | null>(null);
  const handleSelectedMarker = useCallback((marker: MapMarkerTarget | null) => {
    selectedMarker.current = marker;
  }, []);
  const handleCurrentReference = useCallback((target: ReferenceTarget) => {
    currentReference.current = target;
  }, []);
  const previousReference = referenceHistory[referenceHistory.length - 1]?.showBack ? referenceHistory[referenceHistory.length - 2]?.target : undefined;
  useEffect(() => {
    const navigate = (event: Event) => {
      const target = (event as CustomEvent<ReferenceTarget>).detail;
      const source = page === "database" || page === "weekly-missions" ? currentReference.current : null;
      if (page !== "database" && page !== "weekly-missions") {
        setMapReturn(null);
        setReturnMarker(page === "map" ? selectedMarker.current : null);
      }
      setReferenceHistory((history) => navigateReferenceViews(history, source, target, () => ++nextReferenceKey.current));
      currentReference.current = target;
      setPage(referencePage(target));
    };
    window.addEventListener(REFERENCE_NAVIGATION_EVENT, navigate);
    return () => window.removeEventListener(REFERENCE_NAVIGATION_EVENT, navigate);
  }, [page]);
  const handleReferenceBack = () => {
    if (previousReference) {
      currentReference.current = previousReference;
      setReferenceHistory((history) => history.slice(0, -1));
      setPage(referencePage(previousReference));
    } else if (returnMarker) {
      requestMapPointInMain(returnMarker.markerId, returnMarker.mapId);
      setPage("map");
      setReturnMarker(null);
    }
  };
  const [followLivePosition, setFollowLivePosition] = useState(false);
  const desktopMapFollow = useSyncExternalStore(subscribeDesktopMapFollow, getDesktopMapFollow);
  const isDesktopWindow = IS_OVERWOLF && surface === "desktop";
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

  const navigateToMap = useCallback(() => { setMapReturn(null); setMapPickerOpen(false); selectMap(DEFAULT_MAP_ID); setPage("map"); }, [setMapReturn]);
  const navigateToMapFilter = useCallback((categoryId: string) => {
    navigateToMap();
    setFilterFocusRequest((current) => ({ categoryId, requestId: (current?.requestId ?? 0) + 1 }));
  }, [navigateToMap]);
  const openUpdatesPage = () => {
    setMapPickerOpen(false);
    setPage("updates");
  };
  const navigateToUpdateMapPicker = () => {
    setMapReturn(null);
    setControlsExpanded(true);
    setMapPickerOpen(true);
    setPage("map");
  };
  const navigateToUpdateMarker = (markerId: string) => {
    requestMapPointInMain(markerId, "azeroth");
    setPage("map");
  };
  const navigateToUpdateCalculator = (classId: string) => {
    setTalentClassId(classId);
    setPage("talent-calculator");
  };
  const openReferenceCategory = (category: string) => {
    const current = currentReference.current;
    const trail = current?.id
      ? [...referenceHistory.slice(0, -1), { ...referenceHistory[referenceHistory.length - 1]!, target: current }]
      : referenceHistory;
    let existing = -1;
    for (let index = trail.length - 1; index >= 0; index--) {
      if (trail[index]?.target.category === category) { existing = index; break; }
    }
    const next = existing >= 0 ? trail.slice(0, existing + 1) : [...trail, createReferenceEntry({ category, id: "" })].slice(-32);
    setReferenceHistory(next);
    currentReference.current = existing >= 0 ? next[next.length - 1]!.target : null;
    setReturnMarker(null);
    setMapReturn(null);
    setPage("database");
  };
  const navItems: SidebarItem[] = [
    { id: "map", label: t("chrome.map"), active: page === "map", onSelect: navigateToMap, icon: <MapIcon size={15} aria-hidden="true" /> },
    ...TOP_NAV_ITEMS.map((category): SidebarItem => category === "talent-calculator"
      ? {
          id: category,
          label: t("classes.calculator.nav"),
          tour: "nav-talent-calculator",
          active: page === "talent-calculator",
          onSelect: () => { setReturnMarker(null); setMapReturn(null); setTalentClassId(undefined); setPage("talent-calculator"); },
        }
      : {
          id: category,
          label: t(`reference.categories.${category}`),
          active: page === "database" && referenceTarget.category === category,
          onSelect: () => openReferenceCategory(category),
          tour: `nav-${category}`,
        }),
  ];
  navItems.splice(navItems.findIndex(item => item.id === "professions") + 1, 0, {
    id: "crafting", label: t("crafting.title"), active: page === "crafting",
    onSelect: () => { setMapReturn(null); setReturnMarker(null); setPage("crafting"); },
  });

  const { unread: updatesUnread } = useUpdateReadState(UPDATES_VERSION);
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const language = useAppLanguage();
  const footerItems: SidebarItem[] = [
    { id: "language", tour: "language", label: t("settings.language"), icon: <img src={getLanguageFlag(language) ?? getLanguageFlag("en")} alt="" />,
      subItems: APP_LANGUAGES.map(({ code, name }) => ({
        id: code, label: name, icon: <img src={getLanguageFlag(code)} alt="" />, active: language === code,
        onSelect: () => setAppLanguage(code),
      })) },
    { id: "updates", tour: "updates", label: t("updates.title"),
      icon: <Bell size={17} />, active: page === "updates", onSelect: openUpdatesPage,
      indicator: updatesUnread ? <span className="app-navigation-dot" /> : undefined },
    { id: "settings", tour: "settings", label: t("settings.title"), active: page === "settings", onSelect: () => setPage("settings") },
    { id: "faq", label: t("faq.title"), icon: <CircleHelp size={17} />, active: page === "faq", onSelect: () => setPage("faq") },
  ];

  const standaloneItems = standaloneSidebarFooter(
    { label: t("support.title"), active: page === "support", onSelect: () => setPage("support"),
      indicator: unreadReplies + (isAdmin ? inboxPending : 0) > 0 ? <span className="app-navigation-dot" /> : undefined },
    { label: t("account.open"), active: page === "account", onSelect: () => setPage("account") },
  );


  return (
    <main className="app-dashboard-window relative flex h-screen w-screen flex-col overflow-hidden bg-background text-white">
      {IS_OVERWOLF && !mapFullscreen.active && <WindowHeader standaloneDashboard={!IS_MAP_IT_HOSTED}
        adFree={adFree}
        onHome={navigateToMap}
      />}
      <div className="dashboard-page-backdrop flex min-h-0 flex-1" data-map-page={page === "map" ? "" : undefined}
        style={{ "--game-page-image": 'url("' + WORLD_ATLAS_ARTWORK + '")' } as CSSProperties}>
        {!mapFullscreen.active && <NavigationSidebar label={GAME_CONFIG.appName} pinLabel={t("map.markerStyle.icons.pin")}
          brandIcon={<img src="/icon.png" alt="" draggable={false} />} storageKey="app:navigation-pinned"
          items={navItems} footer={footerItems} systemFooter={standaloneItems}
          highlightedItemId={tourNavigationItem} />}
        <div className={cn("flex min-h-0 min-w-0 flex-1", showRemoveAdsPreview && "flex-col sm:flex-row")}>
        <section data-tour-frame data-app-window-page-content={page !== "map" ? "" : undefined} className="game-page-artwork relative min-w-0 flex-1 overflow-hidden bg-map-surface">
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          {page === "map" && !onboardingActive && !mapFullscreen.active && (
            <button type="button"
              className="absolute top-2 left-1/2 z-[1410] grid size-[30px] -translate-x-1/2 cursor-pointer place-items-center rounded-[var(--radius-full)] border border-white/25 bg-background text-white/90 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-controls="map-toolbar map-lower-controls"
              aria-expanded={controlsExpanded}
              aria-label={controlsToggleLabel}
              title={controlsToggleLabel}
              onClick={() => { setMapPickerOpen(false); setControlsExpanded(current => !current); }}
            >
              <ChevronDown size={16} className={cn("transition-transform duration-300", !controlsExpanded && "rotate-180")} aria-hidden="true" />
            </button>
          )}
          <div className={cn("flex h-full min-h-0 flex-col", page !== "map" && "hidden")} aria-hidden={page !== "map"} inert={page !== "map"}>
            <div className="relative min-h-0 flex-1">
            <MapWorkspace
              active={page === "map"}
              filterFocusRequest={filterFocusRequest}
              mapPickerOpen={page === "map" && mapPickerOpen}
              onMapPickerOpenChange={setMapPickerOpen}
              onSelectedMarkerChange={handleSelectedMarker}
              onReturnToPanel={mapReturn ? () => {
                currentReference.current = mapReturn.target;
                setReferenceHistory((history) => [...history.slice(0, -1), { ...history[history.length - 1]!, target: mapReturn.target }]);
                setMapReturn(null);
                setPage(mapReturn.page);
              } : undefined}
              returnDestination={mapReturn?.destination}
              controlsIntroVisible={controlsIntroVisible}
              controlsExpanded={controlsExpanded || onboardingActive}
              showOnboardingFilters={tourFiltersOpen}
              onControlsExpandedChange={setControlsExpanded}
              followLivePosition={isDesktopWindow ? desktopMapFollow : followLivePosition}
              onToggleFollowLivePosition={isDesktopWindow ? toggleDesktopMapFollow : () => setFollowLivePosition((current) => !current)}
              fullscreenControl={canFullscreenMap && (
                <Tooltip label={fullscreenLabel} side="left" contentClassName="marker-tooltip-content">
                  <button type="button" onClick={mapFullscreen.toggle} aria-label={fullscreenLabel} className="map-bottom-pin">
                    {mapFullscreen.active ? <Minimize size={17} aria-hidden="true" /> : <Maximize size={17} aria-hidden="true" />}
                  </button>
                </Tooltip>
              )}
            />
            </div>
          </div>
          {page === "crafting" && <CraftingPage />}
          {page === "settings" && <SettingsPage onNavigateMap={navigateToMap} onViewPlans={openPremiumPlans} />}
          {page === "support" && <SupportPage />}
          {page === "faq" && <FaqPage />}
          {page === "updates" && <div className="absolute inset-0">
            <UpdatesPage onNavigateMap={navigateToMap} onNavigateMapFilter={navigateToMapFilter}
              onNavigateMapPicker={navigateToUpdateMapPicker} onNavigateSettingsAppearance={() => setPage("settings")}
              onNavigateCrafting={() => { setMapReturn(null); setReturnMarker(null); setPage("crafting"); }}
              onNavigateSupport={() => setPage("support")}
              onNavigateMapPoint={navigateToUpdateMarker} onNavigateTalentCalculator={navigateToUpdateCalculator} />
          </div>}
          {page === "account" && <AccountPage onNavigateMap={navigateToMap} onViewPlans={openPremiumPlans} />}
          {page === "talent-calculator" && <TalentCalculatorPage initialClassId={talentClassId} />}
          {referenceHistory.map((entry, index) => {
            const active = (page === "database" || page === "weekly-missions") && index === referenceHistory.length - 1;
            return <div key={entry.key} className={cn("absolute inset-0", !active && "hidden")} aria-hidden={!active} inert={!active}>
              <ReferenceArchive
                target={entry.initialTarget}
                title={referencePage(entry.initialTarget) === "weekly-missions" ? t("weeklyMissions.title") : undefined}
                onCurrentChange={active ? handleCurrentReference : undefined}
                backLabel={active ? previousReference?.name ?? returnMarker?.name : undefined}
                onBack={active && (previousReference || returnMarker) ? handleReferenceBack : undefined}
                onOpenMap={(mapId, markerId) => {
                  if (!active) return;
                  setMapReturn({
                    page: page === "weekly-missions" ? "weekly-missions" : "database",
                    target: currentReference.current ?? referenceTarget,
                    destination: { mapId, pointId: markerId },
                  });
                  if (markerId) requestMapPointInMain(markerId, mapId);
                  else requestMapDestinationInMain(mapId);
                  setPage("map");
                }}
              />
            </div>;
          })}
          {!mapFullscreen.active && surface === "in_game" && <InGameAutoOpenBanner />}
          {!mapFullscreen.active && page === "map" && <FeedbackPrompt
            onOpenFeedback={() => setPage("support")}
            onOpenSettings={() => setPage("settings")}
            onOpenPackages={previewRemoveAds || (SUBSCRIPTIONS_ENABLED && !adFree && !waitingForSubscription) ? openPremiumPlans : undefined}
          />}
          {(page === "database" || page === "crafting") && <CharacterSyncPrompt />}
          {!mapFullscreen.active && premiumPlansOpen && (
            <PremiumPlansPanel preview={previewRemoveAds} onClose={closePremiumPlans} />
          )}
        </section>
        {showRemoveAdsPreview && <OverwolfAdRail preview onRemoveAds={openPremiumPlans} />}
        {/* Keep the same ad instances mounted across map, database and support navigation.
            Settings and account remain full-width surfaces; unmounting shuts
            the ads down so nothing runs behind a hidden rail. */}
        {!IS_WEB && !adFree && !waitingForSubscription && (page === "map" || page === "database" || page === "crafting" || page === "talent-calculator" || page === "weekly-missions" || page === "support" || page === "updates" || page === "faq") && (
          <div className="app-window-ad-column"><OverwolfAdRail onRemoveAds={SUBSCRIPTIONS_ENABLED ? openPremiumPlans : undefined} /></div>
        )}
        </div>
      </div>
      <OnboardingTour
        mapActive={page === "map"}
        onNavigateMap={navigateToMap}
        onNavigationHighlightChange={setTourNavigationItem}
        onFilterStepChange={setTourFiltersOpen}
        autoStart={surface === "desktop"}
      />
    </main>
  );
};

export default DashboardWindow;
