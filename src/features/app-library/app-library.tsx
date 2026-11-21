import { useEffect, useRef, useSyncExternalStore } from "react";
import { useSharedAccountVisible } from "../account/shared-account-context";
import MapItWindowChrome from "../../components/layout/map-it-window-chrome";
import { bindMapItWindowDrag } from "../../components/layout/map-it-window-drag";
import { IS_OVERWOLF } from "../../utils/platform";
import { findMapGame, getSelectedAppId, subscribeToAppSelection } from "./app-selection";
import { useStartupSelection } from "./use-startup-selection";
import AppModuleFrame from "./app-module-frame";
import AppLibraryAdRail from "./app-library-ad-rail";
import AppHome from "./app-home";

export default function AppLibrary() {
  const selected = useSyncExternalStore(subscribeToAppSelection, getSelectedAppId);
  const app = findMapGame(selected);
  const ready = useStartupSelection();
  const covered = useSharedAccountVisible();
  const desktop = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!IS_OVERWOLF) return;
    const surface = desktop.current?.closest<HTMLElement>("[data-map-it-shell]");
    const strip = desktop.current?.querySelector<HTMLElement>(".app-dashboard-window-drag-strip");
    if (surface && strip) return bindMapItWindowDrag(surface, strip);
  }, []);

  return <main ref={desktop} data-map-it-desktop={IS_OVERWOLF ? "" : undefined} className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-background">
    {ready && app ? <AppModuleFrame key={app.id} app={app} /> : <AppHome busy={!ready} covered={covered} />}
    <AppLibraryAdRail />
    {IS_OVERWOLF && <MapItWindowChrome />}
  </main>;
}
