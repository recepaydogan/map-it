import { getLivePosition, subscribeLivePosition } from "../live-position/live-position-store";
import { collapseInGameApp, getOpenWindow, hideWindow, IN_GAME_WINDOW, OVERLAY_MAP_WINDOW, restoreWindow } from "../../overwolf-utils/window-manager";

const DISMISSED_PROCESS_KEY = "gm:minimap-dismissed-process";

export const hideMinimapForSession = async () => {
  const processId = getLivePosition().processId;
  if (processId) localStorage.setItem(DISMISSED_PROCESS_KEY, String(processId));
  await hideWindow(OVERLAY_MAP_WINDOW);
};

/** One auto-open per game process; hiding never fights the next position poll. */
export const startMinimapLifecycle = () => {
  let running = false;
  let disposed = false;
  let openedProcess = 0;
  let busy = false;
  let generation = 0;
  let fullAppVisible = false;
  let fullAppKnown = false;
  let fullAppRevision = 0;
  let retryAfter = 0;
  const open = async () => {
    const request = generation;
    await restoreWindow(OVERLAY_MAP_WINDOW);
    if (disposed || !running || fullAppVisible || request !== generation) await hideWindow(OVERLAY_MAP_WINDOW);
  };
  const autoOpen = () => {
    const live = getLivePosition();
    if (disposed || !running || !fullAppKnown || fullAppVisible || busy || Date.now() < retryAfter || live.state !== "tracking" || !live.processId || !live.point
      || Date.now() - live.timestamp >= 3000 || openedProcess === live.processId
      || localStorage.getItem(DISMISSED_PROCESS_KEY) === String(live.processId)) return;
    openedProcess = live.processId;
    busy = true;
    void open().catch(error => {
      openedProcess = 0;
      retryAfter = Date.now() + 5000;
      console.error("[Minimap] auto-open", error);
    }).finally(() => { busy = false; });
  };
  const unsubscribe = subscribeLivePosition(autoOpen);
  // The compact window must never cover the full app's ad rail.
  const setFullAppVisible = (visible: boolean) => {
    if (disposed) return;
    const wasKnown = fullAppKnown;
    fullAppKnown = true;
    if (wasKnown && visible === fullAppVisible) return;
    fullAppVisible = visible;
    generation++;
    if (visible) {
      void getOpenWindow(OVERLAY_MAP_WINDOW).then(current => current ? hideWindow(OVERLAY_MAP_WINDOW) : undefined)
        .catch(error => console.error("[Minimap] full-app-hide", error));
    } else { openedProcess = 0; autoOpen(); }
  };
  const onWindowState = (event: overwolf.windows.WindowStateChangedEvent) => {
    if (event.window_name === IN_GAME_WINDOW) {
      fullAppRevision++;
      setFullAppVisible(["normal", "maximized"].includes(event.window_state_ex ?? event.window_state));
    }
  };
  overwolf.windows.onStateChanged.addListener(onWindowState);
  const initialRevision = fullAppRevision;
  void getOpenWindow(IN_GAME_WINDOW).then(current => {
    if (fullAppRevision === initialRevision) setFullAppVisible(!!current && ["normal", "maximized"].includes(current.stateEx ?? current.state));
  }).catch(error => console.error("[Minimap] full-app-state", error));
  return {
    setGameRunning(value: boolean) {
      running = value;
      generation++;
      if (running) autoOpen();
      else {
        openedProcess = 0;
        localStorage.removeItem(DISMISSED_PROCESS_KEY);
        void getOpenWindow(OVERLAY_MAP_WINDOW).then(current => current ? hideWindow(OVERLAY_MAP_WINDOW) : undefined)
          .catch(error => console.error("[Minimap] game-exit", error));
      }
    },
    async toggle() {
      if (!running || busy || disposed) return;
      busy = true;
      try {
        if (fullAppVisible) { await collapseInGameApp(); setFullAppVisible(false); }
        const current = await getOpenWindow(OVERLAY_MAP_WINDOW);
        if (current && ["normal", "maximized"].includes(current.stateEx ?? current.state)) await hideMinimapForSession();
        else {
          localStorage.removeItem(DISMISSED_PROCESS_KEY);
          openedProcess = getLivePosition().processId ?? 0;
          await open();
        }
      } catch (error) { console.error("[Minimap] toggle", error); }
      finally { busy = false; }
    },
    stop() { disposed = true; generation++; unsubscribe(); overwolf.windows.onStateChanged.removeListener(onWindowState); },
  };
};
