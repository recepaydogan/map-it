/**
 * Game-launch monitor switch — ported from BF6's proven implementation
 * (itself ported from wedraft's setupGameLaunchMonitorSwitch). Runs in the
 * MAIN window only: the dashboard listens for game launches and moves ITSELF
 * to the other monitor whenever it shares one with the game.
 *
 * Why this lives in the main window (not the background): the game's
 * `monitorHandle` can arrive up to ~8s AFTER the launch event fires (the game
 * window doesn't exist yet). A single background read almost always sees a
 * `null` handle and gives up — which is exactly why the old one-shot
 * `restoreWindowAwayFromGameMonitor` never moved the app to the second screen.
 * This engine instead PROBES `getRunningGameInfo` every 500ms (up to 16 tries)
 * until the handle is known, and also runs a startup probe so it works even
 * when the game is already running when the app opens.
 *
 * Behavior contract (identical to BF6 / wedraft):
 *  - probe getRunningGameInfo every 500ms (max 16 attempts) until the game's
 *    monitorHandle is known — covers the launch race where the game window
 *    doesn't exist yet.
 *  - the auto-move runs ONCE per game process (sourceKey dedup), so the user
 *    can freely reposition the window afterwards without it being yanked back.
 *  - move only when >=2 monitors and the window is on (or overlaps) the game's
 *    monitor; the game monitor falls back to the first display when the handle
 *    matches nothing.
 *  - restore + bring to front on multiple monitors; on one monitor the
 *    background opens main behind the game until it exits.
 */

/* eslint-disable @typescript-eslint/no-explicit-any --
 * Verbatim port of BF6's/wedraft's untyped implementation; staying line-for-line
 * identical with the proven code matters more than typing here. */

import { isTargetGame } from "../game-config";
import { getLaunchPreferences } from "../features/settings/launch-preferences";
import {
  MAIN_WINDOW_MIN_HEIGHT,
  MAIN_WINDOW_MIN_WIDTH,
  bringWindowToFront,
  cancelMainWindowBoundsCorrection,
  centerWindowOnMonitor,
  surfaceWindowOverExternalApp,
  type MonitorInfo,
} from "./window-manager";

const MAIN_WINDOW_NAME = "main";
const AUTO_MOVE_PROBE_INTERVAL_MS = 500;
const AUTO_MOVE_PROBE_ATTEMPTS = 16;
const AUTO_MOVE_SETUP_RETRY_MS = 250;
const AUTO_MOVE_SETUP_ATTEMPTS = 20;
/**
 * The move is a long async chain (restore → wait for the un-maximize to land →
 * resize → reposition → re-maximize). Re-read the window once it has had time
 * to settle and run it again if it is still sharing the game's monitor —
 * Overwolf drops geometry commands often enough that a single attempt is not a
 * guarantee. Bounded, so a user who deliberately drags the window back is only
 * ever fought within this short window.
 */
const AUTO_MOVE_VERIFY_DELAY_MS = 900;
const AUTO_MOVE_VERIFY_ATTEMPTS = 2;

// Every game callback fires for any running game, so each move funnels through
// `isTargetGame` — without it the dashboard would relocate itself whenever any
// unrelated game launched.

let autoMoveSetupAttempts = 0;
let autoMoveSetupStarted = false;
let autoMoveListenersRegistered = false;
let gameAutoMoveProbeTimer: number | null = null;
let lastGameAutoMoveSourceKey: string | null = null;

/* Logging is always on: Overwolf persists the console under
 * %LOCALAPPDATA%\Overwolf\Log\Apps, so a wrong monitor decision stays
 * diagnosable from a user log. */
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

/* ── verbatim geometry helpers from wedraft ────────────────────────────── */

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

/* ── orchestration, verbatim from wedraft (game path only) ─────────────── */

function getOw(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).overwolf ?? null;
}

/**
 * Restore ONLY when the window is actually hidden (minimized/hidden/closed),
 * then continue. `overwolf.windows.restore` on a MAXIMIZED window UN-maximizes
 * it back to its saved bounds, so the old unconditional restore stripped the
 * user's fullscreen state on every game launch — and left the move engine
 * racing its own un-maximize.
 */
function restoreIfHidden(callback: () => void): void {
  const ow = getOw();
  if (!ow?.windows) return;

  ow.windows.obtainDeclaredWindow(MAIN_WINDOW_NAME, (result: any) => {
    const state = String(result?.window?.stateEx ?? result?.window?.state ?? "").toLowerCase();
    const isHidden =
      !result?.window || state === "minimized" || state === "hidden" || state === "closed";
    if (!isHidden) {
      callback();
      return;
    }
    ow.windows.restore(MAIN_WINDOW_NAME, () => callback());
  });
}

/**
 * Register the game-launch listeners and run the startup probes. The engine
 * only ever arms itself in the MAIN window (the window moves itself) — calling
 * it from any other window is a no-op, so a shared entry point can call it
 * unconditionally. Safe to call again — the second call only refreshes the
 * probe.
 */
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

  // index.html is shared by every window, so this must never arm itself outside
  // the desktop window. From any other context `getCurrentWindow` returns THAT
  // window — an overlay window's coordinates are relative to the game and
  // therefore always read as "on the game's monitor" — and that copy would
  // issue its own competing restore / resize / move / maximize commands against
  // `main` while the real main-window copy is mid-sequence.
  ow.windows.getCurrentWindow((result: any) => {
    const currentWindowName = String(result?.window?.name ?? "");
    if (currentWindowName && currentWindowName !== MAIN_WINDOW_NAME) {
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
      debugLog("onGameLaunched", {
        classId: gameInfo?.classId,
        processId: gameInfo?.processId,
        monitorHandle: gameInfo?.monitorHandle,
      });
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
      debugLog("onAppLaunchTriggered", event);
      if (!shouldReactToLaunchTrigger(event)) return;

      cancelMainWindowBoundsCorrection(MAIN_WINDOW_NAME);
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
    debugLog("running game API unavailable", { reason });
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
  // onGameLaunched / onGameInfoUpdated / the getRunningGameInfo probe all funnel
  // here and all fire for ANY running game — so without this guard the dashboard
  // would be restored + repositioned whenever any game starts. Act only for the
  // targeted game process.
  if (!isTargetGame(gameInfo)) return false;
  if (!getLaunchPreferences().autoOpenAppWithGame) return false;

  const sourceKey = `game:${gameInfo?.processId || gameInfo?.gameProcessId || gameInfo?.id || gameInfo?.classId || gameInfo.monitorHandle.value}`;
  if (lastGameAutoMoveSourceKey === sourceKey) {
    return true;
  }

  // Claim the key SYNCHRONOUSLY. `onGameInfoUpdated` fires repeatedly while a
  // game boots and the response is a long async chain, so leaving the claim to
  // the callbacks deep inside `runGameLaunchResponse` let several runs start at
  // once — each one bumping the bounds-correction token that invalidates the
  // previous run mid-restore, which is exactly how a maximized window ended up
  // un-maximized on the game's monitor and never moved.
  lastGameAutoMoveSourceKey = sourceKey;

  debugLog("auto move by game", { reason, sourceKey });
  moveToOtherMonitor(gameInfo.monitorHandle, sourceKey);
  return true;
}

function surfaceMainWindow(): void {
  // A launching game grabs the OS foreground, and Windows' foreground lock then
  // stops a plain bringToFront from raising us above it — the window stays
  // buried even though it's already open (e.g. on the second monitor). Pulse
  // topmost instead: a pure z-order lift that isn't subject to the lock, then
  // release the pin so we never get stuck always-on-top.
  void surfaceWindowOverExternalApp(MAIN_WINDOW_NAME).catch(() => {
    void bringWindowToFront(MAIN_WINDOW_NAME).catch(() => {});
  });
}

function runGameLaunchResponse(
  findSourceMonitor: (displays: any[]) => any | null,
  sourceKey?: string,
): void {
  const ow = getOw();
  if (!ow?.windows || !ow.utils?.getMonitorsList) return;

  ow.utils.getMonitorsList((result: any) => {
    const displays = result?.displays;
    // The background opens main behind the game on one monitor.
    if (!Array.isArray(displays) || displays.length < 2 ||
        !getLaunchPreferences().autoOpenAppWithGame) {
      releaseAutoMoveSource(sourceKey);
      return;
    }

    // On multiple monitors, show the desktop only after it reaches the target.
    restoreIfHidden(() => {
      const sourceMonitor = findSourceMonitor(displays);
      const targetMonitor = sourceMonitor
        ? displays.find((display: any) => display !== sourceMonitor)
        : null;
      if (sourceMonitor && targetMonitor) {
        moveCurrentWindowAwayFromSourceMonitor(
          sourceMonitor,
          targetMonitor,
          displays,
          result?.workingArea,
          sourceKey,
          surfaceMainWindow,
        );
      } else {
        releaseAutoMoveSource(sourceKey);
      }
    });
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

/** Undo the synchronous claim when a run aborts without attempting anything. */
function releaseAutoMoveSource(sourceKey?: string): void {
  if (sourceKey && lastGameAutoMoveSourceKey === sourceKey) {
    lastGameAutoMoveSourceKey = null;
  }
}

/** Re-run the move if the window is still sharing the game's monitor. */
function verifyAutoMoveLanded(
  sourceMonitor: any,
  targetMonitor: any,
  displays: any[],
  workingArea: any,
  sourceKey: string | undefined,
  attemptsLeft: number,
  onMoved: () => void,
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
        if (getLaunchPreferences().autoOpenAppWithGame &&
            (!sourceKey || lastGameAutoMoveSourceKey === sourceKey)) onMoved();
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
      centerWindowOnMonitor(MAIN_WINDOW_NAME, targetMonitor as MonitorInfo, workingArea, {
        restoreMaximizedBeforeMove: true,
      });
      verifyAutoMoveLanded(
        sourceMonitor,
        targetMonitor,
        displays,
        workingArea,
        sourceKey,
        attemptsLeft - 1,
        onMoved,
      );
    });
  }, AUTO_MOVE_VERIFY_DELAY_MS);
}

function moveCurrentWindowAwayFromSourceMonitor(
  sourceMonitor: any,
  targetMonitor: any,
  displays: any[],
  workingArea?: any,
  sourceKey?: string,
  onMoved?: () => void,
): void {
  const ow = getOw();
  if (!ow?.windows) return;

  ow.windows.getCurrentWindow((result: any) => {
    const currentWindow = result?.window;
    if (!currentWindow) {
      // Nothing was attempted — give the claim back so a later game event can
      // still move the window.
      releaseAutoMoveSource(sourceKey);
      return;
    }

    const currentMonitor = findMonitorForWindow(currentWindow, displays);
    const isOnSourceMonitor =
      isSameMonitor(currentMonitor, sourceMonitor) ||
      windowOverlapsMonitor(currentWindow, sourceMonitor);

    if (!isOnSourceMonitor) {
      debugLog("auto move skipped: window already off source monitor", {
        sourceKey,
        sourceMonitorId: getMonitorId(sourceMonitor),
        currentMonitorId: getMonitorId(currentMonitor),
      });
      markAutoMoveSourceHandled(sourceKey);
      if (getLaunchPreferences().autoOpenAppWithGame) onMoved?.();
      return;
    }

    markAutoMoveSourceHandled(sourceKey);
    debugLog("moving window away from game monitor", {
      sourceKey,
      sourceMonitorId: getMonitorId(sourceMonitor),
      targetMonitorId: getMonitorId(targetMonitor),
    });

    centerWindowOnMonitor(MAIN_WINDOW_NAME, targetMonitor as MonitorInfo, workingArea, {
      restoreMaximizedBeforeMove: true,
    });
    verifyAutoMoveLanded(
      sourceMonitor,
      targetMonitor,
      displays,
      workingArea,
      sourceKey,
      AUTO_MOVE_VERIFY_ATTEMPTS,
      () => onMoved?.(),
    );
  });
}
