/**
 * Re-sync shared state when an Overwolf window returns from being hidden.
 * Hidden extension windows can miss cross-window `storage` events while their
 * Chromium context is suspended, so visibility/focus is a required fallback.
 */
export const subscribeWindowResume = (listener: () => void): (() => void) => {
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") listener();
  };

  window.addEventListener("focus", listener);
  document.addEventListener("visibilitychange", onVisibilityChange);

  return () => {
    window.removeEventListener("focus", listener);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
};
