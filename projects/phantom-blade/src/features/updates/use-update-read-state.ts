import { useCallback, useEffect, useState } from "react";

// Earlier builds showed a placeholder, so the first release note starts unread.
const STORAGE_KEY = "phantom-blade-app:updates-last-read-version:v2";

const lastReadVersion = (): string | null => {
  try { return window.localStorage.getItem(STORAGE_KEY); }
  catch (error) { console.warn("Could not read the last viewed update version.", error); return null; }
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
    catch (error) { console.warn("Could not save the viewed update version.", error); }
  }, [version]);
  return { unread: lastRead !== version, markRead };
};
