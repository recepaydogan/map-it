/**
 * Seen flag and hide signal for the one-time Help & Feedback nudge. Keeping it
 * outside the component lets the header button retire a mounted nudge directly.
 */

const STORAGE_KEY = "pzim:support-nudge";

export const isSupportNudgeSeen = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
};

const hideListeners = new Set<() => void>();

export const onSupportNudgeSeen = (hide: () => void): (() => void) => {
  hideListeners.add(hide);
  return () => hideListeners.delete(hide);
};

export const markSupportNudgeSeen = (): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* The mounted nudge still hides through the listeners. */
  }
  hideListeners.forEach((hide) => hide());
};
