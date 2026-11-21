import { MOBILE_QUERY } from "../../utils/platform";

/**
 * Should the map open with the filter rail expanded?
 *
 * Everywhere with room, yes — the rail is how you steer a map with thousands of
 * pins, and hiding it makes the map look like it only has landmarks. On a phone
 * the same panel becomes a bottom sheet that covers most of the screen, so an
 * auto-opened rail means the map's first impression is a wall of checkboxes.
 * There it starts collapsed behind its trigger instead.
 *
 * Read once, as a `useState` initialiser: this is the OPENING state, not a live
 * binding. Resizing a desktop window down mid-session shouldn't yank a rail the
 * user deliberately opened.
 */
export const initialRailOpen = (): boolean => {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return !window.matchMedia(MOBILE_QUERY).matches;
};
