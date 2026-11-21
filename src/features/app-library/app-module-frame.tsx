import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { appFrameUrl, findMapGame, selectApp, type MapGame } from "./app-selection";
import { bindMapItWindowDrag } from "../../components/layout/map-it-window-drag";
import { IS_OVERWOLF } from "../../utils/platform";

export default function AppModuleFrame({ app, surface = "main", launch }: { app: MapGame; surface?: string; launch?: { source: string; parameter?: string } }) {
  const { t } = useTranslation();
  const frame = useRef<HTMLIFrameElement>(null);
  const [url] = useState(() => {
    const target = new URL(appFrameUrl(app, surface, launch), window.location.href);
    if (surface === "main") {
      const settings = {
        "host-sidebar": "true",
        "host-brand-label": t("hub.brand"),
        "host-game-label": app.name,
        "host-game-icon": app.icon,
        "host-library-label": t("hub.backToLibrary"),
        "host-support-label": t("support.title"),
        "host-account-label": t("account.account"),
        "host-unread-label": t("support.newReply"),
      };
      for (const [key, value] of Object.entries(settings)) target.searchParams.set(key, value);
      if (IS_OVERWOLF) target.searchParams.set("host-ad-rail", "true");
    }
    return target.pathname + target.search;
  });
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "map-it:select-app" && findMapGame(event.data.appId)) selectApp(event.data.appId);
      if (event.data?.type === "map-it:open-library") selectApp(null);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  useEffect(() => {
    const element = frame.current;
    return () => {
      try { (element?.contentWindow as (Window & { __MAP_IT_DISPOSE__?: () => void }) | null)?.__MAP_IT_DISPOSE__?.(); }
      catch { /* A document can finish navigating while its parent unmounts. */ }
    };
  }, [app.moduleId, surface]);
  useEffect(() => {
    const element = frame.current;
    if (!IS_OVERWOLF || surface !== "main" || !element) return;
    const dragStrip = element.parentElement?.querySelector<HTMLElement>(".app-dashboard-window-drag-strip");
    if (!dragStrip) return;

    let unbind: (() => void) | undefined;
    const connect = () => {
      unbind?.();
      const game = element.contentDocument?.documentElement;
      unbind = game ? bindMapItWindowDrag(game, dragStrip, element) : undefined;
    };
    connect();
    element.addEventListener("load", connect);
    return () => {
      element.removeEventListener("load", connect);
      unbind?.();
    };
  }, [app.moduleId, surface]);
  return <iframe
    ref={frame}
    key={`${app.moduleId}:${surface}`}
    data-map-app={app.moduleId}
    data-map-game={app.id}
    name={`map-it-${app.moduleId}-${surface}`}
    src={url}
    title={t("hub.frameTitle", { game: app.name })}
    className="block h-full min-h-0 w-full flex-1 border-0 bg-transparent"
    allow="clipboard-write"
  />;
}
