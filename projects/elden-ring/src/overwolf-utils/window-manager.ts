export const MAIN_WINDOW_MIN_WIDTH = 1300;
export const MAIN_WINDOW_MIN_HEIGHT = 840;

type CurrentWindow = overwolf.windows.WindowResult["window"];
type CurrentWindowState = string;
type CurrentWindowStateHandler = (state: CurrentWindowState) => void;

type DragOptions = {
  disableDoubleClickMaximize?: boolean;
};

type WorkingAreaLike = {
  left?: unknown;
  top?: unknown;
  width?: unknown;
  height?: unknown;
};

type MonitorsListResult = {
  success: boolean;
  displays?: MonitorInfo[];
  error?: string;
};

export interface MonitorInfo {
  id?: string;
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  dpiX?: number;
  dpiY?: number;
  is_primary?: boolean;
  handle?: { value: number };
  workingArea?: WorkingAreaLike;
  workArea?: WorkingAreaLike;
  work_area?: WorkingAreaLike;
  availableArea?: WorkingAreaLike;
}

interface RunningGameInfoWithMonitor {
  isRunning?: boolean;
  monitorHandle?: { value: number };
}

const DRAG_EXCLUSION_SELECTOR =
  "[data-ow-no-drag], button, a, input, textarea, select, option, [role='button']";
// Pixels the pointer may move between mousedown and mouseup before we treat the
// gesture as a DRAG rather than a click. Matches Windows' native drag threshold
// (SM_CXDRAG ≈ 4px), so a slightly jittery click still counts as a click and
// opens the map, while a deliberate drag to reposition the widget does not.
const SIGNIFICANT_MOUSE_MOVE_THRESHOLD = 4;

interface SavedWindowBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  monitorId?: string;
}

const savedBoundsByWindow = new Map<string, SavedWindowBounds>();

// --- Sample-app-style debounced bounds correction -----------------------------
// Schedule a single corrective resize/move ~150ms after the triggering action
// (drag end, restore, maximize toggle). A monotonic token invalidates in-flight
// callbacks if a newer correction is queued, so the user never sees competing
// resizes (which would otherwise flicker).

const BOUNDS_CORRECTION_DELAY_MS = 150;

type WindowPlacement = "center" | "clamp";

interface BoundsCorrectionOptions {
  restoreMaximizedBeforeMove?: boolean;
  reMaximizeAfterMove?: boolean;
  maximizedRestored?: boolean;
  wasMaximized?: boolean;
}

export interface DisplayRect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

const boundsCorrectionTimers = new Map<string, ReturnType<typeof setTimeout>>();
let latestBoundsCorrectionToken = 0;
const lastKnownMonitorIdByWindow = new Map<string, string>();

// `overwolf.windows.restore` calls back as soon as the command is ISSUED — the
// window keeps reporting `maximized` for a few more frames. Two consequences,
// both of which broke the maximized→other-monitor move:
//   1. re-reading the state immediately still says "maximized", which used to
//      hit the `maximizedRestored` early-return and dead-end the whole move
//      (window un-maximized on the game's monitor and stayed put);
//   2. `changePosition`/`changeSize` are ignored while Windows still treats the
//      window as maximized.
// So we poll until the state actually settles before touching geometry.
const MAXIMIZED_RESTORE_POLL_MS = 60;
const MAXIMIZED_RESTORE_POLL_ATTEMPTS = 12;
// Symmetrically, re-maximizing straight after `changePosition` can fill the OLD
// monitor: Windows hasn't re-associated the window with its new display yet.
const REMAXIMIZE_AFTER_MOVE_DELAY_MS = 140;

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const getDisplayScale = (display: MonitorInfo): number => {
  const dpiX = toNumber((display as { dpiX?: number }).dpiX, 96);
  const scale = dpiX / 96;
  return scale > 0 ? scale : 1;
};

const getDisplayBounds = (display: MonitorInfo): DisplayRect => {
  const scale = getDisplayScale(display);
  const left = toNumber(
    (display as { logicalX?: number }).logicalX,
    toNumber(display.x, 0),
  );
  const top = toNumber(
    (display as { logicalY?: number }).logicalY,
    toNumber(display.y, 0),
  );
  const width = Math.floor(
    toNumber(
      (display as { logicalWidth?: number }).logicalWidth,
      toNumber(display.width, MAIN_WINDOW_MIN_WIDTH) / scale,
    ),
  );
  const height = Math.floor(
    toNumber(
      (display as { logicalHeight?: number }).logicalHeight,
      toNumber(display.height, MAIN_WINDOW_MIN_HEIGHT) / scale,
    ),
  );

  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
  };
};

const getAreaOverlap = (a: DisplayRect, b: DisplayRect): number => {
  const w = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const h = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return w * h;
};

const normalizeWorkingArea = (
  display: MonitorInfo,
  workingArea: WorkingAreaLike | undefined,
): DisplayRect | null => {
  const rawLeft = Number(workingArea?.left);
  const rawTop = Number(workingArea?.top);
  const rawWidth = Number(workingArea?.width);
  const rawHeight = Number(workingArea?.height);

  if (
    !isFiniteNumber(rawLeft) ||
    !isFiniteNumber(rawTop) ||
    !isFiniteNumber(rawWidth) ||
    !isFiniteNumber(rawHeight) ||
    rawWidth <= 0 ||
    rawHeight <= 0
  ) {
    return null;
  }

  const scale = getDisplayScale(display);
  const displayBounds = getDisplayBounds(display);
  const candidates: DisplayRect[] = [
    {
      left: rawLeft,
      top: rawTop,
      width: rawWidth,
      height: rawHeight,
      right: rawLeft + rawWidth,
      bottom: rawTop + rawHeight,
    },
  ];

  if (scale !== 1) {
    candidates.push({
      left: rawLeft,
      top: rawTop,
      width: rawWidth / scale,
      height: rawHeight / scale,
      right: rawLeft + rawWidth / scale,
      bottom: rawTop + rawHeight / scale,
    });
  }

  const best = candidates
    .filter((c) => {
      const overlap = getAreaOverlap(c, displayBounds);
      const area = c.width * c.height;
      return area > 0 && overlap / area > 0.8;
    })
    .sort((a, b) => getAreaOverlap(b, displayBounds) - getAreaOverlap(a, displayBounds))[0];

  if (!best) return null;

  const left = Math.max(best.left, displayBounds.left);
  const top = Math.max(best.top, displayBounds.top);
  const right = Math.min(best.right, displayBounds.right);
  const bottom = Math.min(best.bottom, displayBounds.bottom);
  if (right <= left || bottom <= top) return null;

  return { left, top, width: right - left, height: bottom - top, right, bottom };
};

const getUsableDisplayBounds = (
  display: MonitorInfo,
  workingArea?: WorkingAreaLike,
): DisplayRect => {
  const own =
    display.workingArea ||
    display.workArea ||
    display.work_area ||
    display.availableArea;
  return (
    normalizeWorkingArea(display, own) ||
    normalizeWorkingArea(display, workingArea) ||
    getDisplayBounds(display)
  );
};

const getWindowRect = (windowInfo: CurrentWindow) => ({
  left: toNumber(windowInfo.left, 0),
  top: toNumber(windowInfo.top, 0),
  width: toNumber(windowInfo.width, MAIN_WINDOW_MIN_WIDTH),
  height: toNumber(windowInfo.height, MAIN_WINDOW_MIN_HEIGHT),
});

const findMonitorForWindow = (
  windowInfo: CurrentWindow,
  displays: MonitorInfo[],
): MonitorInfo | null => {
  const monitorId = windowInfo.monitorId;
  if (monitorId) {
    const byId = displays.find((d) => d.id === monitorId);
    if (byId) return byId;
  }

  const rect = getWindowRect(windowInfo);
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  return (
    displays.find((d) => {
      const b = getDisplayBounds(d);
      return centerX >= b.left && centerX <= b.right && centerY >= b.top && centerY <= b.bottom;
    }) ||
    displays.find((d) => d.is_primary) ||
    displays[0] ||
    null
  );
};

const clampPosition = (value: number, min: number, max: number): number => {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
};

// Use Display.id (string) as the identifier, matching currentWindow.monitorId.
const getMonitorIdString = (monitor: MonitorInfo): string | null =>
  typeof monitor.id === "string" && monitor.id.length > 0 ? monitor.id : null;

const getCurrentWindow = (): Promise<CurrentWindow | null> =>
  new Promise((resolve) => {
    if (typeof overwolf === "undefined" || !overwolf.windows?.getCurrentWindow) {
      resolve(null);
      return;
    }

    overwolf.windows.getCurrentWindow((result) => {
      resolve(result.success ? result.window : null);
    });
  });

const getWindowState = (windowInfo: CurrentWindow | null): CurrentWindowState =>
  windowInfo?.stateEx ?? windowInfo?.state ?? "";

const restoreWindowById = (windowId: string): Promise<void> =>
  new Promise((resolve, reject) => {
    overwolf.windows.restore(windowId, (result) => {
      if (result.success) resolve();
      else reject(result.error);
    });
  });

export const obtainDeclaredWindow = (
  windowName: string,
): Promise<overwolf.windows.WindowResult> =>
  new Promise((resolve, reject) => {
    const callback = (result: overwolf.windows.WindowResult) => {
      if (result.success) resolve(result);
      else reject(result.error);
    };

    overwolf.windows.obtainDeclaredWindow(windowName, callback);
  });

export const getOpenWindow = (
  windowName: string,
): Promise<overwolf.windows.WindowResult["window"] | null> =>
  new Promise((resolve) => {
    if (typeof overwolf === "undefined" || !overwolf.windows?.getWindow) {
      resolve(null);
      return;
    }

    overwolf.windows.getWindow(windowName, (result) => {
      resolve(result.success ? result.window : null);
    });
  });

const MAIN_WINDOW_NAME = "main";

export const restoreWindow = async (windowName: string): Promise<void> => {
  const result = await obtainDeclaredWindow(windowName);
  await restoreWindowById(result.window.id);
  if (windowName === MAIN_WINDOW_NAME) {
    // Only correct when the window actually landed on a new monitor AND
    // overflows it. Same-monitor restores keep their prior position exactly.
    scheduleMainWindowBoundsCorrection(windowName, BOUNDS_CORRECTION_DELAY_MS, {
      onlyWhenMonitorChanged: true,
      overflowOnly: true,
    });
  }
};

// Persisted across launches — flipped to "true" after the first successful boot
// so subsequent relaunches keep Overwolf's saved position instead of re-centering.
const FIRST_LAUNCH_FLAG_KEY = "ow-base:mainWindowFirstLaunchCompleted";

const isMainWindowFirstLaunch = (): boolean => {
  try {
    return (
      typeof window !== "undefined" &&
      window.localStorage?.getItem(FIRST_LAUNCH_FLAG_KEY) !== "true"
    );
  } catch {
    return true;
  }
};

const markMainWindowFirstLaunchCompleted = (): void => {
  try {
    if (typeof window !== "undefined") {
      window.localStorage?.setItem(FIRST_LAUNCH_FLAG_KEY, "true");
    }
  } catch {
    // Storage unavailable — worst case we re-center once more next launch.
  }
};

export const restoreWindowWithDefaultBounds = async (
  windowName: string,
): Promise<void> => {
  const useDefaultCenter =
    windowName === MAIN_WINDOW_NAME && isMainWindowFirstLaunch();
  await restoreWindow(windowName);
  if (useDefaultCenter) {
    await centerWindowOnPrimaryMonitor(windowName);
    markMainWindowFirstLaunchCompleted();
    scheduleMainWindowBoundsCorrection(windowName);
  }
};

// Snapshot a window's bounds only while it is visible (normal state).
// Per Overwolf docs, a minimized window's top/left/width/height are unreliable.
const captureWindowBounds = async (windowName: string): Promise<void> => {
  const win = await getOpenWindow(windowName);
  if (!win) return;
  const state = win.stateEx ?? win.state ?? "";
  if (state !== "normal") return;

  savedBoundsByWindow.set(windowName, {
    left: Number(win.left) || 0,
    top: Number(win.top) || 0,
    width: Number(win.width) || MAIN_WINDOW_MIN_WIDTH,
    height: Number(win.height) || MAIN_WINDOW_MIN_HEIGHT,
    monitorId: win.monitorId,
  });
};

export const minimizeWindow = async (windowName: string): Promise<void> => {
  await captureWindowBounds(windowName).catch(() => undefined);
  const result = await obtainDeclaredWindow(windowName);
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.minimize(result.window.id, (res) => {
      if (res.success) resolve();
      else reject(res.error);
    });
  });
};

export const hideWindow = async (windowName: string): Promise<void> => {
  await captureWindowBounds(windowName).catch(() => undefined);
  const result = await obtainDeclaredWindow(windowName);
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.hide(result.window.id, (res) => {
      if (res.success) resolve();
      else reject(res.error);
    });
  });
};

export const toggleWindow = async (
  windowName: string,
  safeRestore?: () => Promise<void>,
  hideWhenVisible = false,
): Promise<void> => {
  const openWindow = await getOpenWindow(windowName);

  if (!openWindow) {
    if (safeRestore) {
      await safeRestore();
    } else {
      await restoreWindow(windowName);
    }
    return;
  }

  const state = openWindow.stateEx;
  if (state === "minimized" || state === "hidden" || state === "closed") {
    if (safeRestore) {
      await safeRestore();
    } else {
      await restoreWindow(windowName);
    }
    return;
  }

  if (hideWhenVisible) {
    await hideWindow(windowName);
  } else {
    await minimizeWindow(windowName);
  }
};

type BringToFrontFn = (
  windowId: string,
  grabFocus: boolean,
  callback: (result: { success: boolean; error?: string }) => void,
) => void;

// Surface the window once via Overwolf's `bringToFront` with `grabFocus=true`.
// We deliberately do NOT use `setTopmost` — toggling topmost on/off can leave
// the window stuck always-on-top in some Overwolf versions. Plain bringToFront
// may occasionally fail under Windows' foreground-lock, but that trade-off is
// preferable to a permanently-pinned window.
export const bringWindowToFront = async (
  windowName: string,
  grabFocus = true,
): Promise<void> => {
  const result = await obtainDeclaredWindow(windowName);
  const bringToFront = (
    overwolf.windows as unknown as { bringToFront?: BringToFrontFn }
  ).bringToFront;
  if (!bringToFront) return;
  await new Promise<void>((resolve) =>
    bringToFront(result.window.id, grabFocus, () => resolve()),
  );
};

export const bringWindowToFrontWithRetries = (
  windowName: string,
  delaysMs: number[] = [0, 120, 450, 900],
): Promise<void> => {
  delaysMs.forEach((delay) => {
    if (delay <= 0) {
      bringWindowToFront(windowName).catch(() => {});
    } else {
      setTimeout(() => {
        bringWindowToFront(windowName).catch(() => {});
      }, delay);
    }
  });

  return Promise.resolve();
};

type SetTopmostFn = (
  windowId: string,
  shouldBeTopmost: boolean,
  callback: (result: { success: boolean; error?: string }) => void,
) => void;

/**
 * Raise a window above an EXTERNAL foreground application — the case after an
 * OAuth round-trip, where the system browser owns the foreground.
 *
 * Windows' foreground lock stops a background process from stealing focus, so
 * plain `bringToFront` loses the z-order fight with the browser no matter how
 * many times we retry. `setTopmost` is a pure z-order change (not a focus
 * steal), so it isn't subject to that lock: we pulse it on to lift the window
 * above the browser, then release it shortly after so the window doesn't stay
 * pinned always-on-top. Releasing topmost leaves the window at the top of the
 * normal z-order (still above the browser), which is exactly what we want.
 */
export const surfaceWindowOverExternalApp = async (
  windowName: string,
  pinMs = 1200,
): Promise<void> => {
  const result = await obtainDeclaredWindow(windowName).catch(() => null);
  if (!result) return;
  const id = result.window.id;
  const windowsApi = overwolf.windows as unknown as {
    bringToFront?: BringToFrontFn;
    setTopmost?: SetTopmostFn;
  };

  // Best-effort focus grab (works when the OS grants foreground rights).
  windowsApi.bringToFront?.(id, true, () => {});

  const setTopmost = windowsApi.setTopmost;
  if (!setTopmost) return;
  setTopmost(id, true, () => {});
  // Always release the pin so the window can never get stuck always-on-top.
  setTimeout(() => setTopmost(id, false, () => {}), pinMs);
};

export const closeWindow = async (windowName: string): Promise<void> => {
  const result = await obtainDeclaredWindow(windowName);
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.close(result.window.id, (res) => {
      if (res.success) resolve();
      else reject(res.error);
    });
  });
};

export const setDeclaredWindowMinSize = async (
  windowName: string,
  width: number,
  height: number,
): Promise<void> => {
  const result = await obtainDeclaredWindow(windowName);
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.setMinSize(result.window.id, width, height, (res) => {
      if (res.success) resolve();
      else reject(res.error);
    });
  });
};

export const isWindowMaximizedState = (state: CurrentWindowState): boolean =>
  state === "maximized";

export const minimizeCurrentWindow = (): void => {
  void getCurrentWindow().then((currentWindow) => {
    if (!currentWindow) return;
    const state = getWindowState(currentWindow);
    if (state === "normal" && currentWindow.name) {
      savedBoundsByWindow.set(currentWindow.name, {
        left: Number(currentWindow.left) || 0,
        top: Number(currentWindow.top) || 0,
        width: Number(currentWindow.width) || MAIN_WINDOW_MIN_WIDTH,
        height: Number(currentWindow.height) || MAIN_WINDOW_MIN_HEIGHT,
        monitorId: currentWindow.monitorId,
      });
    }
    overwolf.windows.minimize(currentWindow.id, () => {});
  });
};

export const toggleCurrentWindowMaximize = (): void => {
  void getCurrentWindow().then((currentWindow) => {
    if (!currentWindow) return;

    if (isWindowMaximizedState(getWindowState(currentWindow))) {
      overwolf.windows.restore(currentWindow.id, () => {
        if (currentWindow.name === MAIN_WINDOW_NAME) {
          // Unmaximize lands on the same monitor where the user maximized —
          // don't nudge the window unless it truly overflows.
          scheduleMainWindowBoundsCorrection(
            MAIN_WINDOW_NAME,
            BOUNDS_CORRECTION_DELAY_MS,
            { onlyWhenMonitorChanged: true, overflowOnly: true },
          );
        }
      });
    } else {
      overwolf.windows.maximize(currentWindow.id, () => {
        // Overwolf's maximize resizes the window to fill the monitor but does NOT
        // change its z-order, so any window that was covering ours stays on top.
        // Raise ours to the front (grabbing focus) so maximize always brings the
        // app fully forward. Retried because the z-order can settle a beat after
        // the maximize callback fires and a single bringToFront can lose the race.
        if (currentWindow.name) {
          void bringWindowToFrontWithRetries(currentWindow.name);
        }
      });
    }
  });
};

export const closeCurrentWindow = (): void => {
  void getCurrentWindow().then((currentWindow) => {
    if (!currentWindow) return;
    overwolf.windows.close(currentWindow.id, () => {});
  });
};

export const dragCurrentWindow = (): void => {
  void getCurrentWindow().then((currentWindow) => {
    if (!currentWindow) return;
    overwolf.windows.dragMove(currentWindow.id, (result) => {
      if (result?.success === false) return;
      if (currentWindow.name !== MAIN_WINDOW_NAME) return;
      // Only intervene when BOTH hold:
      //   1. the window landed on a different monitor, AND
      //   2. it visually overflows that monitor.
      // Anything else is the user's intent — leave it alone.
      scheduleMainWindowBoundsCorrection(MAIN_WINDOW_NAME, BOUNDS_CORRECTION_DELAY_MS, {
        onlyWhenMonitorChanged: true,
        overflowOnly: true,
      });
    });
  });
};

export const bindDragMoveElement = (
  element: HTMLElement | null,
  options: DragOptions = { disableDoubleClickMaximize: false },
): (() => void) => {
  if (!element || typeof overwolf === "undefined") {
    return () => {};
  }

  let mouseDown = false;
  let initialMousePosition: { x: number; y: number } | null = null;
  // Set the moment a real drag (native dragMove) starts, so we can swallow the
  // trailing `click` the browser still fires on release. Without this, dragging a
  // draggable element that ALSO has an onClick — e.g. the in-game overlay circle,
  // which opens the map on click — would fire that click right after the user
  // finished repositioning it, popping the map open when they only meant to move
  // the widget.
  let suppressNextClick = false;

  const resetDrag = () => {
    mouseDown = false;
    initialMousePosition = null;
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;

    // A fresh press begins a fresh gesture — clear any stale drag-suppression so
    // a drag that ended without a trailing click can't swallow a later real one.
    suppressNextClick = false;

    const target = event.target;
    if (target instanceof Element && target.closest(DRAG_EXCLUSION_SELECTOR)) {
      return;
    }

    if (!options.disableDoubleClickMaximize && event.detail >= 2) {
      event.preventDefault();
      toggleCurrentWindowMaximize();
      resetDrag();
      return;
    }

    mouseDown = true;
    initialMousePosition = { x: event.clientX, y: event.clientY };
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!mouseDown || !initialMousePosition) return;

    const diffX = Math.abs(event.clientX - initialMousePosition.x);
    const diffY = Math.abs(event.clientY - initialMousePosition.y);
    if (
      diffX <= SIGNIFICANT_MOUSE_MOVE_THRESHOLD &&
      diffY <= SIGNIFICANT_MOUSE_MOVE_THRESHOLD
    ) {
      return;
    }

    suppressNextClick = true;
    resetDrag();
    dragCurrentWindow();
  };

  // Capture phase so this runs before React's delegated (bubbling) onClick on the
  // root: cancelling propagation here stops the click from ever reaching the
  // element's React handler. Only a click that followed a real drag is swallowed;
  // a genuine click (no drag) passes straight through.
  const onClickCapture = (event: MouseEvent) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.stopImmediatePropagation();
    event.preventDefault();
  };

  element.classList.add("draggable");
  element.addEventListener("mousedown", onMouseDown);
  element.addEventListener("mousemove", onMouseMove);
  element.addEventListener("mouseup", resetDrag);
  element.addEventListener("mouseleave", resetDrag);
  element.addEventListener("click", onClickCapture, true);

  return () => {
    element.classList.remove("draggable");
    element.removeEventListener("mousedown", onMouseDown);
    element.removeEventListener("mousemove", onMouseMove);
    element.removeEventListener("mouseup", resetDrag);
    element.removeEventListener("mouseleave", resetDrag);
    element.removeEventListener("click", onClickCapture, true);
  };
};

export const subscribeToCurrentWindowState = (
  handler: CurrentWindowStateHandler,
): (() => void) => {
  if (
    typeof overwolf === "undefined" ||
    !overwolf.windows?.onStateChanged ||
    !overwolf.windows?.getCurrentWindow
  ) {
    return () => {};
  }

  let currentWindowId: string | null = null;
  let currentWindowName: string | null = null;

  void getCurrentWindow().then((currentWindow) => {
    if (!currentWindow) return;
    currentWindowId = currentWindow.id;
    currentWindowName = currentWindow.name;
    handler(getWindowState(currentWindow));
  });

  const listener = (event: {
    window_id?: string;
    window_name?: string;
    window_state_ex?: string;
    window_state?: string;
  }) => {
    const matchesWindow =
      (event.window_id && currentWindowId && event.window_id === currentWindowId) ||
      (event.window_name && currentWindowName && event.window_name === currentWindowName);

    if (!matchesWindow) return;
    handler(event.window_state_ex ?? event.window_state ?? "");
  };

  overwolf.windows.onStateChanged.addListener(listener);
  return () => {
    overwolf.windows.onStateChanged.removeListener(listener);
  };
};

export const getMonitorsList = async (): Promise<MonitorInfo[]> => {
  const result = await new Promise<MonitorsListResult>((resolve, reject) => {
    overwolf.utils.getMonitorsList((response) => {
      if (response.success) resolve(response);
      else reject(response.error);
    });
  });

  return result.displays ?? [];
};

const getRunningGameMonitorHandle = async (): Promise<number | null> => {
  if (typeof overwolf === "undefined" || !overwolf.games?.getRunningGameInfo) {
    return null;
  }

  return new Promise((resolve) => {
    overwolf.games.getRunningGameInfo((info: RunningGameInfoWithMonitor) => {
      if (!info?.isRunning || !info.monitorHandle) {
        resolve(null);
        return;
      }
      const value = Number(info.monitorHandle.value);
      resolve(Number.isFinite(value) ? value : null);
    });
  });
};

const getPrimaryMonitor = (monitors: MonitorInfo[]): MonitorInfo | null =>
  monitors.find((monitor) => monitor.is_primary) || monitors[0] || null;

/**
 * Logical bounds of the monitor the targeted game is running on (falling back to
 * the primary monitor when the game's monitor can't be resolved — e.g. outside a
 * game session). Used to anchor the in-game overlay: the collapsed widget docks to
 * this rect's corner and the expanded map centers within it. Returns null outside
 * Overwolf or when no monitors are reported.
 */
export const getGameMonitorBounds = async (): Promise<DisplayRect | null> => {
  const monitors = await getMonitorsList().catch(() => [] as MonitorInfo[]);
  if (monitors.length === 0) return null;

  const gameHandle = await getRunningGameMonitorHandle().catch(() => null);
  const monitor =
    (gameHandle != null
      ? monitors.find((m) => Number(m.handle?.value) === gameHandle)
      : null) ??
    getPrimaryMonitor(monitors);

  return monitor ? getDisplayBounds(monitor) : null;
};

// --- In-game map overlay (two cooperating windows) ---------------------------
// `overlay` is the always-on collapsed circle; `overlay_map` is the expanded map,
// which carries `focus_game_takeover: ReleaseOnLostFocus` in the manifest so it
// enters exclusive mode whenever it is shown (the only flag that engages it on a
// programmatic show — there's no API for exclusive mode). Exactly one of the two
// is visible at a time, so expanding hides the circle and collapsing hides the map.

export const OVERLAY_WIDGET_WINDOW = "overlay";
export const OVERLAY_MAP_WINDOW = "overlay_map";

/**
 * Message the background sends to the corner widget when the user presses the
 * dismiss hotkey (Ctrl+Shift+M) while only the widget is on screen. Rather than
 * hiding the widget instantly, the widget shows a short "press … to reopen" hint
 * and then hides ITSELF — so the player always learns how to bring it back.
 */
export const OVERLAY_DISMISS_HINT_MSG = "overlay:dismiss-hint";

/** Show the expanded map (engaging exclusive mode) and hide the circle widget. */
export const expandOverlayMap = async (): Promise<void> => {
  await restoreWindow(OVERLAY_MAP_WINDOW).catch((err) =>
    console.warn("[Overlay] Failed to show map", err),
  );
  await hideWindow(OVERLAY_WIDGET_WINDOW).catch(() => {});
};

/** Hide the map (releasing exclusive mode) and bring back the circle widget. */
export const collapseOverlayMap = async (): Promise<void> => {
  await restoreWindow(OVERLAY_WIDGET_WINDOW).catch((err) =>
    console.warn("[Overlay] Failed to show widget", err),
  );
  await hideWindow(OVERLAY_MAP_WINDOW).catch(() => {});
};

/** Dismiss both overlay windows (e.g. when the game stops, or the user hides it). */
export const hideOverlayWindows = async (): Promise<void> => {
  await hideWindow(OVERLAY_WIDGET_WINDOW).catch(() => {});
  await hideWindow(OVERLAY_MAP_WINDOW).catch(() => {});
};

const isWindowVisible = (win: CurrentWindow | null): boolean => {
  const state = win?.stateEx ?? win?.state ?? "";
  return (
    Boolean(win) &&
    state !== "hidden" &&
    state !== "minimized" &&
    state !== "closed"
  );
};

/** Whether the expanded map window is currently visible. */
export const isOverlayMapVisible = async (): Promise<boolean> =>
  isWindowVisible(await getOpenWindow(OVERLAY_MAP_WINDOW).catch(() => null));

/** Whether the collapsed corner widget is currently visible. */
export const isOverlayWidgetVisible = async (): Promise<boolean> =>
  isWindowVisible(await getOpenWindow(OVERLAY_WIDGET_WINDOW).catch(() => null));

/**
 * Toggle the ENTIRE in-game overlay (unlike `toggle_overlay`/Ctrl+M, which only
 * swaps between the collapsed widget and the expanded map). When anything is on
 * screen — either the map or the corner widget — hide both. When fully dismissed,
 * bring back the unobtrusive corner widget (never the full map, so recovering the
 * overlay never yanks the player into exclusive mode).
 */
export const toggleOverlayDismissed = async (): Promise<void> => {
  const [mapVisible, widgetVisible] = await Promise.all([
    isOverlayMapVisible(),
    isOverlayWidgetVisible(),
  ]);
  if (mapVisible || widgetVisible) {
    await hideOverlayWindows();
  } else {
    await restoreWindow(OVERLAY_WIDGET_WINDOW);
  }
};

// --- DPI-aware, maximized-aware centering & clamping -------------------------

/**
 * Poll the window until it stops reporting `maximized` (see the constants
 * above). Calls back with the settled window, or `null` when the state never
 * settled / the window vanished — in which case the caller must abort rather
 * than issue geometry calls Windows would silently drop.
 */
const waitForNonMaximizedWindow = (
  windowName: string,
  token: number,
  attemptsLeft: number,
  onSettled: (settledWindow: CurrentWindow | null) => void,
): void => {
  void getOpenWindow(windowName).then((win) => {
    if (token !== latestBoundsCorrectionToken) return;
    if (!win) {
      onSettled(null);
      return;
    }

    const state = String(win.stateEx ?? win.state ?? "").toLowerCase();
    if (state !== "maximized") {
      onSettled(win);
      return;
    }
    if (attemptsLeft <= 0) {
      console.warn("[window-bounds] window stayed maximized after restore");
      onSettled(null);
      return;
    }

    setTimeout(
      () => waitForNonMaximizedWindow(windowName, token, attemptsLeft - 1, onSettled),
      MAXIMIZED_RESTORE_POLL_MS,
    );
  });
};

const applyWindowBoundsCorrection = (
  windowName: string,
  currentWindow: CurrentWindow,
  monitor: MonitorInfo,
  placement: WindowPlacement,
  token: number,
  workingArea?: WorkingAreaLike,
  options: BoundsCorrectionOptions = {},
): void => {
  if (token !== latestBoundsCorrectionToken) return;

  const state = String(currentWindow.stateEx ?? currentWindow.state ?? "").toLowerCase();
  if (state === "minimized" || state === "closed") return;

  if (state === "maximized") {
    if (!options.restoreMaximizedBeforeMove || options.maximizedRestored) return;

    overwolf.windows.restore(currentWindow.id, (restoreResult) => {
      if (token !== latestBoundsCorrectionToken) return;
      if (restoreResult?.success === false) {
        console.warn("[window-bounds] restore failed:", restoreResult);
        return;
      }
      // Wait for the un-maximize to actually land — reading the state right
      // here still returns "maximized" and would abort the move below.
      waitForNonMaximizedWindow(
        windowName,
        token,
        MAXIMIZED_RESTORE_POLL_ATTEMPTS,
        (restoredWindow) => {
          if (token !== latestBoundsCorrectionToken) return;
          if (!restoredWindow) return;
          applyWindowBoundsCorrection(
            windowName,
            restoredWindow,
            monitor,
            placement,
            token,
            workingArea,
            { ...options, maximizedRestored: true, wasMaximized: true },
          );
        },
      );
    });
    return;
  }

  const rect = getWindowRect(currentWindow);
  const bounds = getUsableDisplayBounds(monitor, workingArea);
  const maxWidth = Math.max(MAIN_WINDOW_MIN_WIDTH, bounds.width);
  const maxHeight = Math.max(MAIN_WINDOW_MIN_HEIGHT, bounds.height);
  const width = Math.floor(Math.min(rect.width, maxWidth));
  const height = Math.floor(Math.min(rect.height, maxHeight));
  const preferredLeft =
    placement === "center" ? bounds.left + bounds.width / 2 - width / 2 : rect.left;
  const preferredTop =
    placement === "center" ? bounds.top + bounds.height / 2 - height / 2 : rect.top;
  const left = Math.floor(clampPosition(preferredLeft, bounds.left, bounds.right - width));
  const top = Math.floor(clampPosition(preferredTop, bounds.top, bounds.bottom - height));
  const windowId = currentWindow.id;
  // A window that is about to be re-maximized on the target monitor doesn't
  // need resizing — and a failing `changeSize` aborts the chain before it ever
  // repositions, which is the one step that actually moves the window.
  const willReMaximize = Boolean(options.reMaximizeAfterMove && options.wasMaximized);
  const needsResize =
    !willReMaximize && (width !== Math.floor(rect.width) || height !== Math.floor(rect.height));
  const needsPosition = left !== Math.floor(rect.left) || top !== Math.floor(rect.top);

  const finalizeMove = () => {
    if (token !== latestBoundsCorrectionToken) return;
    if (!options.reMaximizeAfterMove || !options.wasMaximized) return;
    // Delay: maximizing immediately after the move fills the monitor the window
    // was on BEFORE changePosition, which would silently drag it right back.
    setTimeout(() => {
      if (token !== latestBoundsCorrectionToken) return;
      overwolf.windows.maximize(windowId, (maximizeResult) => {
        if (!maximizeResult?.success) {
          console.warn("[window-bounds] maximize failed:", maximizeResult);
        }
      });
    }, REMAXIMIZE_AFTER_MOVE_DELAY_MS);
  };

  if (!needsResize && !needsPosition) {
    finalizeMove();
    return;
  }

  const doChangePosition = () => {
    if (token !== latestBoundsCorrectionToken) return;
    if (!needsPosition) {
      finalizeMove();
      return;
    }
    overwolf.windows.changePosition(windowId, left, top, (changeResult) => {
      if (!changeResult?.success) {
        console.warn("[window-bounds] changePosition failed:", changeResult);
        return;
      }
      finalizeMove();
    });
  };

  if (!needsResize) {
    doChangePosition();
    return;
  }

  overwolf.windows.changeSize(
    { window_id: windowId, width, height, auto_dpi_resize: true },
    (resizeResult) => {
      if (token !== latestBoundsCorrectionToken) return;
      if (!resizeResult?.success) {
        console.warn("[window-bounds] changeSize failed:", resizeResult);
        return;
      }
      doChangePosition();
    },
  );
};

export const centerWindowOnMonitor = (
  windowName: string,
  monitor: MonitorInfo,
  workingArea?: WorkingAreaLike,
  options: BoundsCorrectionOptions = {},
): void => {
  if (options.restoreMaximizedBeforeMove || options.reMaximizeAfterMove) {
    cancelMainWindowBoundsCorrection(windowName);
  }

  void getOpenWindow(windowName).then((win) => {
    if (!win) return;
    const placement: WindowPlacement = win.monitorId === getMonitorIdString(monitor) ? "clamp" : "center";
    const token = ++latestBoundsCorrectionToken;
    const monitorId = getMonitorIdString(monitor);
    if (monitorId) lastKnownMonitorIdByWindow.set(windowName, monitorId);
    applyWindowBoundsCorrection(windowName, win, monitor, placement, token, workingArea, options);
  });
};

export const centerWindowOnPrimaryMonitor = async (
  windowName: string,
): Promise<void> => {
  const monitors = await getMonitorsList().catch(() => []);
  const primaryMonitor = getPrimaryMonitor(monitors);
  if (!primaryMonitor) return;
  centerWindowOnMonitor(windowName, primaryMonitor);
};

export const cancelMainWindowBoundsCorrection = (windowName = "main"): void => {
  const timer = boundsCorrectionTimers.get(windowName);
  if (timer != null) {
    clearTimeout(timer);
    boundsCorrectionTimers.delete(windowName);
  }
};

export interface BoundsCorrectionScheduleOptions {
  onlyWhenMonitorChanged?: boolean;
  // When true, only correct if the window physically overflows the target
  // monitor's rectangle. Respects user intent on a deliberate drag — if the
  // window visibly fits, we don't touch it (DPI-aware logical bounds would
  // otherwise nudge the window even when it looks fine).
  overflowOnly?: boolean;
}

// Check if the window is substantially on the target display. Overwolf reports
// window coordinates in DPI-converted units that may differ from the raw
// physical display bounds, so an exact edge match isn't reliable. We treat
// the window as "inside" when it overlaps the display by at least 90% of its
// own area. Only a clear visual overflow (big chunk off-screen) fails this.
const isWindowInsideDisplayPhysicalBounds = (
  windowInfo: CurrentWindow,
  display: MonitorInfo,
): boolean => {
  const rect = getWindowRect(windowInfo);
  const windowArea = rect.width * rect.height;
  if (windowArea <= 0) return true;

  const winRect: DisplayRect = {
    left: rect.left,
    top: rect.top,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    width: rect.width,
    height: rect.height,
  };

  const displayLeft = toNumber(display.x, 0);
  const displayTop = toNumber(display.y, 0);
  const displayWidth = toNumber(display.width, MAIN_WINDOW_MIN_WIDTH);
  const displayHeight = toNumber(display.height, MAIN_WINDOW_MIN_HEIGHT);
  const displayRect: DisplayRect = {
    left: displayLeft,
    top: displayTop,
    right: displayLeft + displayWidth,
    bottom: displayTop + displayHeight,
    width: displayWidth,
    height: displayHeight,
  };

  const overlap = getAreaOverlap(winRect, displayRect);
  return overlap / windowArea >= 0.9;
};

export const scheduleMainWindowBoundsCorrection = (
  windowName = "main",
  delay = BOUNDS_CORRECTION_DELAY_MS,
  options: BoundsCorrectionScheduleOptions = {},
): void => {
  cancelMainWindowBoundsCorrection(windowName);
  const timer = setTimeout(() => {
    boundsCorrectionTimers.delete(windowName);
    void ensureMainWindowWithinCurrentMonitorBounds(windowName, options);
  }, delay);
  boundsCorrectionTimers.set(windowName, timer);
};

interface MonitorsListResultWithWorkingArea extends MonitorsListResult {
  workingArea?: WorkingAreaLike;
}

export const ensureMainWindowWithinCurrentMonitorBounds = async (
  windowName = "main",
  options: BoundsCorrectionScheduleOptions = {},
): Promise<void> => {
  if (typeof overwolf === "undefined" || !overwolf.windows || !overwolf.utils?.getMonitorsList) {
    return;
  }
  const token = ++latestBoundsCorrectionToken;

  const win = await getOpenWindow(windowName);
  if (token !== latestBoundsCorrectionToken) return;
  if (!win) return;

  const monitorsResult = await new Promise<MonitorsListResultWithWorkingArea>((resolve) => {
    overwolf.utils.getMonitorsList((res) => resolve(res as MonitorsListResultWithWorkingArea));
  });
  if (token !== latestBoundsCorrectionToken) return;
  const displays = monitorsResult?.displays;
  if (!Array.isArray(displays) || displays.length === 0) return;

  const monitor = findMonitorForWindow(win, displays);
  if (!monitor) return;

  const previousMonitorId = lastKnownMonitorIdByWindow.get(windowName);
  const currentMonitorId = getMonitorIdString(monitor);
  if (currentMonitorId) lastKnownMonitorIdByWindow.set(windowName, currentMonitorId);

  const monitorChanged = Boolean(
    previousMonitorId && currentMonitorId && previousMonitorId !== currentMonitorId,
  );
  if (options.onlyWhenMonitorChanged && !monitorChanged) return;

  // Respect a deliberate user drag: if the window fits the target monitor's
  // physical rectangle, do nothing — no flicker, no unexpected repositioning.
  if (options.overflowOnly && isWindowInsideDisplayPhysicalBounds(win, monitor)) {
    return;
  }

  applyWindowBoundsCorrection(
    windowName,
    win,
    monitor,
    "clamp",
    token,
    monitorsResult?.workingArea,
  );
};

export const restoreWindowPreservingPlacement = async (
  windowName: string,
): Promise<void> => {
  // Calling `overwolf.windows.restore` on a maximized window un-maximizes it
  // back to its saved bounds. Only invoke restore when the window is actually
  // hidden/minimized/closed; otherwise it's already on screen and we must not
  // disturb the user's current size/state.
  const currentWindow = await getOpenWindow(windowName).catch(() => null);
  const currentState = currentWindow?.stateEx ?? currentWindow?.state ?? "";
  const isHidden =
    !currentWindow ||
    currentState === "minimized" ||
    currentState === "hidden" ||
    currentState === "closed";
  if (!isHidden) return;

  await restoreWindow(windowName);

  const saved = savedBoundsByWindow.get(windowName);
  if (!saved) return;

  // If the saved monitor is no longer connected, fall back to centering on primary.
  if (saved.monitorId) {
    const monitors = await getMonitorsList().catch(() => [] as MonitorInfo[]);
    const stillConnected = monitors.some((m) => m.id === saved.monitorId);
    if (!stillConnected) {
      await centerWindowOnPrimaryMonitor(windowName).catch((err) =>
        console.warn("[WindowManager] Fallback center failed", err),
      );
      return;
    }
  }
};

export const ensureWindowFitsVisibleBounds = async (
  windowName?: string,
): Promise<void> => {
  if (!windowName) return;
  await ensureMainWindowWithinCurrentMonitorBounds(windowName);
};

const changeWindowPosition = (
  windowId: string,
  left: number,
  top: number,
): Promise<void> =>
  new Promise((resolve) => {
    overwolf.windows.changePosition(windowId, Math.floor(left), Math.floor(top), () =>
      resolve(),
    );
  });

/** Gap between the satellite and the anchor when there's empty space to park in. */
const ANCHOR_PARK_GAP = 8;

/**
 * Park a satellite window (the Roundtable companion) beside an anchor window
 * (the dashboard) so it never opens hidden behind it:
 *
 *   1. Prefer empty desktop space to the RIGHT of the anchor — the intended
 *      layout, with the companion sitting just past the dashboard's right edge.
 *   2. Else empty space to the LEFT.
 *   3. Else, when the PAIR still fits the monitor, nudge the anchor left just
 *      enough to dock the satellite on its right.
 *   4. Only a monitor too narrow for both falls back to overlapping the anchor,
 *      pinned to its LEFT edge — the dashboard's ad rail lives on its right
 *      (440px of a ≥1300px window), so a left overlap can never cover the ads.
 *
 * A maximized anchor still has usable bounds, so it's allowed: the companion
 * lands on the dashboard's monitor rather than being stranded on the game's.
 */
export const parkWindowBesideAnchor = async (
  satelliteName: string,
  anchorName: string,
): Promise<void> => {
  if (typeof overwolf === "undefined" || !overwolf.windows?.changePosition) return;

  const [satellite, anchor] = await Promise.all([
    getOpenWindow(satelliteName),
    getOpenWindow(anchorName),
  ]);
  if (!satellite || !anchor) return;

  const anchorState = anchor.stateEx ?? anchor.state ?? "";
  if (anchorState !== "normal" && anchorState !== "maximized") return;

  const monitors = await getMonitorsList().catch(() => [] as MonitorInfo[]);
  const monitor = findMonitorForWindow(anchor, monitors);
  if (!monitor) return;

  const bounds = getUsableDisplayBounds(monitor);
  const anchorRect = getWindowRect(anchor);
  const sat = getWindowRect(satellite);

  const spaceRight = bounds.right - (anchorRect.left + anchorRect.width);
  const spaceLeft = anchorRect.left - bounds.left;
  const pairWidth = anchorRect.width + ANCHOR_PARK_GAP + sat.width;

  let anchorLeft = anchorRect.left;
  let left: number;
  if (spaceRight >= sat.width + ANCHOR_PARK_GAP) {
    left = anchorRect.left + anchorRect.width + ANCHOR_PARK_GAP;
  } else if (spaceLeft >= sat.width + ANCHOR_PARK_GAP) {
    left = anchorRect.left - ANCHOR_PARK_GAP - sat.width;
  } else if (pairWidth <= bounds.right - bounds.left) {
    anchorLeft = clampPosition(anchorRect.left, bounds.left, bounds.right - pairWidth);
    left = anchorLeft + anchorRect.width + ANCHOR_PARK_GAP;
  } else {
    left = anchorRect.left;
  }

  // Move the anchor first (only when docking shifted it) so the satellite lands
  // beside its FINAL position.
  if (anchorLeft !== anchorRect.left) {
    await changeWindowPosition(anchor.id, anchorLeft, anchorRect.top);
  }

  const clampedLeft = clampPosition(left, bounds.left, bounds.right - sat.width);
  const clampedTop = clampPosition(anchorRect.top, bounds.top, bounds.bottom - sat.height);
  await changeWindowPosition(satellite.id, clampedLeft, clampedTop);
};

/**
 * Reveal the main window in response to a user "show the app" action — an
 * Overwolf dock click, a tray click, or a `show_main` request. Un-minimizes the
 * window (preserving the user's placement) if it's hidden/minimized, then lifts
 * it above whatever currently owns the foreground: the GAME when the click came
 * from the in-game dock, or any other app on the desktop.
 *
 * A plain `restore` only un-minimizes the window and leaves it BEHIND the
 * foreground app, so clicking the dock/tray appears to "do nothing". This mirrors
 * what the toggle_app hotkey already does on its restore leg. (For an exclusive
 * fullscreen game the desktop-only main window still can't paint over the game;
 * borderless/windowed — the common case — surfaces correctly.)
 */
export const revealMainWindowToFront = async (
  windowName = MAIN_WINDOW_NAME,
): Promise<void> => {
  await restoreWindowPreservingPlacement(windowName);
  await surfaceWindowOverExternalApp(windowName);
};
