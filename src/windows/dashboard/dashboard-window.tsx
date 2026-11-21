import { ArrowLeft, Map as MapIcon, Settings, UserRound } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import WindowHeader from "../../components/layout/window-header";
import AppLanguagePicker from "../../components/layout/app-language-picker";
import HeaderNavigation, { type HeaderNavigationItem } from "../../components/layout/header-navigation";
import HeaderSupportControl from "../../components/layout/header-support-control";
import Tooltip from "../../components/tooltip";
import AccountPage from "../../features/account/account-overlay";
import ReferenceArchive from "../../features/reference/reference-archive";
import TalentCalculatorPage from "../../features/classes/talent-calculator-page";
import { REFERENCE_NAVIGATION_EVENT } from "../../features/reference/reference-navigation";
import type { ReferenceTarget } from "../../features/reference/reference-types";
import MapWorkspace from "../../features/map/map-workspace";
import type { MapFilterFocusRequest } from "../../features/map/map-config";
import type { MapMarkerTarget } from "../../features/map/types";
import { MAP_FOCUS_REQUEST_KEY, requestMapDestinationInMain, requestMapPointInMain } from "../../features/map/map-window-bridge";
import { DEFAULT_MAP_ID } from "../../features/map/map-registry";
import { selectMap } from "../../features/map/use-selected-map";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import OnboardingTour, { type TourSurface } from "../../features/onboarding/onboarding-tour";
import SettingsPage from "../../features/settings/settings-overlay";
import UpdatesControl from "../../features/updates/updates-control";
import UpdatesPage from "../../features/updates/updates-page";
import SupportPage from "../../features/support/support-page";
import { cn } from "../../lib/cn";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { setupGameLaunchMonitorSwitch } from "../../overwolf-utils/game-launch-monitor-switch";
import type { AnalyticsSurface } from "../../services/analytics/app-context";
import InGameAutoOpenBanner from "./in-game-auto-open-banner";
import LaunchSupportBanner from "./launch-support-banner";
import { AuthProvider } from "../../state/auth-provider";
import {
  reportDashboardPageview,
  useAnalytics,
} from "../../state/use-analytics";
import { useAuth } from "../../state/use-auth";
import { useSupportWatch } from "../../state/use-support";
import { REFERENCE_NAV_CATEGORIES, WEEKLY_MISSIONS_REFERENCE } from "../../game-config";

/** Top-level pages rendered inside the dashboard's non-ad content region. */
type DashboardPage = "map" | "database" | "talent-calculator" | "weekly-missions" | "account" | "settings" | "support" | "updates";

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
  const [returnToUpdates, setReturnToUpdates] = useState(false);
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
      if (page === "updates") setReturnToUpdates(true);
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
    } else if (returnToUpdates) {
      setPage("updates");
      setReturnToUpdates(false);
    } else if (returnMarker) {
      requestMapPointInMain(returnMarker.markerId, returnMarker.mapId);
      setPage("map");
      setReturnMarker(null);
    }
  };
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

  const navigateToMap = useCallback(() => { setMapReturn(null); selectMap(DEFAULT_MAP_ID); setPage("map"); }, [setMapReturn]);
  const navigateToMapFilter = useCallback((categoryId: string) => {
    navigateToMap();
    setFilterFocusRequest((current) => ({ categoryId, requestId: (current?.requestId ?? 0) + 1 }));
  }, [navigateToMap]);
  const returnToUpdatesPage = () => {
    setPage("updates");
    setReturnToUpdates(false);
  };
  const navigateToUpdateMarker = (markerId: string) => {
    setReturnToUpdates(true);
    requestMapPointInMain(markerId, DEFAULT_MAP_ID);
    setPage("map");
  };
  const navigateToUpdateCalculator = (classId: string) => {
    setReturnToUpdates(true);
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
  const tourSurface: TourSurface | null = page === "map" || page === "talent-calculator" || page === "updates" || page === "settings" || page === "support"
    ? page : page === "database" && REFERENCE_NAV_CATEGORIES.some((category) => category !== "dungeons" && category === referenceTarget.category)
      ? referenceTarget.category as TourSurface : null;
  const handleTourSurfaceChange = useCallback((next: TourSurface) => {
    setReturnToUpdates(false);
    if (next !== "map" && next !== "talent-calculator" && next !== "updates" && next !== "settings" && next !== "support") {
      setReferenceHistory([createReferenceEntry({ category: next, id: "" })]);
      currentReference.current = null;
      setReturnMarker(null);
      setMapReturn(null);
      setPage("database");
    } else {
      setPage(next);
    }
  }, [createReferenceEntry]);

  const navItems: HeaderNavigationItem[] = [
    { id: "map", tour: "nav-map", label: t("chrome.map"), active: page === "map", onSelect: navigateToMap, icon: <MapIcon size={15} aria-hidden="true" /> },
    ...TOP_NAV_ITEMS.map((category): HeaderNavigationItem => category === "talent-calculator"
      ? {
          id: category,
          label: t("classes.calculator.nav"),
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
  const nav = <HeaderNavigation items={navItems} />;

  const controls = (
    <>
      <HeaderSupportControl active={page === "support"} onNavigate={() => setPage("support")} />
      {returnToUpdates && page !== "updates" ? <button type="button" data-ow-no-drag onClick={returnToUpdatesPage}
        className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 text-[12.5px] font-medium text-[var(--gold-bright)] transition-colors hover:bg-white/8 hover:text-white focus-visible:outline-2 focus-visible:outline-accent">
        <ArrowLeft size={15} aria-hidden="true" />{t("updates.return")}
      </button> : <UpdatesControl active={page === "updates"} onNavigate={returnToUpdatesPage} />}
      <AppLanguagePicker />
      <Tooltip label={t("settings.title")} side="bottom">
        <button
          type="button"
          data-tour="settings"
          onClick={() => setPage("settings")}
          aria-label={t("settings.title")}
          aria-current={page === "settings" ? "page" : undefined}
          className={cn(
            "grid h-10 w-10 cursor-pointer place-items-center transition-colors",
            page === "settings"
              ? "bg-accent-soft text-accent"
              : "text-white/75 hover:bg-white/8 hover:text-white",
          )}
        >
          <Settings size={16} aria-hidden="true" />
        </button>
      </Tooltip>
      <AccountControl active={page === "account"} onNavigate={() => setPage("account")} />
    </>
  );

  return (
    <main className="flex h-screen w-screen flex-col overflow-hidden bg-background text-white">
      <WindowHeader
        nav={nav}
        controls={controls}
        onHome={navigateToMap}
        toggleHotkeyName={surface === "in_game" ? "toggle_app" : "toggle_desktop_app"}
      />
      <div className="flex min-h-0 flex-1">
        <section data-tour-frame className="relative min-w-0 flex-1 overflow-hidden bg-map-surface">
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          <div className={cn("flex h-full min-h-0 flex-col", page !== "map" && "hidden")} aria-hidden={page !== "map"} inert={page !== "map"}>
            <div className="relative min-h-0 flex-1">
            <MapWorkspace
              active={page === "map"}
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
              followLivePosition={followLivePosition}
              onToggleFollowLivePosition={() => setFollowLivePosition((current) => !current)}
            />
            </div>
          </div>
          {page === "settings" && <SettingsPage onNavigateMap={navigateToMap} />}
          {page === "support" && <SupportPage />}
          {(page === "updates" || returnToUpdates) && <div className={cn("absolute inset-0", page !== "updates" && "hidden")} aria-hidden={page !== "updates"} inert={page !== "updates"}>
            <UpdatesPage active={page === "updates"} onNavigateMap={navigateToMap} onNavigateMapFilter={(categoryId) => {
              setReturnToUpdates(true);
              navigateToMapFilter(categoryId);
            }} onNavigateSettingsAppearance={() => { setReturnToUpdates(true); setPage("settings"); }}
              onNavigateMapPoint={navigateToUpdateMarker} onNavigateTalentCalculator={navigateToUpdateCalculator} />
          </div>}
          {page === "account" && <AccountPage />}
          {page === "talent-calculator" && <TalentCalculatorPage initialClassId={talentClassId} />}
          {(page === "database" || page === "weekly-missions" || mapReturn !== null) && referenceHistory.map((entry, index) => {
            const active = (page === "database" || page === "weekly-missions") && index === referenceHistory.length - 1;
            return <div key={entry.key} className={cn("absolute inset-0", !active && "hidden")} aria-hidden={!active} inert={!active}>
              <ReferenceArchive
                target={entry.initialTarget}
                title={referencePage(entry.initialTarget) === "weekly-missions" ? t("weeklyMissions.title") : undefined}
                onCurrentChange={active ? handleCurrentReference : undefined}
                backLabel={active ? previousReference?.name ?? (returnToUpdates ? t("updates.title") : returnMarker?.name) : undefined}
                onBack={active && (previousReference || returnToUpdates || returnMarker) ? handleReferenceBack : undefined}
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
          {surface === "desktop" && <LaunchSupportBanner raised={page === "map" && mapReturn !== null} />}
        </section>
        {/* Keep the same ad instances mounted across map, database and support navigation.
            Settings and account remain full-width surfaces; unmounting shuts
            the ads down so nothing runs behind a hidden rail. */}
        {(page === "map" || page === "database" || page === "talent-calculator" || page === "weekly-missions" || page === "support" || page === "updates") && <OverwolfAdRail />}
      </div>
      {/* Fixed overlay — its dim layer is clipped to the map section above, so it
          never shades the ad rail or the window header. */}
      <OnboardingTour
        surface={tourSurface}
        onSurfaceChange={handleTourSurfaceChange}
        autoStart={surface === "desktop"}
      />
    </main>
  );
};

/**
 * Header entry to the account surface. Once signed in the tooltip carries the
 * display name, so the header answers "who am I?" without opening anything.
 * It stays put when Supabase isn't configured rather than vanishing: the page
 * says why accounts are unavailable, which is what someone mid-setup needs.
 */
const AccountControl = ({
  active,
  onNavigate,
}: {
  active: boolean;
  onNavigate: () => void;
}) => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const label = user ? user.displayName : t("account.open");

  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        onClick={onNavigate}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "grid h-10 w-10 cursor-pointer place-items-center transition-colors outline-none focus-visible:bg-accent-soft",
          active
            ? "bg-accent-soft text-accent"
            : user
              ? "text-accent/80 hover:bg-white/8 hover:text-accent"
              : "text-white/75 hover:bg-white/8 hover:text-white",
        )}
      >
        <UserRound size={16} aria-hidden="true" />
      </button>
    </Tooltip>
  );
};

export default DashboardWindow;
