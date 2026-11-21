/**
 * Seen-flag and hide signal for the one-time Help & Feedback nudge. Lives
 * outside the component file so the title bar's button can retire the nudge
 * without breaking React fast refresh.
 */

const STORAGE_KEY = "elden-ring-atlas:support-nudge";

export const isSupportNudgeSeen = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Storage unavailable: claim "seen" so the nudge can't reappear every launch.
    return true;
  }
};

const hideListeners = new Set<() => void>();

export const onSupportNudgeSeen = (hide: () => void): (() => void) => {
  hideListeners.add(hide);
  return () => hideListeners.delete(hide);
};

/**
 * Retire the nudge for good. Also called when the user clicks the Help &
 * Feedback button itself — whoever found the button doesn't need the pointer,
 * and a visible nudge folds away at that moment.
 */
export const markSupportNudgeSeen = (): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* storage unavailable — mounted nudges still hide via the listeners */
  }
  hideListeners.forEach((hide) => hide());
};
