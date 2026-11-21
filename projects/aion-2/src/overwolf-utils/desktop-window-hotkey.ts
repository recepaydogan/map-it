import {
  getOpenWindow,
  isMainWindowBehindGame,
  minimizeWindow,
  revealMainWindowToFront,
} from "./window-manager";

type DesktopWindow = Window & { overwolf?: typeof overwolf };

/** Query the desktop window, not the invisible background handling the hotkey. */
const isDesktopWindowCovered = (windowName: string): Promise<boolean> =>
  new Promise((resolve) => {
    let focused = false;
    let settled = false;
    const finish = (covered: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(covered);
    };
    const unavailable = (reason: unknown) => {
      if (settled) return;
      console.warn("[Desktop hotkey] Could not check window visibility", reason);
      // If visibility is unavailable, never minimize an unfocused window that
      // the user may be trying to retrieve from behind another application.
      finish(!focused);
    };
    const timeout = setTimeout(() => unavailable("Visibility query timed out"), 500);
    try {
      overwolf.windows.getOpenWindows((windows) => {
        if (settled) return;
        try {
          const desktop = windows[windowName] as DesktopWindow | undefined;
          if (!desktop) { unavailable("Desktop window is unavailable"); return; }
          focused = desktop.document.hasFocus();
          if (focused) { finish(false); return; }
          const api = desktop.overwolf?.windows;
          if (!api?.isWindowVisibleToUser) { unavailable("Visibility API is unavailable"); return; }
          api.isWindowVisibleToUser((result) => {
            if (!result.success) { unavailable(result); return; }
            // Runtime documentation uses "fully"; older typings use "full".
            const visible: string = result.visible;
            if (visible === "hidden" || visible === "partial") finish(true);
            else if (visible === "full" || visible === "fully") finish(false);
            else unavailable(result);
          });
        } catch (error) {
          unavailable(error);
        }
      });
    } catch (error) {
      unavailable(error);
    }
  });

/** Keep visible-window toggling, but reveal a covered desktop on the first press. */
export const toggleDesktopWindow = async (): Promise<void> => {
  const windowName = "main";
  if (isMainWindowBehindGame()) {
    await revealMainWindowToFront(windowName);
    return;
  }
  const current = await getOpenWindow(windowName);
  const state = current?.stateEx ?? current?.state;
  if (!current || state === "minimized" || state === "hidden" || state === "closed" ||
      await isDesktopWindowCovered(windowName)) {
    await revealMainWindowToFront(windowName);
    return;
  }
  await minimizeWindow(windowName);
};
