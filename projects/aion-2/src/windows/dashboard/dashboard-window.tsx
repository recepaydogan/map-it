import { useUpdateReadState } from "../../features/updates/use-update-read-state";
import { setAppLanguage, useAppLanguage } from "../../i18n/app-language";
import { getLanguageFlag } from "../../i18n/language-flags";
import { APP_LANGUAGES } from "../../i18n/language-order";
import { IS_MAP_IT_HOSTED, sidebarLanguage, standaloneSidebarFooter } from "../../components/layout/navigation-host";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import { GAME_CONFIG, getEventCandyMapTarget, UPDATES_RELEASE_ID, WEEKLY_MISSIONS_REFERENCE } from "../../game-config";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameText } from "../../i18n/game-text";
import { getItemDisplayName } from "../../lib/item-display-name";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import PremiumPlansPanel from "../../features/subscriptions/premium-plans-panel";
import { SUBSCRIPTIONS_ENABLED, useSubscription, useSubscriptionLifecycle } from "../../features/subscriptions/subscription-runtime";
import WindowHeader from "../../components/layout/window-header";
import AccountPage from "../../features/account/account-overlay";
import ReferenceArchive from "../../features/reference/reference-archive";
import { REFERENCE_NAVIGATION_EVENT } from "../../features/reference/reference-navigation";
import { navigateReferenceHistory } from "../../features/reference/reference-history";
import type { ReferenceTarget } from "../../features/reference/reference-types";
import MapWorkspace from "../../features/map/map-workspace";
import { requestMapMarkerSizePanel } from "../../features/map/map-marker-size-navigation";
import { requestMapFilterGroup } from "../../features/map/map-filter-navigation";
import { getSelectedMap } from "../../features/map/use-selected-map";
import type { MapMarkerTarget } from "../../features/map/types";
import { GUIDE_NAVIGATION_ZOOM } from "../../features/map/map-focus-request";
import { MAP_FOCUS_REQUEST_KEY, requestMapPointInMain, requestMapReferenceInMain } from "../../features/map/map-window-bridge";
import useMapControlIntro from "../../features/map/use-map-control-intro";
import OnboardingTour from "../../features/onboarding/onboarding-tour";
import LivePositionDiscoveryCard from "../../features/live-position/live-position-discovery-card";
import { markNewPageVisited, useNewPageBadge } from "../../features/onboarding/new-page-badges";
import SettingsPage from "../../features/settings/settings-overlay";
import SupportPage from "../../features/support/support-page";
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
import EventsWorkspace from "../../features/events/events-workspace";
import { EVENT_GUIDE_NAVIGATION_EVENT, EVENT_MISSIONS_NAVIGATION_EVENT, openEventGuide, openEventGuideAt, openEventMissions, openEventSchedule } from "../../features/events/event-mission-navigation";
import LeaderboardPage from "../../features/leaderboard/leaderboard-page";
import TierListPage from "../../features/tier-lists/tier-list-page";
import UpdatesPage from "../../features/updates/updates-page";
import { IS_OVERWOLF } from "../../utils/platform";

/** Top-level pages rendered inside the dashboard's non-ad content region. */
type DashboardPage = "map" | "reference" | "weekly-missions" | "events" | "leaderboard" | "pets" | "wings" | "titles" | "dungeons" | "items" | "quests" | "bosses" | "activities" | "achievements" | "tier-lists" | "account" | "settings" | "support" | "updates";

const referencePage = (target: ReferenceTarget): DashboardPage => {
  if (target.category === WEEKLY_MISSIONS_REFERENCE.category && target.group === WEEKLY_MISSIONS_REFERENCE.group) return "weekly-missions";
  if (target.category === "mounts") return "pets";
  if (target.category === "wings") return "wings";
  if (target.category === "titles") return "titles";
  if (target.category === "dungeons") return "dungeons";
  if (target.category === "items") return "items";
  if (target.category === "quests") return "quests";
  if (target.category === "world-bosses" || (target.category === "creatures" && target.group === "Boss")) return "bosses";
  if (target.category === "activities") return "activities";
  if (target.category === "achievements") return "achievements";
  return "reference";
};

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
  const { t } = useTranslation();
  useSubscriptionLifecycle();
  const subscription = useSubscription();
  const adFree = SUBSCRIPTIONS_ENABLED && subscription.premium;
  const waitingForSubscription = SUBSCRIPTIONS_ENABLED && subscription.status === "loading";
  const premiumPreview = !IS_OVERWOLF && new URLSearchParams(window.location.search).get("previewPremium") === "1";
  const [premiumPlansOpen, setPremiumPlansOpen] = useState(false);
  const openPremiumPlans = useCallback(() => setPremiumPlansOpen(true), []);
  const closePremiumPlans = useCallback(() => setPremiumPlansOpen(false), []);
  const gameText = useGameText();
  const wingsBadge = useNewPageBadge("wings");
  const eventsBadge = useNewPageBadge("events");
  const profileBadge = useNewPageBadge("profile");
  const questsBadge = useNewPageBadge("quests");
  const titlesBadge = useNewPageBadge("titles");
  const challengesBadge = useNewPageBadge("activities");
  const achievementsBadge = useNewPageBadge("achievements");
  useSupportWatch();
  const [page, setPage] = useState<DashboardPage>("map");
  const [livePositionReminderHeight, setLivePositionReminderHeight] = useState(0);
  const [accountInitialTab, setAccountInitialTab] = useState<"characters" | "account">("characters");
  const openAccount = (tab: "characters" | "account") => {
    setAccountInitialTab(tab);
    setPage("account");
  };
  const [mapReturn, setMapReturn] = useState<{
    page: "reference" | "weekly-missions" | "pets" | "wings" | "titles" | "dungeons" | "items" | "quests" | "bosses" | "activities" | "achievements"; target: ReferenceTarget;
    destination: { mapId: string; pointId: string };
  } | null>(null);
  useEffect(() => {
    const showMap = (event: Event) => {
      if (event instanceof StorageEvent && (event.key !== MAP_FOCUS_REQUEST_KEY || !event.newValue)) return;
      if (page !== "map" && page !== "reference" && page !== "weekly-missions" && page !== "pets" && page !== "wings" && page !== "titles" && page !== "dungeons" && page !== "items" && page !== "quests" && page !== "bosses" && page !== "activities" && page !== "achievements") setMapReturn(null);
      setPage("map");
    };
    window.addEventListener(MAP_FOCUS_REQUEST_KEY, showMap);
    window.addEventListener("storage", showMap);
    return () => {
      window.removeEventListener(MAP_FOCUS_REQUEST_KEY, showMap);
      window.removeEventListener("storage", showMap);
    };
  }, [page]);
  const [referenceHistory, setReferenceHistory] = useState<ReferenceTarget[]>([{ category: "items", id: "" }]);
  const referenceTarget = referenceHistory[referenceHistory.length - 1]!;
  const currentReference = useRef<ReferenceTarget | null>(null);
  const selectedMarker = useRef<MapMarkerTarget | null>(null);
  const [returnMarker, setReturnMarker] = useState<MapMarkerTarget | null>(null);
  const [returnToEvents, setReturnToEvents] = useState(false);
  const [returnToProfile, setReturnToProfile] = useState(false);
  const [returnToLeaderboard, setReturnToLeaderboard] = useState(false);
  useEffect(() => {
    const showEventMissions = () => setPage("events");
    window.addEventListener(EVENT_MISSIONS_NAVIGATION_EVENT, showEventMissions);
    window.addEventListener(EVENT_GUIDE_NAVIGATION_EVENT, showEventMissions);
    return () => {
      window.removeEventListener(EVENT_MISSIONS_NAVIGATION_EVENT, showEventMissions);
      window.removeEventListener(EVENT_GUIDE_NAVIGATION_EVENT, showEventMissions);
    };
  }, []);
  const handleSelectedMarker = useCallback((marker: MapMarkerTarget | null) => {
    selectedMarker.current = marker;
  }, []);
  const handleCurrentReference = useCallback((target: ReferenceTarget) => {
    currentReference.current = target;
  }, []);
  const previousReference = referenceHistory[referenceHistory.length - 2];
  useEffect(() => {
    const navigate = (event: Event) => {
      const target = (event as CustomEvent<ReferenceTarget>).detail;
      // The travel catalog panel has been removed; map marker details remain available.
      if (target.category === "travel") return;
      const source = page === "reference" || page === "weekly-missions" || page === "pets" || page === "wings" || page === "titles" || page === "dungeons" || page === "items" || page === "quests" || page === "bosses" || page === "activities" || page === "achievements" ? currentReference.current : null;
      if (page !== "reference" && page !== "weekly-missions" && page !== "pets" && page !== "wings" && page !== "titles" && page !== "dungeons" && page !== "items" && page !== "quests" && page !== "bosses" && page !== "activities" && page !== "achievements") {
        setMapReturn(null);
        setReturnMarker(page === "map" ? selectedMarker.current : null);
        setReturnToEvents(page === "events");
        setReturnToProfile(page === "account");
        setReturnToLeaderboard(page === "leaderboard");
      }
      setReferenceHistory((history) => navigateReferenceHistory(history, source, target));
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
    } else if (returnToEvents) {
      setPage("events");
      setReturnToEvents(false);
    } else if (returnToProfile) {
      setPage("account");
      setReturnToProfile(false);
    } else if (returnToLeaderboard) {
      setPage("leaderboard");
      setReturnToLeaderboard(false);
    } else if (returnMarker) {
      requestMapPointInMain(returnMarker.markerId, returnMarker.mapId, undefined, true);
      setPage("map");
      setReturnMarker(null);
    }
  };
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

  const navigateToMap = useCallback(() => { setMapReturn(null); setPage("map"); }, [setMapReturn]);
  const navigateToEvents = useCallback(() => {
    if (eventsBadge) openEventGuide();
    else openEventSchedule();
    setPage("events");
  }, [eventsBadge]);
  const navigateToHalloween = useCallback(() => {
    openEventMissions();
    setPage("events");
  }, []);
  const navigateToHalloweenGuide = useCallback(() => {
    openEventGuide();
    setPage("events");
  }, []);
  const navigateToHalloweenLooks = useCallback(() => {
    openEventGuideAt("looks");
    setPage("events");
  }, []);
  const navigateToHalloweenCandy = useCallback(() => {
    const target = getEventCandyMapTarget(getSelectedMap().id);
    requestMapPointInMain(target.markerId, target.mapId);
    setPage("map");
  }, []);
  const navigateToMarkerSizes = useCallback(() => {
    navigateToMap();
    requestMapMarkerSizePanel();
  }, [navigateToMap]);
  const navigateToPetsFilter = useCallback(() => {
    navigateToMap();
    requestMapFilterGroup("pets");
  }, [navigateToMap]);
  const openReferencePage = useCallback((category: "mounts" | "wings" | "titles" | "dungeons" | "items" | "quests" | "world-bosses" | "activities" | "achievements") => {
    setReferenceHistory([{ category, id: "" }]);
    currentReference.current = null;
    setMapReturn(null);
    setReturnMarker(null);
    setReturnToEvents(false);
    setReturnToProfile(false);
    setReturnToLeaderboard(false);
    setPage(referencePage({ category, id: "" }));
  }, []);

  useEffect(() => {
    if (page === "wings") markNewPageVisited("wings");
    if (page === "events") markNewPageVisited("events");
    if (page === "account") markNewPageVisited("profile");
    if (page === "quests" || page === "titles" || page === "activities" || page === "achievements") markNewPageVisited(page);
  }, [page]);

  const navItems: { page: string; tour: string; label: string; badge?: boolean }[] = [
    { page: "map", tour: "map-page", label: t("chrome.map") },
    { page: "events", tour: "events-page", label: t("events.tab"), badge: eventsBadge },
    { page: "leaderboard", tour: "leaderboard-page", label: t("leaderboard.navLabel") },
    { page: "items", tour: "items-page", label: t("reference.categories.items") },
    { page: "pets", tour: "pets-page", label: t("pets.title") },
    { page: "quests", tour: "quests-page", label: t("reference.categories.quests"), badge: questsBadge },
    { page: "wings", tour: "wings-page", label: t("reference.categories.wings"), badge: wingsBadge },
    { page: "titles", tour: "titles-page", label: t("reference.categories.titles"), badge: titlesBadge },
    { page: "tier-lists", tour: "tier-lists-page", label: t("tierLists.navLabel") },
    { page: "dungeons", tour: "dungeons-page", label: t("reference.categories.dungeons") },
    { page: "bosses", tour: "bosses-page", label: t("reference.categories.world-bosses") },
    { page: "activities", tour: "activities-page", label: t("reference.activity.challenges"), badge: challengesBadge },
    { page: "achievements", tour: "achievements-page", label: t("reference.categories.achievements"), badge: achievementsBadge },
  ];

  const openNavPage = (target: string) => {
    if (target === "map") navigateToMap();
    else if (target === "leaderboard") setPage("leaderboard");
    else if (target === "events") navigateToEvents();
    else if (target === "tier-lists") setPage("tier-lists");
    else if (target === "pets") openReferencePage("mounts");
    else if (target === "wings") openReferencePage("wings");
    else if (target === "titles") openReferencePage("titles");
    else if (target === "bosses") openReferencePage("world-bosses");
    else if (target === "items" || target === "dungeons" || target === "quests" || target === "activities" || target === "achievements") openReferencePage(target);
  };

  const sidebarItems: SidebarItem[] = navItems.map(item => ({
    id: item.page,
    label: item.label,
    tour: item.tour,
    active: page === item.page,
    indicator: item.badge ? <NewPageDot /> : undefined,
    onSelect: () => openNavPage(item.page),
  }));

  const language = useAppLanguage();
  const { unread: updatesUnread, markRead: markUpdatesRead } = useUpdateReadState(UPDATES_RELEASE_ID);
  const sidebarTools: SidebarItem[] = [
    sidebarLanguage(t("language.label"), language, APP_LANGUAGES.map(({ code, name }) => ({
      id: code, label: name, icon: <img src={getLanguageFlag(code)} alt="" />,
    })), setAppLanguage),
    { id: "updates", tour: "updates", label: t("updates.title"), active: page === "updates",
      indicator: updatesUnread && page !== "updates" ? <span className="app-navigation-dot" /> : undefined,
      onSelect: () => { markUpdatesRead(); setPage("updates"); } },
  ];

  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const supportBadge = unreadReplies + (isAdmin ? inboxPending : 0);
  const standaloneItems = standaloneSidebarFooter(
    { label: t("support.title"), active: page === "support", onSelect: () => setPage("support"),
      indicator: supportBadge > 0 ? <span className="app-navigation-dot" /> : undefined },
    { label: t("account.open"), active: page === "account", onSelect: () => openAccount("characters"),
      indicator: profileBadge ? <NewPageDot /> : undefined },
  );

  return (
    <main className="app-dashboard-window relative flex h-screen w-screen flex-col overflow-hidden bg-background text-white">
      {IS_OVERWOLF && <WindowHeader standaloneDashboard={!IS_MAP_IT_HOSTED}
        adFree={adFree}
      />}
      <div className="flex min-h-0 flex-1">
        <NavigationSidebar label={GAME_CONFIG.appName} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t("map.markerStyle.icons.pin")} storageKey="app:navigation-pinned" items={sidebarItems} footer={[...sidebarTools, { id: "settings", label: t("settings.title"), tour: "settings-page", active: page === "settings", onSelect: () => setPage("settings") }]} systemFooter={standaloneItems} />
        <section data-tour-frame data-app-window-page-content={page !== "map" ? "" : undefined} className="game-page-artwork relative min-w-0 flex-1 overflow-hidden bg-map-surface">
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          <div className={cn("h-full", page !== "map" && "hidden")} aria-hidden={page !== "map"} inert={page !== "map"}>
            <MapWorkspace
              active={page === "map"}
              desktopFollow={IS_OVERWOLF && surface === "desktop"}
              bottomInset={livePositionReminderHeight ? livePositionReminderHeight + 12 : 0}
              onSelectedMarkerChange={handleSelectedMarker}
              onOpenEvents={navigateToEvents}
              onReturnToPanel={mapReturn ? () => {
                currentReference.current = mapReturn.target;
                if (mapReturn.page !== "quests") setReferenceHistory((history) => [...history.slice(0, -1), mapReturn.target]);
                setMapReturn(null);
                setPage(mapReturn.page);
              } : undefined}
              returnDestination={mapReturn?.destination}
              returnToQuestPage={mapReturn?.page === "quests"}
              controlsIntroVisible={controlsIntroVisible}
            />
          </div>
          {page === "settings" && <SettingsPage onNavigateMap={navigateToMap} onViewPlans={openPremiumPlans} />}
          {page === "support" && <SupportPage />}
           {page === "updates" && <UpdatesPage onNavigateMap={navigateToMap} onNavigateQuests={() => openReferencePage("quests")} onNavigateTitles={() => openReferencePage("titles")} onNavigateChallenges={() => openReferencePage("activities")} onNavigateAchievements={() => openReferencePage("achievements")} onNavigatePetsFilter={navigateToPetsFilter} onNavigateMarkerSizes={navigateToMarkerSizes} onNavigateWings={() => openReferencePage("wings")} onNavigateLeaderboard={() => setPage("leaderboard")} onNavigateHalloween={navigateToHalloween} onNavigateHalloweenGuide={navigateToHalloweenGuide} onNavigateHalloweenLooks={navigateToHalloweenLooks} onNavigateHalloweenCandy={navigateToHalloweenCandy} />}
          {page === "account" && <AccountPage initialTab={accountInitialTab} onViewPlans={openPremiumPlans} />}
          {page === "tier-lists" && <TierListPage />}
          <LeaderboardPage active={page === "leaderboard"} onOpenMyCharacters={() => openAccount("characters")} onOpenSignIn={() => openAccount("account")} />
          {(page === "reference" || page === "weekly-missions" || page === "pets" || page === "wings" || page === "titles" || page === "dungeons" || page === "items" || page === "quests" || page === "bosses" || page === "activities" || page === "achievements" || page === "map" && mapReturn?.page === "quests") && <div className={cn("absolute inset-0", page === "map" && "hidden")} aria-hidden={page === "map"} inert={page === "map"}><ReferenceArchive target={referenceTarget} title={page === "weekly-missions" ? t("weeklyMissions.title") : undefined} onCurrentChange={handleCurrentReference} backLabel={previousReference?.name ? getItemDisplayName(previousReference.name, gameText(previousReference.name)) : returnToProfile ? t("profile.tabs.characters") : returnToLeaderboard ? t("leaderboard.navLabel") : returnToEvents ? t("events.tab") : returnMarker?.name ? gameText(returnMarker.name) : undefined} onBack={previousReference || returnMarker || returnToEvents || returnToLeaderboard || returnToProfile ? handleReferenceBack : undefined} onOpenMap={(mapId, markerId, search) => {
            setMapReturn({
              page: page === "weekly-missions" ? "weekly-missions" : page === "pets" ? "pets" : page === "wings" ? "wings" : page === "titles" ? "titles" : page === "dungeons" ? "dungeons" : page === "items" ? "items" : page === "quests" ? "quests" : page === "bosses" ? "bosses" : page === "activities" ? "activities" : page === "achievements" ? "achievements" : "reference",
              target: currentReference.current ?? referenceTarget,
              destination: { mapId, pointId: markerId },
            });
            if (search) requestMapReferenceInMain(search.referenceId, search.name, mapId, search.region, markerId, search.allRegions, GUIDE_NAVIGATION_ZOOM);
            else requestMapPointInMain(markerId, mapId, undefined, undefined, GUIDE_NAVIGATION_ZOOM);
            setPage("map");
          }} /></div>}
          <EventsWorkspace active={page === "events"} alertsOwner={surface === "desktop"} onShowMap={({ mapId, markerId }) => { requestMapPointInMain(markerId, mapId); setPage("map"); }} />
          {page === "map" && <LivePositionDiscoveryCard onOpenMap={navigateToMap} onReminderHeightChange={setLivePositionReminderHeight} />}
          {premiumPlansOpen && <PremiumPlansPanel preview={premiumPreview} onClose={closePremiumPlans} />}
        </section>
        {/* Keep the same ad instances mounted across map, reference and support navigation.
            Settings and account remain full-width surfaces; unmounting shuts
            the ads down so nothing runs behind a hidden rail. */}
        {page !== "settings" && page !== "account" && !adFree && !waitingForSubscription && <div className="app-window-ad-column"><OverwolfAdRail preview={premiumPreview} onRemoveAds={SUBSCRIPTIONS_ENABLED || premiumPreview ? openPremiumPlans : undefined} /></div>}
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


const NewPageDot = () => <span aria-hidden="true" className="ml-0.5 size-2 shrink-0 rounded-full bg-accent shadow-[0_0_8px_var(--color-accent)] animate-pulse motion-reduce:animate-none" />;

export default DashboardWindow;
