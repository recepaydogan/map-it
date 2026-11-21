import { create } from "zustand";

/**
 * One-shot spotlight on the "Build for this boss" entry point.
 *
 * The build advisor is the newest thing in the panel and it hides behind a button
 * that reads like every other button, so the first boss a player opens gets an
 * accent-lit version of it. The same contract as the contextual key hints: it
 * retires the moment the feature is actually used, and never returns — a nudge
 * that keeps nudging after you have taken it is just noise.
 */

const STORAGE_KEY = "elden-ring-atlas:build-cta-v1";

const wasUsed = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

interface BuildCtaStore {
  /** True while the button should still draw attention to itself. */
  pending: boolean;
  /** The player opened the build — stop highlighting it, now and in every session. */
  markUsed: () => void;
}

export const useBuildCta = create<BuildCtaStore>((set) => ({
  pending: !wasUsed(),
  markUsed: () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode / disabled storage — it just highlights once more next launch */
    }
    set({ pending: false });
  },
}));
