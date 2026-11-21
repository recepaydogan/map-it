/**
 * Game-launch monitor switch
 *
 * Runs in the MAIN window only: the dashboard listens for game launches and moves ITSELF
 * to the other monitor whenever it shares one with the game.
 */

import { APP_CONFIG } from "../config/app-config";
import { getPreferences } from "../state/preferences-store";


const AUTO_MOVE_PROBE_INTERVAL_MS = 500;
const AUTO_MOVE_PROBE_ATTEMPTS = 16;
const AUTO_MOVE_SETUP_RETRY_MS = 250;
const AUTO_MOVE_SETUP_ATTEMPTS = 20;
const AUTO_MOVE_VERIFY_DELAY_MS = 900;
const AUTO_MOVE_VERIFY_ATTEMPTS = 2;

const MAIN_WINDOW_MIN_WIDTH = 1300;
const MAIN_WINDOW_MIN_HEIGHT = 840;

function isTargetGameInfo(gameInfo: any): boolean {
  if (!gameInfo) return false;
  const gameId = gameInfo.classId || Math.floor(gameInfo.id / 10);
  return gameId === APP_CONFIG.supportedGameId;
}

let autoMoveSetupAttempts = 0;
let autoMoveSetupStarted = false;
let autoMoveListenersRegistered = false;
let gameAutoMoveProbeTimer: number | null = null;
let lastGameAutoMoveSourceKey: string | null = null;

const debugLog = (message: string, data?: unknown): void => {
  if (data === undefined) {
    console.log(`[MonitorSwitch] ${message}`);
    return;
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    serialized = String(data);
  }
  console.log(`[MonitorSwitch] ${message}`, serialized);
};

/* ── verbatim geometry helpers ────────────────────────────── */

function toNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getDisplayScale(display: any): number {
  const scale = toNumber(display?.dpiX, 96) / 96;
  return scale > 0 ? scale : 1;
}

function getDisplayBounds(display: any) {
  const scale = getDisplayScale(display);
  const left = toNumber(display?.logicalX, toNumber(display?.x, 0));
  const top = toNumber(display?.logicalY, toNumber(display?.y, 0));
  const width = Math.floor(
    toNumber(display?.logicalWidth, toNumber(display?.width, MAIN_WINDOW_MIN_WIDTH) / scale),
  );
  const height = Math.floor(
    toNumber(display?.logicalHeight, toNumber(display?.height, MAIN_WINDOW_MIN_HEIGHT) / scale),
  );

  return { left, top, width, height, right: left + width, bottom: top + height };
}

function getAreaOverlap(
  a: ReturnType<typeof getDisplayBounds>,
  b: ReturnType<typeof getDisplayBounds>,
): number {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function getWindowRect(windowInfo: any) {
  return {
    left: toNumber(windowInfo?.left, window.screenX ?? 0),
    top: toNumber(windowInfo?.top, window.screenY ?? 0),
    width: toNumber(windowInfo?.width, MAIN_WINDOW_MIN_WIDTH),
    height: toNumber(windowInfo?.height, MAIN_WINDOW_MIN_HEIGHT),
  };
}

function findMonitorForWindow(windowInfo: any, displays: any[]): any | null {
  const currentMonitorId = windowInfo?.monitorId;
  if (currentMonitorId) {
    const monitorById = displays.find((display) => display?.id === currentMonitorId);
    if (monitorById) return monitorById;
  }

  const rect = getWindowRect(windowInfo);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return (
    displays.find((display) => {
      const bounds = getDisplayBounds(display);
      return (
        centerX >= bounds.left &&
        centerX <= bounds.right &&
        centerY >= bounds.top &&
        centerY <= bounds.bottom
      );
    }) ||
    displays.find((display) => display?.is_primary) ||
    displays[0] ||
    null
  );
}

function getMonitorId(monitor: any): string | null {
  return typeof monitor?.id === "string" && monitor.id.length > 0 ? monitor.id : null;
}

function isSameMonitor(a: any, b: any): boolean {
  if (!a || !b) return false;
  const aId = getMonitorId(a);
  const bId = getMonitorId(b);
  if (aId && bId) return aId === bId;
  return a === b || a?.handle?.value === b?.handle?.value;
}

function windowOverlapsMonitor(windowInfo: any, monitor: any): boolean {
  const rect = getWindowRect(windowInfo);
  const windowBounds = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
  };

  return getAreaOverlap(windowBounds, getDisplayBounds(monitor)) > 0;
}

function getLaunchSource(event?: any): string {
  const rawOrigin =
    typeof event === "string"
      ? event
      : event?.origin || event?.parameter || event?.url || window.location.href;

  try {
    const url = new URL(String(rawOrigin));
    return url.searchParams.get("source") || String(event?.origin || "");
  } catch {
    return String(event?.origin || rawOrigin || "");
  }
}

function shouldReactToLaunchTrigger(event?: any): boolean {
  const source = getLaunchSource(event).toLowerCase();
  return source === "gamelaunchevent" || source.includes("source=gamelaunchevent");
}

function clearTimer(timer: number | null): null {
  if (timer !== null) {
    window.clearTimeout(timer);
  }
  return null;
}

function getOw(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).overwolf ?? null;
}

function restoreIfHidden(callback: () => void): void {
  const ow = getOw();
  if (!ow?.windows) return;

  ow.windows.obtainDeclaredWindow(APP_CONFIG.mainWindowName, (result: any) => {
    const state = String(result?.window?.stateEx ?? result?.window?.state ?? "").toLowerCase();
    const isHidden =
      !result?.window || state === "minimized" || state === "hidden" || state === "closed";
    if (!isHidden) {
      callback();
      return;
    }
    ow.windows.restore(APP_CONFIG.mainWindowName, () => callback());
  });
}

function restoreAndFocusWindow(): void {
  restoreIfHidden(() => {
    surfaceMainWindow();
  });
}

export function setupGameLaunchMonitorSwitch(): void {
  const ow = getOw();
  if (!ow?.utils?.getMonitorsList || !ow?.windows) {
    if (autoMoveSetupAttempts >= AUTO_MOVE_SETUP_ATTEMPTS) {
      debugLog("auto-move setup unavailable", { attempts: autoMoveSetupAttempts });
      return;
    }
    autoMoveSetupAttempts += 1;
    window.setTimeout(setupGameLaunchMonitorSwitch, AUTO_MOVE_SETUP_RETRY_MS);
    return;
  }

  if (autoMoveListenersRegistered) {
    startGameAutoMoveProbe("setup-refresh");
    return;
  }
  if (autoMoveSetupStarted) return;
  autoMoveSetupStarted = true;

  ow.windows.getCurrentWindow((result: any) => {
    const currentWindowName = String(result?.window?.name ?? "");
    if (currentWindowName && currentWindowName !== APP_CONFIG.mainWindowName) {
      debugLog("auto-move disabled outside the main window", {
        window: currentWindowName,
      });
      return;
    }
    registerGameLaunchListeners(ow);
  });
}

function registerGameLaunchListeners(ow: any): void {
  if (autoMoveListenersRegistered) return;
  autoMoveListenersRegistered = true;
  debugLog("auto-move setup ready", { href: window.location.href });

  startGameAutoMoveProbe("startup");

  if (ow?.games?.onGameLaunched) {
    ow.games.onGameLaunched.addListener((gameInfo: any) => {
      if (!moveToOtherMonitorByGameInfo(gameInfo, "onGameLaunched")) {
        startGameAutoMoveProbe("onGameLaunched");
      }
    });
  }

  if (ow?.games?.onGameInfoUpdated) {
    ow.games.onGameInfoUpdated.addListener((event: any) => {
      const gameInfo = event?.gameInfo || event;
      if (gameInfo?.isRunning) {
        moveToOtherMonitorByGameInfo(gameInfo, "onGameInfoUpdated");
      }
    });
  }

  if (ow?.extensions?.onAppLaunchTriggered) {
    ow.extensions.onAppLaunchTriggered.addListener((event: any) => {
      if (!shouldReactToLaunchTrigger(event)) return;
      restoreAndFocusWindow();
      startGameAutoMoveProbe("appLaunchTriggered");
    });
  }
}

function startGameAutoMoveProbe(reason: string): void {
  if (typeof window === "undefined") return;
  gameAutoMoveProbeTimer = clearTimer(gameAutoMoveProbeTimer);

  let attempts = 0;
  const runProbe = () => {
    attempts += 1;
    moveForRunningGame(reason, (moved) => {
      if (moved || attempts >= AUTO_MOVE_PROBE_ATTEMPTS) {
        gameAutoMoveProbeTimer = null;
        return;
      }
      gameAutoMoveProbeTimer = window.setTimeout(runProbe, AUTO_MOVE_PROBE_INTERVAL_MS);
    });
  };

  runProbe();
}

function moveForRunningGame(reason: string, callback?: (moved: boolean) => void): void {
  const ow = getOw();
  const getRunningGameInfo = ow?.games?.getRunningGameInfo2 || ow?.games?.getRunningGameInfo;
  if (!getRunningGameInfo) {
    callback?.(false);
    return;
  }

  getRunningGameInfo((result: any) => {
    const gameInfo = result?.gameInfo !== undefined ? result.gameInfo : result;
    callback?.(moveToOtherMonitorByGameInfo(gameInfo, reason));
  });
}

function moveToOtherMonitorByGameInfo(gameInfo: any, reason: string): boolean {
  if (!gameInfo?.monitorHandle) return false;
  if (!isTargetGameInfo(gameInfo)) return false;

  const sourceKey = `game:${gameInfo?.processId || gameInfo?.gameProcessId || gameInfo?.id || gameInfo?.classId || gameInfo.monitorHandle.value}`;
  if (lastGameAutoMoveSourceKey === sourceKey) {
    return true;
  }

  lastGameAutoMoveSourceKey = sourceKey;
  debugLog("auto move by game", { reason, sourceKey });
  moveToOtherMonitor(gameInfo.monitorHandle, sourceKey);
  return true;
}

function surfaceMainWindow(): void {
  const ow = getOw();
  if (!ow?.windows) return;
  ow.windows.obtainDeclaredWindow(APP_CONFIG.mainWindowName, (result: any) => {
    if (!result.success) return;
    const id = result.window.id;
    ow.windows.bringToFront(id, true, () => {});
    if (ow.windows.setTopmost) {
      ow.windows.setTopmost(id, true, () => {});
      setTimeout(() => ow.windows.setTopmost(id, false, () => {}), 1200);
    }
  });
}

function centerWindowOnMonitor(windowName: string, monitor: any): void {
  const ow = getOw();
  if (!ow?.windows) return;
  
  ow.windows.obtainDeclaredWindow(windowName, (result: any) => {
    if (!result.success) return;
    const win = result.window;
    
    // Unmaximize if needed
    if (win.stateEx === "maximized") {
      ow.windows.restore(win.id, () => {
        setTimeout(() => performMove(), 100);
      });
    } else {
      performMove();
    }
    
    function performMove() {
      const bounds = getDisplayBounds(monitor);
      const width = win.width || MAIN_WINDOW_MIN_WIDTH;
      const height = win.height || MAIN_WINDOW_MIN_HEIGHT;
      const left = Math.round(bounds.left + (bounds.width - width) / 2);
      const top = Math.round(bounds.top + (bounds.height - height) / 2);
      
      ow.windows.changePosition(win.id, left, top, () => {});
    }
  });
}

function runGameLaunchResponse(
  findSourceMonitor: (displays: any[]) => any | null,
  sourceKey?: string,
): void {
  const ow = getOw();
  if (!ow?.windows) return;

  // Single-monitor players do not want the window yanked around, so the hand-off
  // is a preference. It is read here rather than at setup so turning it off
  // mid-session takes effect without re-registering the launch listeners.
  if (!getPreferences().moveWindowOffGameMonitor) {
    debugLog("auto move disabled by preference", { sourceKey });
    markAutoMoveSourceHandled(sourceKey);
    return;
  }

  restoreIfHidden(() => {
    if (ow.utils?.getMonitorsList) {
      ow.utils.getMonitorsList((result: any) => {
        const displays = result?.displays;
        if (!Array.isArray(displays) || displays.length < 2) {
          markAutoMoveSourceHandled(sourceKey);
          return;
        }

        const sourceMonitor = findSourceMonitor(displays);
        if (!sourceMonitor) {
          markAutoMoveSourceHandled(sourceKey);
          return;
        }

        const targetMonitor = displays.find((display: any) => display !== sourceMonitor);
        if (!targetMonitor) {
          markAutoMoveSourceHandled(sourceKey);
          return;
        }

        moveCurrentWindowAwayFromSourceMonitor(
          sourceMonitor,
          targetMonitor,
          displays,
          sourceKey,
        );
      });
    } else {
      markAutoMoveSourceHandled(sourceKey);
    }

    surfaceMainWindow();
  });
}

function moveToOtherMonitor(gameMonitorHandle: any, sourceKey?: string): void {
  runGameLaunchResponse(
    (displays) =>
      displays.find((display: any) => display.handle?.value === gameMonitorHandle?.value) ||
      displays[0],
    sourceKey,
  );
}

function markAutoMoveSourceHandled(sourceKey?: string): void {
  if (!sourceKey) return;
  lastGameAutoMoveSourceKey = sourceKey;
}

function releaseAutoMoveSource(sourceKey?: string): void {
  if (sourceKey && lastGameAutoMoveSourceKey === sourceKey) {
    lastGameAutoMoveSourceKey = null;
  }
}

function verifyAutoMoveLanded(
  sourceMonitor: any,
  targetMonitor: any,
  displays: any[],
  sourceKey: string | undefined,
  attemptsLeft: number,
): void {
  window.setTimeout(() => {
    const ow = getOw();
    if (!ow?.windows) return;

    ow.windows.getCurrentWindow((result: any) => {
      const currentWindow = result?.window;
      if (!currentWindow) return;

      const currentMonitor = findMonitorForWindow(currentWindow, displays);
      const stillOnSource =
        isSameMonitor(currentMonitor, sourceMonitor) ||
        windowOverlapsMonitor(currentWindow, sourceMonitor);

      if (!stillOnSource) {
        debugLog("auto move landed", {
          sourceKey,
          targetMonitorId: getMonitorId(targetMonitor),
        });
        return;
      }

      if (attemptsLeft <= 0) {
        debugLog("auto move gave up: window still on the game monitor", { sourceKey });
        return;
      }

      debugLog("auto move retry: window still on the game monitor", {
        sourceKey,
        attemptsLeft,
      });
      
      centerWindowOnMonitor(APP_CONFIG.mainWindowName, targetMonitor);
      
      verifyAutoMoveLanded(
        sourceMonitor,
        targetMonitor,
        displays,
        sourceKey,
        attemptsLeft - 1,
      );
    });
  }, AUTO_MOVE_VERIFY_DELAY_MS);
}

function moveCurrentWindowAwayFromSourceMonitor(
  sourceMonitor: any,
  targetMonitor: any,
  displays: any[],
  sourceKey?: string,
): void {
  const ow = getOw();
  if (!ow?.windows) return;

  ow.windows.getCurrentWindow((result: any) => {
    const currentWindow = result?.window;
    if (!currentWindow) {
      releaseAutoMoveSource(sourceKey);
      return;
    }

    const currentMonitor = findMonitorForWindow(currentWindow, displays);
    const isOnSourceMonitor =
      isSameMonitor(currentMonitor, sourceMonitor) ||
      windowOverlapsMonitor(currentWindow, sourceMonitor);

    if (!isOnSourceMonitor) {
      debugLog("auto move skipped: window already off source monitor");
      markAutoMoveSourceHandled(sourceKey);
      return;
    }

    markAutoMoveSourceHandled(sourceKey);
    
    centerWindowOnMonitor(APP_CONFIG.mainWindowName, targetMonitor);
    
    verifyAutoMoveLanded(
      sourceMonitor,
      targetMonitor,
      displays,
      sourceKey,
      AUTO_MOVE_VERIFY_ATTEMPTS,
    );
  });
}
