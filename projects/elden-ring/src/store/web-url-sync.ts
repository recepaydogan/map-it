import { type OverlayKey, useUiStore } from "./ui-store";
import { IS_OVERWOLF } from "../utils/platform";

/**
 * Web-only: mirrors `activeOverlay` into the URL path so each surface counts as
 * a real pageview in Vercel Analytics (its script tracks History pushState) and
 * every screen becomes deep-linkable below the website's /map product route.
 *
 * Never runs in Overwolf — the app there boots from local OPK files where URL
 * paths are meaningless, and app-side analytics stay PostHog's job.
 *
 * Needs the /map SPA rewrite in vercel.json so a reload on /map/settings still
 * serves app.html.
 */

const PATHS: Record<OverlayKey, string> = {
  codex: "/map/codex",
  classes: "/map/classes",
  dialogue: "/map/dialogue",
  nightfarers: "/map/nightfarers",
  nightlords: "/map/nightlords",
  relics: "/map/relics",
  guide: "/map/guide",
  account: "/map/account",
  settings: "/map/settings",
  support: "/map/support",
  notesAdmin: "/map/notes-admin",
};

/** null = /map as well as an unknown path — both mean the live map. */
const overlayForPath = (pathname: string): OverlayKey | null => {
  const hit = (Object.keys(PATHS) as OverlayKey[]).find((k) => PATHS[k] === pathname);
  return hit ?? null;
};

export const startWebUrlSync = () => {
  if (IS_OVERWOLF || typeof window === "undefined") return;

  // Deep link: booting on /map/settings (etc.) opens that surface. Runs after the
  // store's own ?codex=1 bootstrap, so a path wins over the legacy query param.
  const initial = overlayForPath(window.location.pathname);
  if (initial) useUiStore.setState({ activeOverlay: initial });

  // Store → URL. Keep the search string (?window= in dev, ?codex=1 links) intact.
  useUiStore.subscribe((state, prev) => {
    if (state.activeOverlay === prev.activeOverlay) return;
    const path = state.activeOverlay ? PATHS[state.activeOverlay] : "/map";
    if (window.location.pathname === path) return; // already there (popstate case)
    window.history.pushState(null, "", path + window.location.search);
  });

  // URL → store, so the browser back/forward buttons navigate the app instead
  // of stranding the URL out of sync with what's on screen.
  window.addEventListener("popstate", () => {
    useUiStore.setState({ activeOverlay: overlayForPath(window.location.pathname) });
  });
};
