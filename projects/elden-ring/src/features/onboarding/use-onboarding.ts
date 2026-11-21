import { create } from "zustand";

/**
 * First-run onboarding tour state. Deliberately tiny and decoupled from the
 * persisted map-store: the only durable bit is a single "seen" flag in
 * localStorage, so the tour auto-opens exactly once and can be replayed on
 * demand (Settings → Help) without touching the rest of the app's state.
 */

const STORAGE_KEY = "elden-ring-atlas:onboarded-v1";

const hasSeenOnboarding = (): boolean => {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
};

const markSeen = (): void => {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* private mode / disabled storage — the tour just runs again next launch */
  }
};

interface OnboardingStore {
  /** True while the guided tour is on screen. */
  active: boolean;
  /** Open the tour from step one (used by auto-start and the Settings replay). */
  start: () => void;
  /** Close the tour and remember it's been seen, so it won't auto-open again. */
  finish: () => void;
}

export const useOnboarding = create<OnboardingStore>((set) => ({
  active: false,
  start: () => set({ active: true }),
  finish: () => {
    markSeen();
    set({ active: false });
  },
}));

/** True only on the very first launch (no completion flag stored yet). */
export const shouldAutoStartOnboarding = (): boolean => !hasSeenOnboarding();
