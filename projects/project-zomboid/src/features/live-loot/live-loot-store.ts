import { useCallback, useEffect, useState } from "react";
import type { LiveLootSnapshot } from "./live-loot-types";

export const LIVE_LOOT_STORAGE_KEY = "pzim:live-loot";
const LIVE_LOOT_EVENT = "pzim:live-loot-changed";

const parseLiveLoot = (value: string | null): LiveLootSnapshot | null => {
  if (!value) return null;

  try {
    const snapshot = JSON.parse(value) as Partial<LiveLootSnapshot>;
    return snapshot.version === 1
      && typeof snapshot.sequence === "number"
      && Number.isFinite(snapshot.sequence)
      && typeof snapshot.updatedAt === "number"
      && Number.isFinite(snapshot.updatedAt)
      && typeof snapshot.receivedAt === "number"
      && Number.isFinite(snapshot.receivedAt)
      && Array.isArray(snapshot.containers)
      ? snapshot as LiveLootSnapshot
      : null;
  } catch {
    return null;
  }
};

export const readLiveLoot = () => parseLiveLoot(localStorage.getItem(LIVE_LOOT_STORAGE_KEY));

export const publishLiveLoot = (snapshot: LiveLootSnapshot) => {
  localStorage.setItem(LIVE_LOOT_STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new Event(LIVE_LOOT_EVENT));
};

export const clearLiveLoot = () => {
  localStorage.removeItem(LIVE_LOOT_STORAGE_KEY);
  window.dispatchEvent(new Event(LIVE_LOOT_EVENT));
};

export const useLiveLoot = () => {
  const [snapshot, setSnapshot] = useState<LiveLootSnapshot | null>(readLiveLoot);
  const refresh = useCallback(() => setSnapshot(readLiveLoot()), []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LIVE_LOOT_STORAGE_KEY && event.key !== null) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LIVE_LOOT_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LIVE_LOOT_EVENT, refresh);
    };
  }, [refresh]);

  return snapshot;
};
