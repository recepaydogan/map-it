import { useEffect, useState } from "react";
import { useAppVersion } from "../../features/updates/use-app-version";
import {
  bindDragMoveElement,
  closeCurrentWindow,
  isWindowMaximizedState,
  minimizeCurrentWindow,
  subscribeToCurrentWindowState,
  toggleCurrentWindowMaximize,
} from "../../overwolf-utils/window-manager";
import DashboardWindowChrome from "./dashboard-window-chrome";

export default function MapItWindowChrome() {
  const [maximized, setMaximized] = useState(false);
  const version = useAppVersion();
  useEffect(() => subscribeToCurrentWindowState(state => setMaximized(isWindowMaximizedState(state))), []);

  return <DashboardWindowChrome
    maximized={maximized}
    version={version}
    onMinimize={minimizeCurrentWindow}
    onMaximize={toggleCurrentWindowMaximize}
    onClose={closeCurrentWindow}
    bindDrag={bindDragMoveElement}
  />;
}
