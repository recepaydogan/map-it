import {
  getGameMonitorBounds,
  getOpenWindow,
  OVERLAY_MAP_WINDOW,
} from "../../overwolf-utils/window-manager";

export const OVERLAY_INPUT_LOCK_STORAGE_KEY = "gm:overlay-input-locked";
const MINIMAP_LAYOUT_VERSION_KEY = "gm:overlay-minimap-layout-version";
const MINIMAP_LAYOUT_VERSION = "1";
const MINIMAP_EDGE_MARGIN = 24;
// Where the minimap lands the first time it opens. There is no size preference:
// players drag the top-left handle for a custom fit and Overwolf remembers it.
const MINIMAP_DEFAULT_SIZE = { width: 360, height: 280 };
export const OVERLAY_INPUT_LOCK_EVENT = "gm:overlay-input-lock-changed";

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

/** Parks a freshly created minimap bottom-right on the game monitor at its
 * default size. Runs once per layout version — after that the player's own
 * drag/resize wins. */
const placeMinimap = async (): Promise<void> => {
  const [overlayWindow, monitor] = await Promise.all([
    getOpenWindow(OVERLAY_MAP_WINDOW).catch(() => null),
    getGameMonitorBounds().catch(() => null),
  ]);
  if (!overlayWindow || !monitor) return;

  const width = Math.min(MINIMAP_DEFAULT_SIZE.width, monitor.width);
  const height = Math.min(MINIMAP_DEFAULT_SIZE.height, monitor.height);
  const left = Math.round(monitor.right - width - MINIMAP_EDGE_MARGIN);
  const top = Math.round(monitor.bottom - height - MINIMAP_EDGE_MARGIN);

  await new Promise<void>((resolve) => {
    overwolf.windows.changeSize(
      { window_id: overlayWindow.id, width, height, auto_dpi_resize: true },
      () => resolve(),
    );
  });
  await new Promise<void>((resolve) => {
    overwolf.windows.changePosition(overlayWindow.id, left, top, () => resolve());
  });
};

export const initializeOverlayMinimap = async (): Promise<void> => {
  if (typeof overwolf === "undefined") return;

  // Start interactive: the InputPassThrough style lives on the OS window and a
  // recreated minimap must be drag/resize-able again. An earlier build force-
  // locked input as a cursor-hook workaround and PERSISTED that lock, so apply
  // unlocked here rather than the stored flag.
  await setOverlayMapInputLocked(false);
  if (localStorage.getItem(MINIMAP_LAYOUT_VERSION_KEY) === MINIMAP_LAYOUT_VERSION) return;

  await placeMinimap();
  localStorage.setItem(MINIMAP_LAYOUT_VERSION_KEY, MINIMAP_LAYOUT_VERSION);
};
