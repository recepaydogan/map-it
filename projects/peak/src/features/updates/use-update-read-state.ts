import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "peak-map:updates-last-read-version";

const lastReadVersion = (): string | null => {
  try { return window.localStorage.getItem(STORAGE_KEY); }
  catch { return null; }
};

export const useUpdateReadState = (version: string) => {
  const [lastRead, setLastRead] = useState(lastReadVersion);
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) setLastRead(lastReadVersion());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const markRead = useCallback(() => {
    setLastRead(version);
    try { window.localStorage.setItem(STORAGE_KEY, version); }
    catch { /* Keep the in-memory read state when storage is unavailable. */ }
  }, [version]);
  return { unread: lastRead !== version, markRead };
};
