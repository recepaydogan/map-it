const STORAGE_KEY = "pzim:faq-discovery-v1";

const listeners = new Set<() => void>();

export const isFaqDiscoverySeen = (): boolean => {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
};

export const markFaqDiscoverySeen = (): void => {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* The mounted control still updates through the listeners below. */
  }
  listeners.forEach((listener) => listener());
};

export const onFaqDiscoverySeen = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const isFaqDiscoveryStorageKey = (key: string | null): boolean => key === STORAGE_KEY;
