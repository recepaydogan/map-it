import {
  getOpenWindow,
  OVERLAY_MAP_WINDOW,
} from "../../overwolf-utils/window-manager";

export const OVERLAY_INPUT_LOCK_STORAGE_KEY = "gm:overlay-input-locked";
const MINIMAP_REFERENCE_RESOLUTION = { width: 1920, height: 1080 };
const MINIMAP_BASE_SIZE = { width: 360, height: 280 };
const MINIMAP_MIN_SIZE = { width: 260, height: 200 };
const MINIMAP_MAX_SIZE = { width: 640, height: 520 };
const MINIMAP_EDGE_MARGIN = 24;
export const OVERLAY_INPUT_LOCK_EVENT = "gm:overlay-input-lock-changed";

type GameResolution = Pick<overwolf.games.RunningGameInfo,
  "isRunning" | "width" | "height" | "logicalWidth" | "logicalHeight">;

export interface OverlayMinimapLayout {
  width: number;
  height: number;
  left: number;
  top: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Scale from the game's logical client area, not the desktop monitor. */
export const calculateOverlayMinimapLayout = (gameWidth: number, gameHeight: number): OverlayMinimapLayout => {
  const scale = Math.min(
    gameWidth / MINIMAP_REFERENCE_RESOLUTION.width,
    gameHeight / MINIMAP_REFERENCE_RESOLUTION.height,
  );
  const margin = clamp(Math.round(MINIMAP_EDGE_MARGIN * scale), 8, MINIMAP_EDGE_MARGIN);
  const width = Math.min(
    clamp(Math.round(MINIMAP_BASE_SIZE.width * scale), MINIMAP_MIN_SIZE.width, MINIMAP_MAX_SIZE.width),
    Math.max(MINIMAP_MIN_SIZE.width, gameWidth - margin * 2),
  );
  const height = Math.min(
    clamp(Math.round(MINIMAP_BASE_SIZE.height * scale), MINIMAP_MIN_SIZE.height, MINIMAP_MAX_SIZE.height),
    Math.max(MINIMAP_MIN_SIZE.height, gameHeight - margin * 2),
  );
  return {
    width,
    height,
    left: Math.max(margin, gameWidth - width - margin),
    top: margin,
  };
};

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

const readRunningGame = (): Promise<GameResolution | null> => new Promise(resolve => {
  overwolf.games.getRunningGameInfo(info => resolve(info?.isRunning ? info as GameResolution : null));
});

/** Keep the minimap proportional and docked top-right as the game client resizes. */
export const layoutOverlayMinimap = async (candidate?: GameResolution | null): Promise<void> => {
  if (typeof overwolf === "undefined") return;
  const [overlayWindow, game] = await Promise.all([
    getOpenWindow(OVERLAY_MAP_WINDOW).catch(() => null),
    candidate ? Promise.resolve(candidate) : readRunningGame().catch(() => null),
  ]);
  if (!overlayWindow || !game?.isRunning) return;

  const gameWidth = Number.isFinite(game.logicalWidth) && game.logicalWidth > 0 ? game.logicalWidth : game.width;
  const gameHeight = Number.isFinite(game.logicalHeight) && game.logicalHeight > 0 ? game.logicalHeight : game.height;
  if (!Number.isFinite(gameWidth) || !Number.isFinite(gameHeight) || gameWidth <= 0 || gameHeight <= 0) return;
  const layout = calculateOverlayMinimapLayout(gameWidth, gameHeight);

  await new Promise<void>((resolve, reject) => {
    overwolf.windows.changeSize(
      { window_id: overlayWindow.id, width: layout.width, height: layout.height, auto_dpi_resize: true },
      result => result.success ? resolve() : reject(new Error(result.error ?? "Overlay minimap resize failed")),
    );
  });
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.changePosition(overlayWindow.id, layout.left, layout.top,
      result => result.success ? resolve() : reject(new Error(result.error ?? "Overlay minimap positioning failed")));
  });
};

export const initializeOverlayMinimap = async (): Promise<void> => {
  if (typeof overwolf === "undefined") return;

  // Start interactive: the InputPassThrough style lives on the OS window and a
  // recreated minimap must be drag/resize-able again. An earlier build force-
  // locked input as a cursor-hook workaround and PERSISTED that lock, so apply
  // unlocked here rather than the stored flag.
  await setOverlayMapInputLocked(false);
  await layoutOverlayMinimap().catch(error => console.error("[Overlay] Unable to apply responsive minimap layout", error));
};
