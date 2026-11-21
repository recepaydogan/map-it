import { BookMarked, Crown, Gem, Map as MapIcon, Users, type LucideIcon } from "lucide-react";
import type { OverlayKey } from "../../store/ui-store";

/**
 * The app's primary navigation, as data. ONE source of truth shared by the
 * desktop title-bar strip (header-tabs) and the phone/tablet drawer (mobile-nav)
 * so the two can never drift on which tabs exist or what order they sit in.
 *
 * `key: null` is the live map (no full-window surface); every other key opens the
 * matching surface via the ui-store.
 */
export type NavTab = {
  key: OverlayKey | null;
  tKey: string;
  icon: LucideIcon;
};

/**
 * Both groups are ALWAYS shown regardless of the active game (their full-window
 * surfaces' data is always loaded). They're split only so the Nightreign group can
 * wear the NR spectral-cyan accent on its active/hover states while the Elden Ring
 * tabs keep Erdtree gold.
 */
const ER_TABS: NavTab[] = [
  // "Map" (null overlay) IS the game-data map for Elden Ring — the former TEST
  // MAP surface was promoted to be the real map (2026-07-16); Nightreign keeps
  // the live Leaflet map on the same tab.
  { key: null, tKey: "nav.map", icon: MapIcon },
  // Classes tab hidden for now
  // { key: "classes", tKey: "nav.classes", icon: Shirt },
  // Dialogue tab hidden for now — the overlay/feature stays wired up (map-shell still
  // renders it), only the nav entry is removed.
  // { key: "dialogue", tKey: "nav.dialogue", icon: MessageSquare },
];

const NR_TABS: NavTab[] = [
  { key: "nightlords", tKey: "nav.nightlords", icon: Crown },
  { key: "nightfarers", tKey: "nav.nightfarers", icon: Users },
  { key: "relics", tKey: "nav.relics", icon: Gem },
];

// Archive + Guide each host BOTH games behind their OWN in-surface ER/NR switcher, so they are
// game-neutral. They sit in a FIXED position (right after the Elden Ring tabs) and NEVER move
// when the map's game changes — the old "follow the active game" behaviour made these tabs jump
// from one group to the other on every ER↔NR switch, which was disorienting.
const ARCHIVE_TAB: NavTab = { key: "codex", tKey: "nav.archive", icon: BookMarked };
// Guide tab hidden for now
// const GUIDE_TAB: NavTab = { key: "guide", tKey: "nav.guide", icon: GraduationCap };

/**
 * These lists are the COMPLETE set of destinations, and each consumer decides how
 * to present them:
 *
 *  • The desktop strip (header-tabs) filters out `codex` and `relics`, which the
 *    Database dropdown owns there — a title bar has one line to spend.
 *  • The phone drawer (mobile-nav) lists them flat. It scrolls, so a nested menu
 *    inside a menu would only add a tap.
 *
 * Keep the destinations here; keep the presentation at the call site.
 */

/** Elden Ring group (gold accent): the map plus the game-neutral Archive. */
export const ELDEN_RING_TABS: NavTab[] = [...ER_TABS, ARCHIVE_TAB];

/** Nightreign group (spectral-cyan accent). */
export const NIGHTREIGN_TABS: NavTab[] = NR_TABS;
