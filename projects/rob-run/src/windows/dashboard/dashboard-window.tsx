import { UPDATES_VERSION } from "../../features/updates/updates-release";
import { ArrowLeftRight, Bell, Boxes, ChevronDown, ClipboardList, Crosshair, Gem, Map as MapIcon, Package, Store } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import OverwolfAdRail from "../../components/ads/overwolf-ad-rail";
import NavigationSidebar, { type SidebarItem } from "../../components/layout/navigation-sidebar";
import WindowHeader from "../../components/layout/window-header";
import { GAME_CONFIG } from "../../game-config";
import AccountPage from "../../features/account/account-overlay";
import MapWorkspace from "../../features/map/map-workspace";
import { MAP_FOCUS_REQUEST_KEY, requestMapPointInMain } from "../../features/map/map-window-bridge";
import RobRunHeists from "../../features/rob-run/rob-run-heists";
import RobRunCatalog from "../../features/rob-run/rob-run-catalog";
import RobRunEconomy, { type EconomyPage } from "../../features/rob-run/rob-run-economy";
import RobRunReferenceLists, { type RobRunReferencePage } from "../../features/rob-run/rob-run-reference-lists";
import RobRunWikiPreviewProvider from "../../features/rob-run/rob-run-wiki-preview";
import { ROB_RUN_CATALOG_EVENT, ROB_RUN_WIKI_NAVIGATION, type RobRunWikiTarget } from "../../features/rob-run/rob-run-catalog-navigation";
import SettingsPage from "../../features/settings/settings-overlay";
import SupportPage from "../../features/support/support-page";
import { cn } from "../../lib/cn";
import { contentUrl } from "../../lib/content-url";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { setupGameLaunchMonitorSwitch } from "../../overwolf-utils/game-launch-monitor-switch";
import type { AnalyticsSurface } from "../../services/analytics/app-context";
import { AuthProvider } from "../../state/auth-provider";
import { useAnalytics } from "../../state/use-analytics";
import { IS_OVERWOLF } from "../../utils/platform";
import InGameAutoOpenBanner from "./in-game-auto-open-banner";
import "../../components/layout/game-page-artwork.css";

type Page = "map" | "items" | "heists" | "settings" | "updates" | "account" | "support" | EconomyPage | RobRunReferencePage;

const accountsConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const goToPlans = () => {};
const pageArtworkStyle = GAME_CONFIG.pageArtworkPath
  ? { "--game-page-image": `url("${contentUrl(GAME_CONFIG.pageArtworkPath)}")` } as CSSProperties
  : undefined;

function DashboardShell({ surface }: { surface: AnalyticsSurface }) {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("map");
  const [catalogItem, setCatalogItem] = useState<string>();
  const [wikiTarget, setWikiTarget] = useState<RobRunWikiTarget>();
  const [controlsExpanded, setControlsExpanded] = useState(true);
  const [mapPickerOpen, setMapPickerOpen] = useState(false);
  const showAds = IS_OVERWOLF && page !== "settings" && page !== "account";

  const goToMap = () => setPage("map");
  const openCityMarker = (id: string) => {
    goToMap();
    requestMapPointInMain(id, "looty-bay");
  };
  useEffect(() => {
    const openMap = (event: Event) => {
      if (event instanceof StorageEvent && (event.key !== MAP_FOCUS_REQUEST_KEY || !event.newValue)) return;
      setPage("map");
    };
    const openItem = (event: Event) => {
      setCatalogItem((event as CustomEvent<string>).detail);
      setPage("items");
    };
    const openWiki = (event: Event) => {
      const target = (event as CustomEvent<RobRunWikiTarget>).detail;
      setWikiTarget(target);
      setPage(target.page);
    };
    window.addEventListener(MAP_FOCUS_REQUEST_KEY, openMap);
    window.addEventListener("storage", openMap);
    window.addEventListener(ROB_RUN_CATALOG_EVENT, openItem);
    window.addEventListener(ROB_RUN_WIKI_NAVIGATION, openWiki);
    return () => {
      window.removeEventListener(MAP_FOCUS_REQUEST_KEY, openMap);
      window.removeEventListener("storage", openMap);
      window.removeEventListener(ROB_RUN_CATALOG_EVENT, openItem);
      window.removeEventListener(ROB_RUN_WIKI_NAVIGATION, openWiki);
    };
  }, []);

  const releaseKey = "updates.releases.v" + UPDATES_VERSION.replaceAll(".", "");
  const releaseNotes = t(releaseKey + ".items", { returnObjects: true });
  const mapLabel = t("chrome.map");
  const itemLabel = t("robRun.catalog.title");
  const controlsLabel = t(controlsExpanded ? "map.controls.hideControls" : "map.controls.showControls");
  const navItems: SidebarItem[] = [
    { id: "map", label: mapLabel, active: page === "map", onSelect: goToMap, icon: <MapIcon size={17} /> },
    { id: "items", label: itemLabel, active: page === "items", onSelect: () => { setCatalogItem(undefined); setPage("items"); } },
    { id: "heists", label: t("robRun.heists.title"), active: page === "heists", onSelect: () => setPage("heists"), icon: <Crosshair size={18} /> },
    { id: "barters", label: t("robRun.economy.barters"), active: page === "barters", onSelect: () => setPage("barters"), icon: <ArrowLeftRight size={18} /> },
    { id: "shipments", label: t("robRun.economy.shipments"), active: page === "shipments", onSelect: () => setPage("shipments"), icon: <ClipboardList size={18} /> },
    { id: "loot", label: t("robRun.economy.loot"), active: page === "loot", onSelect: () => setPage("loot"), icon: <Gem size={18} /> },
    { id: "cargo", label: t("robRun.economy.cargo"), active: page === "cargo", onSelect: () => setPage("cargo"), icon: <Package size={18} /> },
    { id: "collections", label: t("robRun.economy.collections"), active: page === "collections", onSelect: () => setPage("collections"), icon: <Boxes size={18} /> },
    { id: "vendors", label: t("robRun.economy.vendors"), active: page === "vendors", onSelect: () => setPage("vendors"), icon: <Store size={18} /> },
  ];
  const footer: SidebarItem[] = [
    { id: "updates", label: t("updates.title"), active: page === "updates", onSelect: () => setPage("updates"), icon: <Bell size={17} /> },
    { id: "settings", label: t("settings.title"), active: page === "settings", onSelect: () => setPage("settings") },
  ];
  const systemFooter: SidebarItem[] = accountsConfigured ? [
    { id: "support", label: t("support.title"), active: page === "support", onSelect: () => setPage("support") },
    { id: "account", label: t("account.open"), active: page === "account", onSelect: () => setPage("account") },
  ] : [];

  return (
    <main className="app-dashboard-window relative flex h-screen w-screen flex-col overflow-hidden bg-background text-white">
      {IS_OVERWOLF && <WindowHeader standaloneDashboard adFree={!showAds} onHome={goToMap} />}
      <div className="flex min-h-0 flex-1">
        <NavigationSidebar label={GAME_CONFIG.appName} pinLabel={t("map.markerStyle.icons.pin")}
          brandIcon={<img src="/icon.png" alt="" draggable={false} />} storageKey="rob-run:navigation-pinned"
          items={navItems.map((item) => item.onSelect ? ({ ...item, onSelect: () => {
            setWikiTarget(undefined);
            item.onSelect?.();
          } }) : item)} footer={footer} systemFooter={systemFooter} />
        <section className={cn("relative min-w-0 flex-1 overflow-hidden bg-map-surface",
          pageArtworkStyle && "game-page-artwork")} style={pageArtworkStyle}
          data-map-page={page === "map" ? "" : undefined}>
          <div id={PORTAL_ROOT_ID} className="pointer-events-none absolute inset-0 z-[1500]" />
          <div className={cn("relative h-full", page !== "map" && "hidden")} inert={page !== "map"}>
            {page === "map" && <button type="button"
              className="absolute top-2 left-1/2 z-[1410] grid size-[30px] -translate-x-1/2 cursor-pointer place-items-center rounded-full border border-white/25 bg-background text-white/90 hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
              aria-controls="map-toolbar map-lower-controls" aria-expanded={controlsExpanded}
              aria-label={controlsLabel} title={controlsLabel}
              onClick={() => { setMapPickerOpen(false); setControlsExpanded(current => !current); }}>
              <ChevronDown size={16} className={cn("transition-transform", !controlsExpanded && "rotate-180")} aria-hidden="true" />
            </button>}
            <MapWorkspace active={page === "map"} controlsExpanded={controlsExpanded}
              onControlsExpandedChange={setControlsExpanded} mapPickerOpen={mapPickerOpen}
              onMapPickerOpenChange={setMapPickerOpen} />
          </div>
          <RobRunWikiPreviewProvider>
            {page === "items" && <RobRunCatalog selectedId={catalogItem} onSelect={setCatalogItem}
              onOpenMarker={openCityMarker} />}
            {page === "heists" && <RobRunHeists onOpenMarker={openCityMarker} />}
            {(page === "barters" || page === "shipments" || page === "loot") && <RobRunEconomy
              key={page + (wikiTarget?.page === page ? `${wikiTarget.id}:${wikiTarget.realmVersion ?? ""}` : "")} page={page}
              target={wikiTarget?.page === page ? wikiTarget : undefined} />}
            {(page === "cargo" || page === "collections" || page === "vendors") && <RobRunReferenceLists
              key={page + (wikiTarget?.page === page ? wikiTarget.id : "")} page={page}
              initialId={wikiTarget?.page === page ? wikiTarget.id : undefined} />}
          </RobRunWikiPreviewProvider>
          {page === "settings" && <SettingsPage onNavigateMap={goToMap} onViewPlans={goToPlans} showTour={false} />}
          {page === "account" && <AccountPage onNavigateMap={goToMap} onViewPlans={goToPlans} />}
          {page === "support" && <SupportPage />}
          {page === "updates" && <article className="mx-auto max-w-xl px-6 py-10">
            <h1 className="mb-4 text-xl font-semibold">{t("updates.title")}</h1>
            <h2 className="mb-3 text-sm font-semibold text-accent">{UPDATES_VERSION}</h2>
            <ul className="space-y-2 pl-5 text-sm text-muted">
              {Array.isArray(releaseNotes) && releaseNotes.filter((note): note is string => typeof note === "string")
                .map((note) => <li key={note} className="list-disc">{note}</li>)}
            </ul>
          </article>}
          {page === "map" && surface === "in_game" && <InGameAutoOpenBanner />}
        </section>
        {showAds && <div className="app-window-ad-column"><OverwolfAdRail /></div>}
      </div>
    </main>
  );
}

export default function DashboardWindow({ surface = "desktop" }: { surface?: AnalyticsSurface }) {
  useEffect(() => setupGameLaunchMonitorSwitch(), []);
  useAnalytics(surface);
  const shell = <DashboardShell surface={surface} />;
  return accountsConfigured ? <AuthProvider>{shell}</AuthProvider> : shell;
}

