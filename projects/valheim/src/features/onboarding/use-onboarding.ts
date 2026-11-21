import { create } from "zustand";

const STORAGE_KEY = "valheim-companion:onboarded-v1";

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
    // Onboarding still works for this session when browser storage is unavailable.
  }
};

interface OnboardingStore {
  active: boolean;
  start: () => void;
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

export const shouldAutoStartOnboarding = (): boolean => !hasSeenOnboarding();
