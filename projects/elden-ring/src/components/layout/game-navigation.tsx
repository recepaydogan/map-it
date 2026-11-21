import { useMapStore } from "../../store/map-store";
import { OVERWOLF_STORE_URL } from "../../utils/external-links";
import { useGetApp } from "../../features/get-app";
import { useSupportBadges } from "../../state/use-support";
import { markSupportNudgeSeen } from "./support-nudge-state";
import { IS_MAP_IT_HOSTED, sidebarLanguage, standaloneSidebarFooter } from "./navigation-host";
import FlagIcon from "../flag-icon";
import { useLocale } from "../../i18n/use-locale";
import { useNotesAdminBadge } from "../../state/use-notes-admin";
import { IS_OVERWOLF } from "../../utils/platform";
import { BookOpen, Download, MessagesSquare, Moon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../store/ui-store";
import { NIGHTREIGN_TABS } from "./nav-tabs";
import NavigationSidebar, { type SidebarItem } from "./navigation-sidebar";

export default function GameNavigation() {
  const { t } = useTranslation();
  const active = useUiStore(state => state.activeOverlay);
  const mapGame = useMapStore(state => state.game);
  const databaseGame = useUiStore(state => state.databaseGame);
  const catalogGame = databaseGame ?? mapGame;
  const openDatabase = useUiStore(state => state.openDatabase);
  const openOverlay = useUiStore(state => state.openOverlay);
  const { language, languages, setLanguage } = useLocale();
  const notes = useNotesAdminBadge();
  const closeOverlay = useUiStore(state => state.closeOverlay);
  const [nightlords, nightfarers, relics] = NIGHTREIGN_TABS;
  const nightreignItems: SidebarItem[] = [relics, nightlords, nightfarers].map(({ key, tKey, icon: Icon }) => ({
    id: tKey,
    label: t(tKey),
    icon: <Icon size={17} />,
    active: active === key,
    onSelect: () => { if (key) openOverlay(key); },
  }));

  const showGetApp = useGetApp(state => state.show);
  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges();
  const standaloneItems = standaloneSidebarFooter(
    { label: t("nav.support"), active: active === "support",
      indicator: unreadReplies + (isAdmin ? inboxPending : 0) > 0 ? <span className="app-navigation-dot" /> : undefined,
      onSelect: () => { markSupportNudgeSeen(); openOverlay("support"); } },
    { label: t("nav.account"), active: active === "account", onSelect: () => openOverlay("account") },
  );
  const sidebarTools: SidebarItem[] = [
    sidebarLanguage(t("settings.language"), language, languages.map(({ code, region, endonym }) => ({
      id: code, label: endonym, icon: <FlagIcon region={region} className="w-[22px]" />,
    })), setLanguage),
    ...(notes.isAdmin ? [{
      id: "notes-admin", label: t("notesAdmin.buttonLabel"), icon: <MessagesSquare size={17} />, active: active === "notesAdmin",
      indicator: notes.reported || notes.unreviewed ? <span className="app-navigation-dot" /> : undefined,
      onSelect: () => openOverlay("notesAdmin"),
    }] : []),
    { id: "settings", tour: "settings", label: t("nav.settings"), active: active === "settings", onSelect: () => openOverlay("settings") },
    ...(!IS_MAP_IT_HOSTED && !IS_OVERWOLF && OVERWOLF_STORE_URL ? [{
      id: "get-app", label: t("getApp.button"), icon: <Download size={17} />, onSelect: () => showGetApp("header"),
    }] : []),
  ];

  const gameTheme = active === "codex" ? catalogGame
    : nightreignItems.some(item => item.active) ? "nightreign" : mapGame;
  return (
    <div data-game={gameTheme} className="contents">
    <NavigationSidebar label={t("app.name")} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t("nav.pinNavigation")} storageKey="app:navigation-pinned" tour="nav" footer={sidebarTools} systemFooter={standaloneItems}
      items={[
        { id: "map", label: t("nav.map"), active: active === null, onSelect: closeOverlay },
        { id: "elden-ring-items", label: t("nav.eldenRingItems"), icon: <BookOpen size={17} />, active: active === "codex" && catalogGame === "elden-ring", onSelect: () => openDatabase("elden-ring") },
        { id: "nightreign-items", label: t("nav.nightreignItems"), icon: <Moon size={17} />, active: active === "codex" && catalogGame === "nightreign", onSelect: () => openDatabase("nightreign") },
        ...nightreignItems,
      ]}
    />
    </div>
  );
}
