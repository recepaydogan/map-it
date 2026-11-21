import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { SharedAccountContext } from "./shared-account-context";
import AccountPage from "./account-overlay";
import { IS_OVERWOLF } from "../../utils/platform";
import { PORTAL_ROOT_ID } from "../../lib/portal";
import { useAuth } from "../../state/use-auth";
import { useTranslation } from "react-i18next";
import { findMapGame, getSelectedAppId, subscribeToAppSelection } from "../app-library/app-selection";
import SupportPage from "../support/support-page";
import { useSupportWatch, useSupportBadges } from "../../state/use-support";
import MapItSidebar from "../../components/layout/map-it-sidebar";
import useSharedPaneFrame, { sharedSidebarInset } from "./use-shared-pane-frame";

export default function SharedAccountSurface({ children }: { children: ReactNode }) {
  const [pane, setPane] = useState<"account" | "support" | null>(null);
  const open = pane !== null;
  const { t } = useTranslation();
  const { status, user } = useAuth();
  useSupportWatch();
  const { unreadReplies, inboxPending } = useSupportBadges();
  const selected = useSyncExternalStore(subscribeToAppSelection, getSelectedAppId);
  const params = new URLSearchParams(location.search);
  const surface = params.get("surface") || "main";
  const gameId = findMapGame(surface === "main" ? selected : params.get("app"))?.id;
  const content = useRef<HTMLDivElement>(null);
  const supportPage = useRef<HTMLElement>(null);
  const { theme, measureSidebar } = useSharedPaneFrame(content, open, gameId);
  const navigateToPane = useCallback((next: typeof pane) => {
    // Give the page its correct column before it can enter the sidebar's hit area.
    if (next) measureSidebar();
    setPane(next);
  }, [measureSidebar]);
  const adInset = IS_OVERWOLF && ["main", "in_game"].includes(surface) ? 440 : 0;
  const showSupport = pane === "support";
  useEffect(() => {
    if (showSupport) supportPage.current?.focus({ preventScroll: true });
  }, [showSupport]);
  useEffect(() => subscribeToAppSelection(() => setPane(null)), []);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || !["map-it:open-account", "map-it:open-support", "map-it:select-app", "map-it:leave-shared-page"].includes(event.data?.type)) return;
      const trusted = [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-map-app]")].some(frame => frame.contentWindow === event.source);
      if (trusted) navigateToPane(["map-it:select-app", "map-it:leave-shared-page"].includes(event.data.type) ? null : event.data.type === "map-it:open-support" ? "support" : "account");
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [navigateToPane]);
  useEffect(() => {
    // A session transition is observed by every imported SDK through the shared
    // auth storage/channel. The host never remounts the ad rail or game frame.
    document.documentElement.dataset.mapItAuth = status;
  }, [status]);
  useEffect(() => {
    const count = unreadReplies + inboxPending;
    const send = (frame: HTMLIFrameElement) => {
      frame.contentWindow?.postMessage({ type: "map-it:support-badge", count }, location.origin);
      frame.contentWindow?.postMessage({ type: "map-it:navigation-state", pane, unread: count > 0 }, location.origin);
    };
    const frames = () => [...document.querySelectorAll<HTMLIFrameElement>("iframe[data-map-app]")];
    frames().forEach(send);
    const ready = (event: MessageEvent) => {
      if (event.origin !== location.origin || !["map-it:support-ready", "map-it:navigation-ready"].includes(event.data?.type)) return;
      const frame = frames().find(frame => frame.contentWindow === event.source);
      if (frame) send(frame);
    };
    window.addEventListener("message", ready);
    return () => window.removeEventListener("message", ready);
  }, [unreadReplies, inboxPending, pane, gameId]);
  return <SharedAccountContext.Provider value={{ show: () => navigateToPane("account"), showSupport: () => navigateToPane("support"), open }}>
    <div data-map-it-shell className="relative isolate flex h-screen w-screen min-h-0 overflow-hidden">
      {surface === "main" && !gameId && <MapItSidebar pane={pane} onChange={navigateToPane} />}
      <div ref={content} data-map-it-game-theme={theme ? "" : undefined} className="relative grid min-h-0 min-w-0 flex-1 grid-rows-[minmax(0,1fr)] transition-none" style={{ ...theme, gridTemplateColumns: `${sharedSidebarInset} minmax(0, 1fr) ${adInset}px` }}>
        {/* Keep the game mounted so its navigation and current view survive the page change. */}
        <div className="col-span-full row-start-1 min-h-0 min-w-0">{children}</div>
        {showSupport && (
          <section ref={supportPage} aria-label={t("support.title")} data-map-it-shared-support tabIndex={-1}
            className="col-start-2 row-start-1 z-10 min-h-0 min-w-0 overflow-hidden outline-none">
            <SupportPage key={user?.id ?? "guest"} gameId={gameId} />
          </section>
        )}
        {pane === "account" && <section aria-label={t("account.mapItAccount")} data-map-it-shared-account className="absolute inset-0 z-20 overflow-hidden bg-background transition-none" style={{ right: adInset, left: sharedSidebarInset }}>
          <AccountPage />
        </section>}
        <div id={PORTAL_ROOT_ID} data-map-it-account-portal className="pointer-events-none absolute inset-y-0 z-30 overflow-hidden" style={{ right: adInset, left: sharedSidebarInset }} />
      </div>
    </div>
  </SharedAccountContext.Provider>;
}
