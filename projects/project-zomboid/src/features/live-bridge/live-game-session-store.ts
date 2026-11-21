import { useCallback, useEffect, useState } from "react";
import type { LiveGameSession } from "./live-game-session-types";

export const LIVE_GAME_SESSION_STORAGE_KEY = "pzim:live-game-session";
const LIVE_GAME_SESSION_EVENT = "pzim:live-game-session-changed";

const parseStringList = (value: unknown) => Array.isArray(value)
  && value.every((entry) => typeof entry === "string" && entry.length > 0 && entry.length <= 200)
  ? [...new Set(value)] as string[]
  : null;

export const parseLiveGameSession = (value: string | null): LiveGameSession | null => {
  if (!value) return null;
  try {
    const session = JSON.parse(value) as Partial<LiveGameSession>;
    const modIds = parseStringList(session.modIds);
    const mapFolders = parseStringList(session.mapFolders);
    return session.version === 1
      && typeof session.updatedAt === "number"
      && Number.isFinite(session.updatedAt)
      && modIds
      && mapFolders
      ? { version: 1, updatedAt: session.updatedAt, modIds, mapFolders }
      : null;
  } catch {
    return null;
  }
};

export const readLiveGameSession = () => parseLiveGameSession(
  localStorage.getItem(LIVE_GAME_SESSION_STORAGE_KEY),
);

export const publishLiveGameSession = (session: LiveGameSession) => {
  localStorage.setItem(LIVE_GAME_SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event(LIVE_GAME_SESSION_EVENT));
};

export const clearLiveGameSession = () => {
  localStorage.removeItem(LIVE_GAME_SESSION_STORAGE_KEY);
  window.dispatchEvent(new Event(LIVE_GAME_SESSION_EVENT));
};

export const useLiveGameSession = () => {
  const [session, setSession] = useState<LiveGameSession | null>(readLiveGameSession);
  const refresh = useCallback(() => setSession(readLiveGameSession()), []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LIVE_GAME_SESSION_STORAGE_KEY && event.key !== null) return;
      refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(LIVE_GAME_SESSION_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(LIVE_GAME_SESSION_EVENT, refresh);
    };
  }, [refresh]);

  return session;
};
