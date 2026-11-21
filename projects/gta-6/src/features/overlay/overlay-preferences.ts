import { isTargetGame } from "../../game-config";
import { getOpenWindow, OVERLAY_MAP_WINDOW } from "../../overwolf-utils/window-manager";

export const OVERLAY_INPUT_LOCK_STORAGE_KEY = "gta6-app:overlay-input-locked";
const MINIMAP_LAYOUT_VERSION_KEY = "gta6-app:overlay-minimap-layout-version";
const MINIMAP_LAYOUT_VERSION = "2";
const MINIMAP_EDGE_MARGIN = 20;
// Where the minimap lands the first time it opens. Players can resize it from
// any edge afterward, and Overwolf remembers their chosen bounds.
const MINIMAP_DEFAULT_SIZE = { width: 360, height: 360 };
export const OVERLAY_INPUT_LOCK_EVENT = "gta6-app:overlay-input-lock-changed";

export const readOverlayInputLocked = () =>
  localStorage.getItem(OVERLAY_INPUT_LOCK_STORAGE_KEY) === "true";

const writeInputLocked = (locked: boolean) => {
  localStorage.setItem(OVERLAY_INPUT_LOCK_STORAGE_KEY, String(locked));
  window.dispatchEvent(new Event(OVERLAY_INPUT_LOCK_EVENT));
};

export const setOverlayMapInputLocked = async (locked: boolean): Promise<boolean> => {
  if (typeof overwolf === "undefined") {
    writeInputLocked(locked);
    return true;
  }
  const overlayWindow = await getOpenWindow(OVERLAY_MAP_WINDOW).catch(() => null);
  if (!overlayWindow) {
    writeInputLocked(false);
    return false;
  }

  const style = "InputPassThrough" as overwolf.windows.enums.WindowStyle;
  const success = await new Promise<boolean>((resolve) => {
    const callback = (result: { success: boolean }) => resolve(result.success);
    if (locked) overwolf.windows.setWindowStyle(overlayWindow.id, style, callback);
    else overwolf.windows.removeWindowStyle(overlayWindow.id, style, callback);
  });
  if (success) writeInputLocked(locked);
  return success;
};

export const unlockOverlayMapInput = () => setOverlayMapInputLocked(false);

/** Place new minimaps once game-relative dimensions become available. Only a
 * successful resize and move marks placement complete; user's later bounds win. */
export const initializeOverlayMinimap = (): (() => void) => {
  if (typeof overwolf === "undefined") return () => {};
  void setOverlayMapInputLocked(false);
  let disposed = false;
  let inFlight = false;
  let timer: number | undefined;
  const stopRetrying = () => {
    window.clearInterval(timer);
    timer = undefined;
  };
  const tryPlace = () => {
    if (disposed || inFlight) return;
    if (localStorage.getItem(MINIMAP_LAYOUT_VERSION_KEY) === MINIMAP_LAYOUT_VERSION) {
      stopRetrying();
      return;
    }
    inFlight = true;
    overwolf.games.getRunningGameInfo((game) => {
      const width = game?.logicalWidth || game?.width;
      const height = game?.logicalHeight || game?.height;
      if (disposed || !game?.isRunning || !isTargetGame(game) || !width || !height) {
        inFlight = false;
        return;
      }
      overwolf.windows.getCurrentWindow((result) => {
        if (disposed) { inFlight = false; return; }
        if (!result.success) { inFlight = false; return; }
        const current = result.window;
        const wasPlaced = localStorage.getItem(MINIMAP_LAYOUT_VERSION_KEY) === "1";
        const centered = Math.abs(current.left - (width - current.width) / 2) < 80
          && Math.abs(current.top - (height - current.height) / 2) < 80;
        if (wasPlaced && !centered) {
          localStorage.setItem(MINIMAP_LAYOUT_VERSION_KEY, MINIMAP_LAYOUT_VERSION);
          stopRetrying();
          inFlight = false;
          return;
        }
        const side = Math.min(MINIMAP_DEFAULT_SIZE.width, width, height);
        overwolf.windows.changeSize({
          window_id: current.id, width: side, height: side, auto_dpi_resize: true,
        }, (sized) => {
          if (disposed) { inFlight = false; return; }
          if (!sized.success) { inFlight = false; return; }
          overwolf.windows.changePosition(current.id,
            Math.max(0, width - side - MINIMAP_EDGE_MARGIN),
            Math.max(0, height - side - MINIMAP_EDGE_MARGIN),
            (moved) => {
              if (!disposed && moved.success) {
                localStorage.setItem(MINIMAP_LAYOUT_VERSION_KEY, MINIMAP_LAYOUT_VERSION);
                stopRetrying();
              }
              inFlight = false;
            });
        });
      });
    });
  };
  timer = window.setInterval(tryPlace, 500);
  tryPlace();
  return () => { disposed = true; stopRetrying(); };
};
