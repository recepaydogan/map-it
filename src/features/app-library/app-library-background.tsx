import { useEffect, useState, useSyncExternalStore } from "react";
import { initTray, destroyTray } from "../../overwolf-utils/tray-manager";
import { findMapGame, getSelectedAppId, MAP_GAMES, selectApp, subscribeToAppSelection } from "./app-selection";
import AppModuleFrame from "./app-module-frame";
import { startAppLaunchRouter, type LaunchContext } from "./app-launch-router";

export default function AppLibraryBackground() {
  const selected = useSyncExternalStore(subscribeToAppSelection, getSelectedAppId);
  const app = findMapGame(selected);
  const [launch, setLaunch] = useState<LaunchContext | null>(null);
  const [waitingForGame, setWaitingForGame] = useState(false);
  useEffect(() => {
    if (typeof overwolf === "undefined") return;
    initTray();
    const showMain = () => overwolf.windows.obtainDeclaredWindow("main", result => { if (result.success) overwolf.windows.restore(result.window.id, () => {}); });
    const params = new URLSearchParams(window.location.search);
    let routing = false;
    const stopRouting = startAppLaunchRouter({
      platform: overwolf,
      apps: MAP_GAMES,
      current: getSelectedAppId,
      initial: { source: params.get("source")?.toLowerCase() || "dock", parameter: params.get("parameter") || undefined },
      activate: (id, context) => {
        setWaitingForGame(id === null && context.source === "gamelaunchevent");
        setLaunch(context);
        if (id) { routing = true; selectApp(id); routing = false; }
      },
      showLibrary: showMain,
    });
    let previous = getSelectedAppId();
    const unsubscribe = subscribeToAppSelection(() => {
      const next = getSelectedAppId();
      if (next === previous) return;
      if (!routing) { setLaunch({ source: "dock" }); setWaitingForGame(false); }
      const oldApp = findMapGame(previous); previous = next;
      if (oldApp && oldApp.moduleId !== findMapGame(next)?.moduleId) Object.entries(oldApp.windows).forEach(([name, nativeName]) => {
        if (name === "main" || name === "background") return;
        overwolf.windows.getWindow(nativeName, result => { if (result.success) overwolf.windows.close(result.window.id, () => {}); });
      });
    });
    return () => {
      unsubscribe(); stopRouting(); destroyTray();
    };
  }, []);
  return app && launch && !waitingForGame && typeof overwolf !== "undefined" ? <AppModuleFrame key={app.moduleId} app={app} surface="background" launch={launch} /> : null;
}
