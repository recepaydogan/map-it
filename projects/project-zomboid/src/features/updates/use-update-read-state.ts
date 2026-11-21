import { useCallback, useEffect, useState } from "react";

export const UPDATES_READ_STORAGE_KEY = "pzim:updates-last-read-version";

const readLastSeenVersion = () => {
  try {
    return window.localStorage.getItem(UPDATES_READ_STORAGE_KEY);
  } catch (error) {
    console.warn("Could not read the last viewed update version.", error);
    return null;
  }
};

export const useUpdateReadState = (version: string) => {
  const [lastSeenVersion, setLastSeenVersion] = useState(readLastSeenVersion);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === UPDATES_READ_STORAGE_KEY || event.key === null) {
        setLastSeenVersion(readLastSeenVersion());
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const markRead = useCallback(() => {
    setLastSeenVersion(version);
    try {
      window.localStorage.setItem(UPDATES_READ_STORAGE_KEY, version);
    } catch (error) {
      console.warn("Could not persist the viewed update version.", error);
    }
  }, [version]);

  return { unread: lastSeenVersion !== version, markRead };
};
