import { GAME_EDITIONS, GAME_TELEMETRY } from "../../game-config.ts";
import { decodeStoredSession, parseGameSession } from "./session-validation.ts";
import type { GameSession } from "./session-types.ts";

export const SESSION_CHANGED_EVENT = `${GAME_TELEMETRY.storageKey}:changed`;
const rules = { coordinateLimit: GAME_TELEMETRY.coordinateLimit, editions: GAME_EDITIONS };
let writeFailed = false;
export interface SessionRead { session: GameSession | null; error: "storage-unavailable" | "invalid-session" | null }

/** Persist only the normalized allow-listed session, never the raw GEP payload. */
export const publishGameSession = (session: GameSession) => {
  const normalized = parseGameSession(session, rules);
  try {
    localStorage.setItem(GAME_TELEMETRY.storageKey, JSON.stringify(normalized));
    writeFailed = false;
  } catch (error) {
    writeFailed = true;
    console.error("[Session] Unable to synchronize game session across windows", error);
  }
  window.dispatchEvent(new Event(SESSION_CHANGED_EVENT));
};

export const readGameSessionState = (): SessionRead => {
  if (writeFailed) return { session: null, error: "storage-unavailable" };
  let raw: string | null;
  try {
    raw = localStorage.getItem(GAME_TELEMETRY.storageKey);
  } catch (error) {
    console.error("[Session] Unable to read game session", error);
    return { session: null, error: "storage-unavailable" };
  }
  try { return { session: decodeStoredSession(raw, rules), error: null }; }
  catch (error) {
    console.error("[Session] Invalid synchronized game session", error);
    return { session: null, error: "invalid-session" };
  }
};

export const readGameSession = (): GameSession | null => readGameSessionState().session;
