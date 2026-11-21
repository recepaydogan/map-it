import { useEffect, useState } from "react";
import DashboardWindow from "./windows/dashboard/dashboard-window";
import OverlayMapWindow from "./windows/overlay/overlay-map-window";
import OverlayMarkerDetailsWindow from "./windows/overlay/overlay-marker-details-window";
import { startCloudProgressSync } from "./services/sync/cloud-progress-sync";

export const App = () => {
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

  useEffect(() => {
    if (windowName === "main" || windowName === "in_game" || windowName === "overlay_map"
      || windowName === "overlay_marker_details") {
      startCloudProgressSync();
    }
  }, [windowName]);

  if (windowName === null) return null;
  if (windowName === "overlay_map") return <OverlayMapWindow />;
  if (windowName === "overlay_marker_details") return <OverlayMarkerDetailsWindow />;
  if (windowName === "in_game") return <DashboardWindow surface="in_game" />;
  return <DashboardWindow />;
};

export default App;
