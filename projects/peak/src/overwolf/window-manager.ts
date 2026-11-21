import { APP_CONFIG } from "../config/app-config";
import {
  initializeOverlayDefaultPlacement,
  placeOverlayAtDefaultIfNeeded,
} from "./overlay-default-placement";

type WindowInfo = overwolf.windows.WindowResult["window"];
type WindowStateHandler = (state: string) => void;

interface DragOptions {
  disableDoubleClickMaximize?: boolean;
}

const DRAG_EXCLUSION_SELECTOR =
  "[data-ow-no-drag], button, a, input, textarea, select, option, [role='button']";
const SIGNIFICANT_MOUSE_MOVE_THRESHOLD = 4;

const getWindowState = (windowInfo: WindowInfo): string =>
  String(windowInfo.stateEx ?? windowInfo.state ?? "").toLowerCase();

initializeOverlayDefaultPlacement();

export const getCurrentWindow = (): Promise<WindowInfo | null> =>
  new Promise((resolve) => {
    if (typeof overwolf === "undefined" || !overwolf.windows?.getCurrentWindow) {
      resolve(null);
      return;
    }
    overwolf.windows.getCurrentWindow((result) => {
      resolve(result?.success ? result.window : null);
    });
  });

export const getWindow = (windowName: string): Promise<WindowInfo | null> =>
  new Promise((resolve) => {
    if (typeof overwolf === "undefined" || !overwolf.windows?.getWindow) {
      resolve(null);
      return;
    }
    overwolf.windows.getWindow(windowName, (result) => {
      resolve(result?.success ? result.window : null);
    });
  });

const obtainWindow = (windowName: string): Promise<WindowInfo> =>
  new Promise((resolve, reject) => {
    overwolf.windows.obtainDeclaredWindow(windowName, (result) => {
      if (result?.success) resolve(result.window);
      else reject(new Error(result?.error ?? `Unable to obtain ${windowName}`));
    });
  });

/** How long the window stays pinned on top after being surfaced. Always
 * released again so it can never get stuck always-on-top. */
const TOPMOST_PIN_MS = 1200;

const bringToFront = (windowId: string): void => {
  const windowsApi = overwolf.windows as unknown as {
    bringToFront?: (id: string, grabFocus: boolean, callback: () => void) => void;
  };
  windowsApi.bringToFront?.(windowId, true, () => undefined);
};

const setTopmost = (windowId: string, topmost: boolean): void => {
  const windowsApi = overwolf.windows as unknown as {
    setTopmost?: (id: string, shouldBeTopmost: boolean, callback: () => void) => void;
  };
  windowsApi.setTopmost?.(windowId, topmost, () => undefined);
};

export const restoreWindow = async (windowName: string): Promise<WindowInfo | null> => {
  if (typeof overwolf === "undefined") return null;
  const windowInfo = await obtainWindow(windowName);
  if (windowName === APP_CONFIG.overlayWindowName) {
    await placeOverlayAtDefaultIfNeeded(windowInfo);
  }
  await new Promise<void>((resolve, reject) => {
    overwolf.windows.restore(windowInfo.id, (result) => {
      if (result?.success) resolve();
      else reject(new Error(result?.error ?? `Unable to restore ${windowName}`));
    });
  });
  bringToFront(windowInfo.id);
  return windowInfo;
};

/**
 * Restore the window and surface it over whatever holds the foreground — the
 * game, usually. A plain restore leaves it behind a fullscreen game, which is
 * what makes a dock or tray click look like it did nothing.
 */
export const revealWindow = async (windowName: string): Promise<void> => {
  const windowInfo = await restoreWindow(windowName);
  if (!windowInfo) return;
  setTopmost(windowInfo.id, true);
  setTimeout(() => setTopmost(windowInfo.id, false), TOPMOST_PIN_MS);
};

export const hideWindow = async (windowName: string): Promise<void> => {
  if (typeof overwolf === "undefined") return;
  const windowInfo = await obtainWindow(windowName);
  await new Promise<void>((resolve) => {
    overwolf.windows.hide(windowInfo.id, () => resolve());
  });
};

export const closeWindow = async (windowName: string): Promise<void> => {
  if (typeof overwolf === "undefined") return;
  const windowInfo = await getWindow(windowName);
  if (!windowInfo) return;
  await new Promise<void>((resolve) => {
    overwolf.windows.close(windowInfo.id, () => resolve());
  });
};

export const toggleWindow = async (windowName: string): Promise<void> => {
  const windowInfo = await getWindow(windowName);
  if (!windowInfo || ["closed", "hidden", "minimized"].includes(getWindowState(windowInfo))) {
    await restoreWindow(windowName);
    return;
  }
  await hideWindow(windowName);
};

export const minimizeCurrentWindow = (): void => {
  void getCurrentWindow().then((windowInfo) => {
    if (windowInfo) overwolf.windows.minimize(windowInfo.id, () => undefined);
  });
};

export const hideCurrentWindow = (): void => {
  void getCurrentWindow().then((windowInfo) => {
    if (windowInfo) overwolf.windows.hide(windowInfo.id, () => undefined);
  });
};

export const closeCurrentWindow = (): void => {
  void getCurrentWindow().then((windowInfo) => {
    if (windowInfo) overwolf.windows.close(windowInfo.id, () => undefined);
  });
};

export const resizeCurrentWindowFromTopLeft = (): void => {
  void getCurrentWindow().then((windowInfo) => {
    if (!windowInfo) return;
    overwolf.windows.dragResize(
      windowInfo.id,
      "TopLeft" as Parameters<typeof overwolf.windows.dragResize>[1],
    );
  });
};

export const toggleCurrentWindowMaximize = (): void => {
  void getCurrentWindow().then((windowInfo) => {
    if (!windowInfo) return;
    if (getWindowState(windowInfo) === "maximized") {
      overwolf.windows.restore(windowInfo.id, () => undefined);
    } else {
      overwolf.windows.maximize(windowInfo.id, () => bringToFront(windowInfo.id));
    }
  });
};

export const subscribeToCurrentWindowState = (
  handler: WindowStateHandler,
): (() => void) => {
  if (typeof overwolf === "undefined" || !overwolf.windows?.onStateChanged) {
    return () => undefined;
  }

  let currentWindowId: string | null = null;
  let currentWindowName: string | null = null;
  void getCurrentWindow().then((windowInfo) => {
    if (!windowInfo) return;
    currentWindowId = windowInfo.id;
    currentWindowName = windowInfo.name;
    handler(getWindowState(windowInfo));
  });

  const listener = (event: {
    window_id?: string;
    window_name?: string;
    window_state_ex?: string;
    window_state?: string;
  }) => {
    const matchesWindow =
      (event.window_id && currentWindowId && event.window_id === currentWindowId)
      || (event.window_name && currentWindowName && event.window_name === currentWindowName);
    if (!matchesWindow) return;
    handler(String(event.window_state_ex ?? event.window_state ?? "").toLowerCase());
  };

  overwolf.windows.onStateChanged.addListener(listener);
  return () => overwolf.windows.onStateChanged.removeListener(listener);
};

export const bindDragMoveElement = (
  element: HTMLElement | null,
  options: DragOptions = {},
): (() => void) => {
  if (!element || typeof overwolf === "undefined") return () => undefined;

  let mouseDown = false;
  let initialMousePosition: { x: number; y: number } | null = null;
  let suppressNextClick = false;

  const resetDrag = () => {
    mouseDown = false;
    initialMousePosition = null;
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    suppressNextClick = false;
    const target = event.target;
    if (target instanceof Element && target.closest(DRAG_EXCLUSION_SELECTOR)) return;
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
      diffX <= SIGNIFICANT_MOUSE_MOVE_THRESHOLD
      && diffY <= SIGNIFICANT_MOUSE_MOVE_THRESHOLD
    ) return;

    suppressNextClick = true;
    resetDrag();
    void getCurrentWindow().then((windowInfo) => {
      if (windowInfo) overwolf.windows.dragMove(windowInfo.id, () => undefined);
    });
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!suppressNextClick) return;
    suppressNextClick = false;
    event.stopImmediatePropagation();
    event.preventDefault();
  };

  element.classList.add("ow-drag");
  element.addEventListener("mousedown", onMouseDown);
  element.addEventListener("mousemove", onMouseMove);
  element.addEventListener("mouseup", resetDrag);
  element.addEventListener("mouseleave", resetDrag);
  element.addEventListener("click", onClickCapture, true);
  return () => {
    element.classList.remove("ow-drag");
    element.removeEventListener("mousedown", onMouseDown);
    element.removeEventListener("mousemove", onMouseMove);
    element.removeEventListener("mouseup", resetDrag);
    element.removeEventListener("mouseleave", resetDrag);
    element.removeEventListener("click", onClickCapture, true);
  };
};
