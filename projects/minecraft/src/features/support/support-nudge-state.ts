const STORAGE_KEY = "gm:support-nudge-seen";

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
    // The mounted callout still hides through the listeners.
  }
  hideListeners.forEach(hide => hide());
};
