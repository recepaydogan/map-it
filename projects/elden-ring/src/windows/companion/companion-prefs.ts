/**
 * Companion-local preferences.
 *
 * Deliberately plain localStorage rather than the map store: none of this is
 * player PROGRESS (which is what cloud-sync owns), it's just where the companion
 * was left — and it has to survive the window being closed and reopened, which a
 * module-level variable would not.
 *
 * Marker ids, never names: names are localized and would break on a language
 * switch; a marker id is stable for the life of the extracted data.
 */

const TAB_KEY = "era:companion:tab";
const RECENT_KEY = "era:companion:recentBosses";
const RECENT_LIMIT = 6;

export type CompanionTab = "boss" | "find";

const read = (key: string): string | null => {
  try {
    return window.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    window.localStorage?.setItem(key, value);
  } catch {
    // Storage unavailable — the companion just forgets where it was.
  }
};

export const readCompanionTab = (): CompanionTab =>
  read(TAB_KEY) === "find" ? "find" : "boss";

export const writeCompanionTab = (tab: CompanionTab): void => write(TAB_KEY, tab);

/** Most-recently-opened boss marker ids, newest first. */
export const readRecentBossIds = (): string[] => {
  const raw = read(RECENT_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
};

export const pushRecentBossId = (markerId: string): string[] => {
  const next = [markerId, ...readRecentBossIds().filter((id) => id !== markerId)].slice(
    0,
    RECENT_LIMIT,
  );
  write(RECENT_KEY, JSON.stringify(next));
  return next;
};
