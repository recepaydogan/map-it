import { create } from "zustand";
import type { Game } from "../data/types";

/** The full-window surfaces the header tabs switch between. `null` = the live map. */
export type OverlayKey =
  | "codex"
  | "classes"
  | "dialogue"
  | "nightfarers"
  | "nightlords"
  | "relics"
  | "guide"
  | "account"
  | "settings"
  | "support"
  /** Staff-only: the community-notes moderation queue. */
  | "notesAdmin";

/**
 * Transient cross-component UI state (NOT persisted). Two jobs:
 *  1. `activeOverlay` — the single full-window surface currently open (Archive,
 *     Nightfarers, …) or null for the map. The header tab bar and the map shell both read
 *     this, so navigation lives in one place instead of scattered local booleans.
 *  2. The `*Intent` signals — let a global-search result (or a codex cross-link) open the
 *     right surface AND hand it a target, which the owner consumes and then clears.
 */
interface UiStore {
  /** Which full-window overlay is open, or null = the map is showing. */
  activeOverlay: OverlayKey | null;

  /** Open the Archive (Elden Ring side) focused on this item (group:id key), or null. */
  codexItemKey: string | null;
  /** Which game's item database the shared codex surface should show. */
  databaseGame: Game | null;
  /** Open the Nightfarer roster on this hero name, or null. */
  nightfarerName: string | null;
  /** Close overlays and select this marker on the map (a codex "show on map" jump), or null. */
  mapMarkerId: string | null;

  /** Show an overlay surface (header tab click). */
  openOverlay: (key: OverlayKey) => void;
  /** Open the shared item database directly on the requested game. */
  openDatabase: (game: Game) => void;
  /** Back to the map. */
  closeOverlay: () => void;

  openCodexItem: (key: string) => void;
  openNightfarer: (name: string) => void;
  openMapMarker: (id: string) => void;
  clearCodexIntent: () => void;
  clearNightfarerIntent: () => void;
  clearMapMarker: () => void;
}

const getSeoItemInfo = () => {
  if (typeof window === "undefined") return { itemKey: null, category: null };
  const win = window as any;
  if (win.__ER_SEO_ITEM__ || win.__ER_SEO_CATEGORY__) {
    return { itemKey: win.__ER_SEO_ITEM__ || null, category: win.__ER_SEO_CATEGORY__ || null };
  }
  const match = window.location.pathname.match(/\/items\/(?:([^\/]+)(?:\/([^\/]+)-([a-zA-Z0-9:]+))?)?$/);
  if (match) {
    const category = match[1] || "all";
    const typeId = match[3];
    // If we have a typeId, we try to reconstruct the itemKey. Most itemKeys in er-items are "category:typeId".
    // CodexOverlay will resolve it robustly anyway if it matches partially, but we can just pass "category:typeId".
    const itemKey = typeId ? (typeId.includes(":") ? typeId : `${category}:${typeId}`) : null;
    return { itemKey, category };
  }
  return { itemKey: null, category: null };
};

// Read once at module load: the SEO globals and the URL never change under us,
// and the three fields below must agree on the SAME answer.
const seoIntent = getSeoItemInfo();

export const useUiStore = create<UiStore>((set) => ({
  // An item deep link (/items/<cat>/<slug>-<id>) only sets __ER_SEO_ITEM__ — no
  // category — so this MUST test itemKey too. Testing category alone left every
  // prerendered item page mounting with no overlay, i.e. landing on the map.
  activeOverlay:
    typeof window !== "undefined" &&
    (seoIntent.itemKey ||
      seoIntent.category ||
      new URLSearchParams(window.location.search).get("codex") === "1")
      ? "codex"
      : null,
  codexItemKey: seoIntent.itemKey,
  databaseGame: seoIntent.itemKey || seoIntent.category ? "elden-ring" : null,
  nightfarerName: null,
  mapMarkerId: null,

  openOverlay: (key) => set({ activeOverlay: key }),
  openDatabase: (game) =>
    set({ activeOverlay: "codex", databaseGame: game, codexItemKey: null }),
  closeOverlay: () => set({ activeOverlay: null }),

  // Search/cross-link intents also flip to the matching surface so the jump is one step.
  openCodexItem: (key) =>
    set({ codexItemKey: key, databaseGame: "elden-ring", activeOverlay: "codex" }),
  openNightfarer: (name) => set({ nightfarerName: name, activeOverlay: "nightfarers" }),
  openMapMarker: (id) => set({ mapMarkerId: id, activeOverlay: null }),
  clearCodexIntent: () => set({ codexItemKey: null }),
  clearNightfarerIntent: () => set({ nightfarerName: null }),
  clearMapMarker: () => set({ mapMarkerId: null }),
}));
