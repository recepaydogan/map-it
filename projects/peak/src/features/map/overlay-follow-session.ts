interface OverlayFollowSession {
  gameStartedAt: number;
  enabled: boolean;
}

const STORAGE_KEY = "peak-map:overlay-follow-session";

export const readOverlayFollowSession = (): OverlayFollowSession | null => {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as unknown;
    if (
      typeof parsed !== "object"
      || parsed === null
      || !("gameStartedAt" in parsed)
      || !("enabled" in parsed)
      || typeof parsed.gameStartedAt !== "number"
      || typeof parsed.enabled !== "boolean"
    ) {
      return null;
    }
    return parsed as OverlayFollowSession;
  } catch {
    return null;
  }
};

export const writeOverlayFollowSession = (
  gameStartedAt: number,
  enabled: boolean,
): void => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameStartedAt, enabled }));
};
