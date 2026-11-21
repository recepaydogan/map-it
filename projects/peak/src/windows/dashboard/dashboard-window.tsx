import { IS_MAP_IT_HOSTED, standaloneSidebarFooter } from "../../components/layout/navigation-host";
import { UPDATES_RELEASE } from "../../features/updates/updates-release";
import { useUpdateReadState } from "../../features/updates/use-update-read-state";
import { Backpack, BookOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import { useCallback, useEffect, useState } from "react";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import WindowHeader, { type MainScreen } from "../../components/window-header";
import ContentWorkspace from "../../content/content-workspace";
import AccountScreen from "../../features/account/account-screen";
import { useOAuthDeepLink } from "../../features/account/use-oauth-deeplink";
import ItemsScreen from "../../features/items/items-screen";
import JournalScreen from "../../features/journal/journal-screen";
import type { ExpeditionRecord } from "../../features/map/expedition-store";
import OnboardingTour from "../../features/onboarding/onboarding-tour";
import TrackerLocateModal from "../../components/tracker-locate-modal";
import SettingsScreen from "../../features/settings/settings-screen";
import SupportPage from "../../features/support/support-page";
import UpdatesPage from "../../features/updates/updates-page";
import { useSupportBadges, useSupportWatch } from "../../state/use-support";
import { startAuthSession } from "../../state/auth-store";
import { useAnalytics } from "../../state/use-analytics";
import { IS_OVERWOLF } from "../../utils/platform";
import { setupGameLaunchMonitorSwitch } from "../../overwolf/game-launch-monitor-switch";

const DashboardWindow = () => {
  const { t } = useTranslation();
  const [activeScreen, setActiveScreen] = useState<MainScreen>("dashboard");
  const [expeditionReplay, setExpeditionReplay] = useState<ExpeditionRecord | null>(null);
  const [locateModalOpen, setLocateModalOpen] = useState(false);
  // Settings and account are full-width utility surfaces. Ads remain visible
  // everywhere else, including an empty journal.
  const adsVisible = activeScreen !== "settings" && activeScreen !== "account";

  useAnalytics("desktop", activeScreen);
  // Restores the persisted session and follows sign-in/out for the whole window.
  useEffect(startAuthSession, []);
  // Completes a Google sign-in relayed here from the background window.
  useOAuthDeepLink();
  useSupportWatch();

  useEffect(() => {
    if (IS_OVERWOLF) {
      setupGameLaunchMonitorSwitch();
    }
  }, []);

  const changeScreen = (screen: MainScreen) => {
    setExpeditionReplay(null);
    setActiveScreen(screen);
  };

  const navigateToMap = useCallback(() => {
    setExpeditionReplay(null);
    setActiveScreen("dashboard");
  }, []);

  const viewExpeditionInAtlas = (record: ExpeditionRecord) => {
    setExpeditionReplay(record);
    setActiveScreen("dashboard");
  };

  const { unread: updatesUnread, markRead: markUpdatesRead } = useUpdateReadState(UPDATES_RELEASE.version);
  const sidebarTools: SidebarItem[] = [{
    id: "updates", label: t("updates.title"), active: activeScreen === "updates",
    indicator: updatesUnread ? <span className="app-navigation-dot" /> : undefined,
    onSelect: () => { markUpdatesRead(); changeScreen("updates"); },
  }];
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const standaloneItems = standaloneSidebarFooter(
    { label: t("support.title"), active: activeScreen === "support", onSelect: () => changeScreen("support"),
      indicator: unreadReplies + (isAdmin ? inboxPending : 0) > 0 ? <span className="app-navigation-dot" /> : undefined },
    { label: t("account.title"), active: activeScreen === "account", onSelect: () => changeScreen("account") },
  );
  const navItems: SidebarItem[] = [
    { id: "map", tour: "dashboard", label: t("nav.dashboard"), active: activeScreen === "dashboard", onSelect: () => changeScreen("dashboard") },
    { id: "journal", tour: "journal", label: t("nav.journal"), icon: <BookOpen size={18} />, active: activeScreen === "journal", onSelect: () => changeScreen("journal") },
    { id: "items", tour: "items", label: t("nav.items"), icon: <Backpack size={18} />, active: activeScreen === "items", onSelect: () => changeScreen("items") },
  ];

  return (
    <div className="app-dashboard-window relative flex h-full w-full flex-col overflow-hidden bg-background">
      {IS_OVERWOLF && <WindowHeader standaloneDashboard={!IS_MAP_IT_HOSTED} />}
      <div className="flex min-h-0 flex-1">
        <NavigationSidebar label={t("app.name")} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t("nav.pinNavigation")} storageKey="app:navigation-pinned"
          items={navItems} systemFooter={standaloneItems} footer={[...sidebarTools, { id: "settings", label: t("nav.settings"), active: activeScreen === "settings", onSelect: () => changeScreen("settings") }]} />
        <main data-tour-frame data-app-window-page-content className="game-page-artwork relative min-w-0 flex-1">
          {activeScreen === "settings" ? (
            <SettingsScreen onClose={() => changeScreen("dashboard")} />
          ) : activeScreen === "account" ? (
            <AccountScreen onClose={() => changeScreen("dashboard")} />
          ) : activeScreen === "support" ? (
            <SupportPage />
          ) : activeScreen === "items" ? (
            <ItemsScreen />
          ) : activeScreen === "journal" ? (
            <JournalScreen onViewInAtlas={viewExpeditionInAtlas} />
          ) : activeScreen === "updates" ? (
            <UpdatesPage onNavigateMap={() => changeScreen("dashboard")} />
          ) : (
            <ContentWorkspace
              expeditionReplay={expeditionReplay}
              onRequestTrackingFolder={() => setLocateModalOpen(true)}
            />
          )}
          <TrackerLocateModal
            manualOpen={locateModalOpen}
            onManualClose={() => setLocateModalOpen(false)}
          />
        </main>
        {IS_OVERWOLF && <div className="app-window-ad-column"><OverwolfAdRail visible={adsVisible} /></div>}
      </div>
      <OnboardingTour mapActive={activeScreen === "dashboard"} onNavigateMap={navigateToMap} />
    </div>
  );
};

export default DashboardWindow;
