/**
 * Platform awareness. One bundle ships to two homes:
 *   • Overwolf  — the frameless native window (custom title bar, ad rail, GEP).
 *   • The web   — the same app served as a website / mobile site (no native
 *                 chrome, no ads, touch-first).
 *
 * Overwolf injects the global `overwolf` object before our scripts run, so this
 * is reliable at module-load time. Gating native-only UI on `IS_OVERWOLF` keeps
 * the Overwolf experience byte-identical while the web build sheds the chrome it
 * can't use.
 *
 * Note: the Overwolf main window has a hard 1300px min width, so any responsive
 * Tailwind utility scoped below that (e.g. `max-lg:`, `md:`) can never fire
 * inside Overwolf — making mobile layout work safe by construction.
 */
import { useCallback, useSyncExternalStore } from "react";

/** True when running inside an Overwolf client (native window present). */
export const IS_OVERWOLF = typeof overwolf !== "undefined";

/** True on the plain-web build (website / mobile site). */
export const IS_WEB = !IS_OVERWOLF;

/** Open a URL the right way for the current host. */
export const openExternalUrl = (url: string): void => {
  if (!url) return;
  if (IS_OVERWOLF && overwolf.utils?.openUrlInDefaultBrowser) {
    overwolf.utils.openUrlInDefaultBrowser(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
};

const MOBILE_QUERY = "(max-width: 768px)";

/** One MediaQueryList per query — the store must hand back a stable object so
 *  useSyncExternalStore doesn't resubscribe on every render. */
const mqlCache = new Map<string, MediaQueryList>();
const mqlFor = (query: string): MediaQueryList | null => {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  let mql = mqlCache.get(query);
  if (!mql) {
    mql = window.matchMedia(query);
    mqlCache.set(query, mql);
  }
  return mql;
};

/** Reactive `matchMedia` flag. Server/no-matchMedia hosts report `false`. */
export const useMediaQuery = (query: string): boolean =>
  useSyncExternalStore(
    useCallback(
      (onChange: () => void) => {
        const mql = mqlFor(query);
        if (!mql) return () => {};
        mql.addEventListener("change", onChange);
        return () => mql.removeEventListener("change", onChange);
      },
      [query],
    ),
    () => mqlFor(query)?.matches ?? false,
    () => false,
  );

/**
 * Reactive "is this a phone-width viewport" flag. Always `false` in Overwolf
 * (min window width 1300px), so components can branch on it freely without ever
 * touching the desktop/Overwolf layout.
 */
export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY);
