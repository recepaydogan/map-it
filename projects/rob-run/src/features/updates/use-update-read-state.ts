import { useCallback, useSyncExternalStore } from "react";

export const UPDATE_READ_KEY = "wow-forever-map:updates-last-read-version";
const READ_EVENT = "wow-forever-map:updates-read";

export const lastReadUpdateVersion = (): string | null => {
  try { return window.localStorage.getItem(UPDATE_READ_KEY); }
  catch (error) { console.warn("Could not read the last viewed update version.", error); return null; }
};

export const hasUnreadUpdateVersion = (lastRead: string | null, version: string): boolean => {
  if (!lastRead || !/^\d+\.\d+\.\d+(?:\.\d+)?$/.test(lastRead)) return true;
  const read = lastRead.split(".").map(Number), current = version.split(".").map(Number);
  for (let index = 0; index < Math.max(read.length, current.length); index++) {
    if ((current[index] ?? 0) !== (read[index] ?? 0)) return (current[index] ?? 0) > (read[index] ?? 0);
  }
  return false;
};

export const subscribeUpdateReadState = (listener: () => void) => {
  const changed = (event: Event) => {
    if (!(event instanceof StorageEvent) || event.key === UPDATE_READ_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", changed);
  window.addEventListener(READ_EVENT, changed);
  return () => { window.removeEventListener("storage", changed); window.removeEventListener(READ_EVENT, changed); };
};

export const markUpdateVersionRead = (version: string) => {
  if (!hasUnreadUpdateVersion(lastReadUpdateVersion(), version)) return;
  try {
    window.localStorage.setItem(UPDATE_READ_KEY, version);
    window.dispatchEvent(new Event(READ_EVENT));
  } catch (error) { console.warn("Could not save the viewed update version.", error); }
};

export const useUpdateReadState = (version: string) => {
  const lastRead = useSyncExternalStore(subscribeUpdateReadState, lastReadUpdateVersion, () => null);
  const markRead = useCallback(() => markUpdateVersionRead(version), [version]);
  return { unread: hasUnreadUpdateVersion(lastRead, version), markRead };
};
