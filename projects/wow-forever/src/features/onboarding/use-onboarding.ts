import { useSyncExternalStore } from "react";

/**
 * First-run onboarding tour state. Deliberately tiny and decoupled from the
 * saved-map state: the only durable bit is a single "seen" flag in
 * localStorage. The versioned flag lets a substantially revised tour run once
 * for existing users and still allows replay from Settings → Help.
 *
 * A hand-rolled module store (same pattern as the tooltip singleton) — this app
 * doesn't ship a store library, and one boolean doesn't justify adding one.
 */

const STORAGE_KEY = "gm:onboarded-v3";

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

let active = false;
const listeners = new Set<() => void>();
export const isOnboardingActive = (): boolean => active;

const notify = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Open the tour from step one (used by auto-start and the Settings replay). */
export const startOnboarding = (): void => {
  if (active) return;
  active = true;
  notify();
};

/** Close the tour and remember it's been seen, so it won't auto-open again. */
export const finishOnboarding = (): void => {
  markSeen();
  if (!active) return;
  active = false;
  notify();
};

/** True while the guided tour is on screen. */
export const useOnboardingActive = (): boolean =>
  useSyncExternalStore(subscribe, () => active, () => false);

/** True only on the very first launch (no completion flag stored yet). */
export const shouldAutoStartOnboarding = (): boolean => !hasSeenOnboarding();
