import { create } from "zustand";

/**
 * Release announcement state. One release at a time, gated on a single stored id
 * so an update speaks up exactly once and never nags again.
 *
 * Deliberately NOT part of the key-hints machinery: those are lessons about
 * controls the player will meet anyway, and they whisper from the corner. A
 * release note is a different thing — something the app WANTS to say — so it gets
 * its own moment on screen and its own memory.
 */

const STORAGE_KEY = "elden-ring-atlas:whats-new";

/**
 * Id of the announcement the app currently has to make. Bump this (and the copy
 * under `whatsNew.*`) when a release has something worth showing; leave it alone
 * and nothing appears. The stored value is compared verbatim, so an id that was
 * already seen stays seen even if the app version moves on.
 */
export const CURRENT_RELEASE = "1.0.6-boss-builds";

const seenRelease = (): string | null => {
  try {
    return typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  } catch {
    return null;
  }
};

const markSeen = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, CURRENT_RELEASE);
  } catch {
    /* private mode / disabled storage — worst case it greets them once more */
  }
};

interface WhatsNewStore {
  /** True while the announcement is on screen. */
  open: boolean;
  /** Show it (auto on first launch after the update, or from Settings → Help). */
  show: () => void;
  /** Close it and remember this release has been announced. */
  dismiss: () => void;
}

export const useWhatsNew = create<WhatsNewStore>((set) => ({
  open: false,
  show: () => set({ open: true }),
  dismiss: () => {
    markSeen();
    set({ open: false });
  },
}));

/**
 * True only for a player who already knows the app and hasn't been told about
 * this release yet.
 *
 * A brand-new install is explicitly NOT told: they get the guided tour, and being
 * handed "here's what changed" about an app you have never seen is noise. The
 * caller marks the release seen for them so it can never surface later either —
 * by then it isn't news, it's just how the app works.
 */
export const shouldAutoOpenWhatsNew = (hasOnboarded: boolean): boolean => {
  if (seenRelease() === CURRENT_RELEASE) return false;
  if (!hasOnboarded) {
    markSeen();
    return false;
  }
  return true;
};
