/**
 * Cross-window handshake for the single-monitor auto-open of the in-game app.
 *
 * The BACKGROUND window decides to auto-open the full-app overlay (15s after a
 * single-monitor game launch) and stamps localStorage right before expanding
 * it; the freshly-created in_game window consumes the stamp on mount and shows
 * a one-shot "toggle with <hotkey>" banner. localStorage is shared by every
 * window of the extension and is written before the window exists, so there is
 * no message race to lose.
 */

const STAMP_KEY = "gm:in-game-auto-open";

/** How old a stamp may be and still count as "this window was auto-opened". */
const STAMP_MAX_AGE_MS = 60_000;

/** Called by the background window right before auto-expanding the overlay. */
export const markInGameAutoOpened = (): void => {
  try {
    window.localStorage.setItem(STAMP_KEY, String(Date.now()));
  } catch {
    // Storage unavailable — the overlay still opens, only the banner is lost.
  }
};

/** One-shot read: true when this window was just auto-opened. Clears the stamp. */
export const consumeInGameAutoOpened = (): boolean => {
  try {
    const raw = window.localStorage.getItem(STAMP_KEY);
    if (!raw) return false;
    window.localStorage.removeItem(STAMP_KEY);
    const stampedAt = Number(raw);
    return Number.isFinite(stampedAt) && Date.now() - stampedAt < STAMP_MAX_AGE_MS;
  } catch {
    return false;
  }
};
