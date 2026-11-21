import { useEffect, useState } from "react";
import { GAME_TELEMETRY } from "../../game-config";
import { readGameSessionState, SESSION_CHANGED_EVENT } from "./session-storage";
import { getSessionStatus } from "./session-types";

export const useGameSession = () => {
  const [read, setRead] = useState(readGameSessionState);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const refresh = () => { setRead(readGameSessionState()); setNow(Date.now()); };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === GAME_TELEMETRY.storageKey) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    // Subscribe before reconciling so an update during mount is not missed.
    refresh();
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.clearInterval(timer);
    };
  }, []);
  return { ...read, now, status: read.error ? "error" as const : getSessionStatus(read.session, now, GAME_TELEMETRY.staleAfterMs) };
};
