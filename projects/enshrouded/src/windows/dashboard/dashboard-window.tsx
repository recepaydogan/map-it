import { GAME_CONFIG } from "../../game-config";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import { getLanguageFlag } from "../../i18n/language-flags";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { IS_OVERWOLF } from "../../utils/platform";
import { IS_MAP_IT_HOSTED, sidebarLanguage, standaloneSidebarFooter } from "../../components/layout/navigation-host";
import { Map as MapIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { getDesktopMapFollow, subscribeDesktopMapFollow, toggleDesktopMapFollow } from "../../features/live-position/desktop-map-follow";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import WindowHeader from "../../components/layout/window-header";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import AccountPage from "../../features/account/account-overlay";
import ReferenceArchive from "../../features/reference/reference-archive";
import TalentCalculatorPage from "../../features/classes/talent-calculator-page";
import { REFERENCE_NAVIGATION_EVENT } from "../../features/reference/reference-navigation";
import type { ReferenceTarget } from "../../features/reference/reference-types";
import MapWorkspace from "../../features/map/map-workspace";
import { BUILDING_NAVIGATION_EVENT } from "../../features/knowledge/building-navigation";
import { CRAFTING_NAVIGATION_EVENT } from "../../features/crafting/crafting-navigation";
import { WIKI_NAVIGATION_EVENT, wikiCatalogForPage } from "../../features/knowledge/wiki-navigation";
import { PROGRESSION_CATALOGS, PROGRESSION_NAVIGATION_EVENT, progressionCatalogForPage,
  type ProgressionCatalog } from "../../features/knowledge/progression-navigation";
import type { GuideItemTarget } from "../../features/knowledge/items-guide-catalog";
import type { MapFilterFocusRequest } from "../../features/map/map-config";
import type { MapMarkerTarget } from "../../features/map/types";
import { MAP_FOCUS_REQUEST_KEY, requestMapDestinationInMain, requestMapPointInMain } from "../../features/map/map-window-bridge";
import { DEFAULT_MAP_ID } from "../../features/map/map-registry";
import { selectMap } from "../../features/map/use-selected-map";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import OnboardingTour, { type TourMapStep } from "../../features/onboarding/onboarding-tour";
import SettingsPage from "../../features/settings/settings-overlay";
import UpdatesPage from "../../features/updates/updates-page";
import SupportPage from "../../features/support/support-page";
import { cn } from "../../lib/cn";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { setupGameLaunchMonitorSwitch } from "../../overwolf-utils/game-launch-monitor-switch";
import type { AnalyticsSurface } from "../../services/analytics/app-context";
import InGameAutoOpenBanner from "./in-game-auto-open-banner";
import { AuthProvider } from "../../state/auth-provider";
import {
  reportDashboardPageview,
  useAnalytics,
} from "../../state/use-analytics";
import { useSupportBadges, useSupportWatch } from "../../state/use-support";
import { REFERENCE_NAV_CATEGORIES, WEEKLY_MISSIONS_REFERENCE } from "../../game-config";
import "./enshrouded-page.css";

/** Top-level pages rendered inside the dashboard's non-ad content region. */
const ItemsGuideCatalog = lazy(() => import("../../features/knowledge/items-guide-catalog"));
const EnshroudedCraftingPage = lazy(() => import("../../features/crafting/enshrouded-crafting-page"));
const GameplayGuidePage = lazy(() => import("../../features/knowledge/gameplay-guide-page"));
const ProgressionGuidePage = lazy(() => import("../../features/knowledge/progression-guide-page"));
type DashboardPage = "map" | "building" | "crafting" | "farming" | "fishing" | ProgressionCatalog | "database" | "talent-calculator" | "weekly-missions" | "account" | "settings" | "support" | "updates";
const isProgressionPage = (page: DashboardPage): page is ProgressionCatalog =>
  PROGRESSION_CATALOGS.some((catalog) => catalog === page);

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

const TOP_NAV_ITEMS = REFERENCE_NAV_CATEGORIES.filter((category) => category !== "dungeons").flatMap((category) =>
  category === "guides" ? ["talent-calculator", category] as const : [category] as const);

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

const DashboardShell = ({ surface }: { surface: AnalyticsSurface }) => {
  const { t } = useTranslation();
  useSupportWatch();
  const [page, setPage] = useState<DashboardPage>("map");
  const [selectedGuideItem, setSelectedGuideItem] = useState<GuideItemTarget | null>(null);
  const [itemsViewKey, setItemsViewKey] = useState(0);
  const [craftingInitialPage, setCraftingInitialPage] = useState<string | null>(null);
  const [progressionInitialPage, setProgressionInitialPage] = useState<string | null>(null);
  const [progressionViewKey, setProgressionViewKey] = useState(0);
  useEffect(() => {
    const openBuilding = (event: Event) => {
      setSelectedGuideItem({ category: "building", id: (event as CustomEvent<string>).detail });
      setPage("building");
    };
    window.addEventListener(BUILDING_NAVIGATION_EVENT, openBuilding);
    return () => window.removeEventListener(BUILDING_NAVIGATION_EVENT, openBuilding);
  }, []);
  useEffect(() => {
    const openCrafting = (event: Event) => {
      setCraftingInitialPage((event as CustomEvent<string>).detail);
      setPage("crafting");
    };
    window.addEventListener(CRAFTING_NAVIGATION_EVENT, openCrafting);
    return () => window.removeEventListener(CRAFTING_NAVIGATION_EVENT, openCrafting);
  }, []);
  useEffect(() => {
    const openWiki = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      const catalog = wikiCatalogForPage(target);
      if (!catalog) return;
      setSelectedGuideItem({ category: catalog, id: target });
      setPage("building");
    };
    window.addEventListener(WIKI_NAVIGATION_EVENT, openWiki);
    return () => window.removeEventListener(WIKI_NAVIGATION_EVENT, openWiki);
  }, []);
  useEffect(() => {
    const openProgression = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      const catalog = progressionCatalogForPage(target);
      if (!catalog) return;
      setProgressionInitialPage(target);
      setProgressionViewKey((key) => key + 1);
      setPage(catalog);
    };
    window.addEventListener(PROGRESSION_NAVIGATION_EVENT, openProgression);
    return () => window.removeEventListener(PROGRESSION_NAVIGATION_EVENT, openProgression);
  }, []);
  const [filterFocusRequest, setFilterFocusRequest] = useState<MapFilterFocusRequest | null>(null);
  const [tourMapStep, setTourMapStep] = useState<TourMapStep>(null);
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
  const desktopMapFollow = useSyncExternalStore(subscribeDesktopMapFollow, getDesktopMapFollow);
  const [webMapFollow, setWebMapFollow] = useState(false);
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

  const navigateToMap = useCallback(() => { setMapReturn(null); selectMap(DEFAULT_MAP_ID); setPage("map"); }, [setMapReturn]);
  const navigateToMapFilter = useCallback((categoryId: string) => {
    navigateToMap();
    setFilterFocusRequest((current) => ({ categoryId, requestId: (current?.requestId ?? 0) + 1 }));
  }, [navigateToMap]);
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
  const resetItemsView = useCallback(() => {
    setSelectedGuideItem(null);
    setItemsViewKey((key) => key + 1);
  }, []);

  const navItems: SidebarItem[] = [
    { id: "map", label: t("chrome.map"), active: page === "map", onSelect: navigateToMap, icon: <MapIcon size={15} aria-hidden="true" /> },
    { id: "items", label: t("itemsGuide.nav"), active: page === "building",
      onSelect: () => { resetItemsView(); setPage("building"); } },
    { id: "crafting", label: t("craftingGuide.nav"), active: page === "crafting",
      onSelect: () => { setCraftingInitialPage(null); setPage("crafting"); } },
    ...(["farming", "fishing"] as const).map((section): SidebarItem => ({
      id: section, label: t(`gameplayGuide.${section}`), active: page === section,
      onSelect: () => setPage(section),
      tour: `nav-${section}`,
    })),
    ...PROGRESSION_CATALOGS.map((catalog): SidebarItem => ({
      id: catalog, label: t(`progressionGuide.catalogs.${catalog}`), active: page === catalog,
      onSelect: () => { setProgressionInitialPage(null); setProgressionViewKey((key) => key + 1); setPage(catalog); },
    })),
    ...TOP_NAV_ITEMS.map((category): SidebarItem => category === "talent-calculator"
      ? {
          id: category,
          label: t("classes.calculator.nav"),
          active: page === "talent-calculator",
          onSelect: () => { setReturnMarker(null); setMapReturn(null); setPage("talent-calculator"); },
        }
      : {
          id: category,
          label: t(`reference.categories.${category}`),
          active: page === "database" && referenceTarget.category === category,
          onSelect: () => openReferenceCategory(category),
          tour: `nav-${category}`,
        }),
  ];

  const language = useAppLanguage();
  const sidebarTools: SidebarItem[] = [
    sidebarLanguage(t("settings.language"), language, APP_LANGUAGES.map(({ code, name }) => ({
      id: code, label: name, icon: <img src={getLanguageFlag(code)} alt="" />,
    })), setAppLanguage),
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
        <NavigationSidebar label={GAME_CONFIG.appName} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t("map.markerStyle.icons.pin")} storageKey="app:navigation-pinned" items={navItems} footer={[...sidebarTools, { id: "settings", label: t("settings.title"), active: page === "settings", onSelect: () => setPage("settings") }]} systemFooter={standaloneItems} />
        <section data-tour-frame data-app-window-page-content className="game-page-artwork relative min-w-0 flex-1 overflow-hidden bg-map-surface">
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          <div className={cn("h-full", page !== "map" && "hidden")} aria-hidden={page !== "map"} inert={page !== "map"}>
            <MapWorkspace
              active={page === "map"}
              tourMapStep={tourMapStep}
              filterFocusRequest={filterFocusRequest}
              onSelectedMarkerChange={handleSelectedMarker}
              onReturnToPanel={mapReturn ? () => {
                currentReference.current = mapReturn.target;
                setReferenceHistory((history) => [...history.slice(0, -1), { ...history[history.length - 1]!, target: mapReturn.target }]);
                setMapReturn(null);
                setPage(mapReturn.page);
              } : undefined}
              returnDestination={mapReturn?.destination}
              controlsIntroVisible={controlsIntroVisible}
              followLivePosition={surface === "desktop" && (IS_OVERWOLF ? desktopMapFollow : webMapFollow)}
              onToggleFollowLivePosition={surface === "desktop"
                ? IS_OVERWOLF ? toggleDesktopMapFollow : () => setWebMapFollow((current) => !current)
                : undefined}
            />
          </div>
          {page === "settings" && <SettingsPage onNavigateMap={navigateToMap} />}
          {page === "support" && <SupportPage />}
          {page === "updates" && <UpdatesPage onNavigateMap={navigateToMap} onNavigateMapFilter={navigateToMapFilter} onNavigateSettingsAppearance={() => setPage("settings")} />}
          {page === "account" && <AccountPage onNavigateMap={navigateToMap} />}
          {page === "building" && <Suspense fallback={<div className="grid h-full place-items-center text-sm text-zinc-400">{t("buildingGuide.loading")}</div>}><ItemsGuideCatalog key={itemsViewKey}
            selected={selectedGuideItem} onSelectItem={setSelectedGuideItem}
            onOpenMap={(markerId) => {
              if (markerId) requestMapPointInMain(markerId, DEFAULT_MAP_ID);
              setPage("map");
            }} /></Suspense>}
          {page === "crafting" && <Suspense fallback={<div className="grid h-full place-items-center text-sm text-zinc-400">{t("craftingGuide.loading")}</div>}>
            <EnshroudedCraftingPage key={craftingInitialPage ?? "crafting"} initialPage={craftingInitialPage} />
          </Suspense>}
          {(page === "farming" || page === "fishing") && <Suspense fallback={<div className="grid h-full place-items-center text-sm text-zinc-400">{t("gameplayGuide.loading")}</div>}>
            <GameplayGuidePage key={page} section={page} />
          </Suspense>}
          {isProgressionPage(page) && <Suspense fallback={<div className="grid h-full place-items-center text-sm text-zinc-400">{t("progressionGuide.loading")}</div>}>
            <ProgressionGuidePage key={progressionViewKey} catalog={page}
              onCatalogChange={setPage} initialPage={progressionInitialPage}
              onOpenMap={(markerId) => {
                if (markerId) requestMapPointInMain(markerId, DEFAULT_MAP_ID);
                setPage("map");
              }} />
          </Suspense>}
          {page === "talent-calculator" && <TalentCalculatorPage />}
          {(page === "database" || page === "weekly-missions") && referenceHistory.map((entry, index) => {
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
          {surface === "in_game" && <InGameAutoOpenBanner />}
        </section>
        {/* Keep the same ad instances mounted across map, database and support navigation.
            Settings and account remain full-width surfaces; unmounting shuts
            the ads down so nothing runs behind a hidden rail. */}
        {(page === "map" || page === "building" || page === "crafting" || page === "farming" || page === "fishing" || isProgressionPage(page) || page === "database" || page === "talent-calculator" || page === "weekly-missions" || page === "support" || page === "updates") && <div className="app-window-ad-column"><OverwolfAdRail /></div>}
      </div>
      {/* Fixed overlay — its dim layer is clipped to the map section above, so it
          never shades the ad rail or the window header. */}
      <OnboardingTour
        mapActive={page === "map"}
        onNavigateMap={navigateToMap}
        onMapStepChange={setTourMapStep}
        autoStart={surface === "desktop"}
      />
    </main>
  );
};


export default DashboardWindow;
