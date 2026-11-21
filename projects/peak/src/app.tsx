import { useEffect, useState } from "react";
import { APP_CONFIG } from "./config/app-config";
import { getCurrentWindow } from "./overwolf/window-manager";
import { IS_OVERWOLF } from "./utils/platform";
import DashboardWindow from "./windows/dashboard/dashboard-window";
import OverlayWindow from "./windows/overlay/overlay-window";

export const App = () => {
  const [windowName, setWindowName] = useState<string | null>(() => {
    const requestedWindow = new URLSearchParams(window.location.search).get("window");
    if (requestedWindow) return requestedWindow;
    return IS_OVERWOLF ? null : APP_CONFIG.mainWindowName;
  });

  useEffect(() => {
    if (!IS_OVERWOLF) return;
    void getCurrentWindow().then((windowInfo) => {
      if (windowInfo?.name) setWindowName(windowInfo.name);
    });
  }, []);

  if (windowName === null) return null;
  if (windowName === APP_CONFIG.overlayWindowName) return <OverlayWindow />;
  return <DashboardWindow />;
};

export default App;

