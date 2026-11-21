/**
 * Shared Overwolf utility helpers.
 * Centralises common patterns so every module uses the same guards.
 */

/** Whether the current runtime is an Overwolf environment. */
export const isOverwolf = () => typeof overwolf !== "undefined";

/** Run `callback` with the current Overwolf window id, no-op outside Overwolf. */
export const withCurrentWindow = (callback: (windowId: string) => void) => {
  if (!isOverwolf()) return;
  overwolf.windows.getCurrentWindow((result) => {
    if (result.success) callback(result.window.id);
  });
};

/**
 * Send a message to the Overwolf background window.
 * Returns `true` if the message was dispatched, `false` otherwise.
 */
export const sendToBackground = (id: string, content?: unknown): boolean => {
  if (!isOverwolf() || !overwolf.windows?.sendMessage) return false;
  overwolf.windows.sendMessage("background", id, content ?? {}, () => {});
  return true;
};

/** Move the current window to absolute screen coordinates (no-op outside Overwolf). */
export const moveCurrentWindow = (left: number, top: number) => {
  withCurrentWindow((windowId) =>
    overwolf.windows.changePosition(
      windowId,
      Math.round(left),
      Math.round(top),
      () => {},
    ),
  );
};

/** Resize the current window then move it, in one DPI-aware step. */
export const resizeAndMoveCurrentWindow = (
  width: number,
  height: number,
  left: number,
  top: number,
) => {
  withCurrentWindow((windowId) =>
    overwolf.windows.changeSize(
      {
        window_id: windowId,
        width: Math.round(width),
        height: Math.round(height),
        auto_dpi_resize: true,
      },
      () => {
        overwolf.windows.changePosition(
          windowId,
          Math.round(left),
          Math.round(top),
          () => {},
        );
      },
    ),
  );
};
