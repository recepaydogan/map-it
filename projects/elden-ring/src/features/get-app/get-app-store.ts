import { create } from "zustand";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";

/**
 * Where the visitor asked to see the pitch. Carried into analytics so the two
 * entry points can be compared — the title-bar pill is seen by everyone on a
 * desktop browser, the menu card only by people who opened the drawer.
 */
export type GetAppSource = "header" | "menu";

interface GetAppStore {
  /** The source that opened the dialog, or null when it is closed. One field
   *  rather than an `open` boolean + a source, so the two can never disagree. */
  source: GetAppSource | null;
  show: (source: GetAppSource) => void;
  hide: () => void;
}

/**
 * Open/closed state for the "get the desktop app" pitch, lifted out of the
 * triggers because the phone entry point CLOSES itself on tap — the drawer
 * unmounts, and a dialog owned by it would go with it.
 *
 * The open event is tracked here rather than in each trigger: one call site
 * means the funnel can't drift as entry points are added.
 */
export const useGetApp = create<GetAppStore>((set) => ({
  source: null,
  show: (source) => {
    track(EVENTS.GET_APP_OPENED, { source });
    set({ source });
  },
  hide: () => set({ source: null }),
}));
