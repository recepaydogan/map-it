import { useSyncExternalStore } from "react";

/**
 * First-run onboarding state. The only durable value is a single completion
 * flag, so the tour opens once automatically and can be replayed from Settings
 * without changing any other app state.
 */

const STORAGE_KEY = "peak-map:onboarded-v1";

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
    // If storage is unavailable, the tour simply runs again next launch.
  }
};

let active = false;
const listeners = new Set<() => void>();

const notify = (): void => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const startOnboarding = (): void => {
  if (active) return;
  active = true;
  notify();
};

export const finishOnboarding = (): void => {
  markSeen();
  if (!active) return;
  active = false;
  notify();
};

export const useOnboardingActive = (): boolean =>
  useSyncExternalStore(subscribe, () => active, () => false);

export const shouldAutoStartOnboarding = (): boolean => !hasSeenOnboarding();
