export type FollowTarget = "self" | number | null;

const STORAGE_KEY = "peak-map:desktop-follow-session";

function readDesktopFollowTarget(gameStartedAt: number): FollowTarget | undefined {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    const target: unknown = saved?.target;
    if (saved?.gameStartedAt === gameStartedAt &&
      (target === "self" || target === null || (typeof target === "number" && Number.isInteger(target)))) return target;
  } catch (error) {
    console.warn("[Desktop follow] Could not read the saved target", error);
  }
}

export function writeDesktopFollowTarget(gameStartedAt: number, target: FollowTarget): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ gameStartedAt, target }));
}

export function getDesktopFollowOnFirstFix(session: number | null, hasPosition: boolean, handled: number | null) {
  if (session === null || !hasPosition || session === handled) return null;
  const target = readDesktopFollowTarget(session);
  return { session, target: target === undefined ? "self" as const : target };
}
