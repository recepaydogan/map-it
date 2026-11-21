import { useSyncExternalStore } from "react";

const STORAGE_KEY = "map-it:font-scale-percent";

export const FONT_SCALE_MIN_PERCENT = 100;
export const FONT_SCALE_MAX_PERCENT = 140;
export const FONT_SCALE_STEP_PERCENT = 10;

const normalize = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) return FONT_SCALE_MIN_PERCENT;
  const stepped = Math.round(value / FONT_SCALE_STEP_PERCENT) * FONT_SCALE_STEP_PERCENT;
  return Math.min(FONT_SCALE_MAX_PERCENT, Math.max(FONT_SCALE_MIN_PERCENT, stepped));
};

const read = (): number => {
  try {
    return normalize(Number(window.localStorage.getItem(STORAGE_KEY) ?? FONT_SCALE_MIN_PERCENT));
  } catch {
    return FONT_SCALE_MIN_PERCENT;
  }
};

const listeners = new Set<() => void>();
let percent = typeof window === "undefined" ? FONT_SCALE_MIN_PERCENT : read();

const apply = (): void => {
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty("--app-font-scale", String(percent / 100));
  }
};

apply();

const notify = (): void => {
  apply();
  for (const listener of listeners) listener();
};

export const setFontScalePercent = (value: number): void => {
  const next = normalize(value);
  if (next === percent) return;
  percent = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    // The setting still applies in this window when storage is unavailable.
  }
  notify();
};

export const useFontScalePercent = (): number => useSyncExternalStore(
  (listener) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
  () => percent,
  () => FONT_SCALE_MIN_PERCENT,
);

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const next = read();
    if (next === percent) return;
    percent = next;
    notify();
  });
}
