import { useEffect, useState } from "react";
import DashboardWindow from "./windows/dashboard/dashboard-window";
import OverlayMapWindow from "./windows/overlay/overlay-map-window";
import { startPhantomBladePositionReader } from "./features/live-position/phantom-blade-position-reader";

export const App = () => {
  useEffect(() => {
    if (import.meta.env.DEV && typeof overwolf === "undefined") return startPhantomBladePositionReader();
  }, []);
  const [windowName, setWindowName] = useState<string | null>(() => {
    if (typeof window === "undefined") return "main";
    const requested = new URLSearchParams(window.location.search).get("window");
    if (requested) return requested;
    return typeof overwolf === "undefined" ? "main" : null;
  });

  useEffect(() => {
    if (typeof overwolf === "undefined") return;
    overwolf.windows.getCurrentWindow((result) => {
      if (result.success) setWindowName(result.window.name);
    });
  }, []);

  if (windowName === null) return null;
  if (windowName === "overlay_map") return <OverlayMapWindow />;
  if (windowName === "in_game") return <DashboardWindow surface="in_game" />;
  return <DashboardWindow />;
};

export default App;
