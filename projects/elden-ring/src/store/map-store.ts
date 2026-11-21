import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { categoriesByGame, groupsByGame } from "../data/categories";
import { type CustomMarker, newCustomMarkerId } from "../data/custom-markers";
import { layersByGame, NOMINAL_SIZE } from "../data/maps";
import type { Game, MapLayer } from "../data/types";

/**
 * The single "you are here" marker the player drops to mark their own position — a
 * big red, draggable location pin that sits above every other marker. Exactly one
 * exists app-wide (re-homed when dropped on another map) and it is tied to the map
 * it sits on, so its NOMINAL pixel is read against the right image.
 */
export interface PlayerMarker {
  game: Game;
  layer: MapLayer;
  pixel: { x: number; y: number };
}

/**
 * Persisted map UI state — the few primitives worth remembering between sessions:
 * the chosen game, its map layer, the active category filters and the last map
 * zoom. Everything derived from these (markers, counts, selection) stays in the
 * map-experience context; this store is only the durable seed it grows from.
 *
 * The default view is intentionally minimal: only exploration landmarks are
 * shown so a first-time map is useful without becoming a wall of markers.
 */

const DEFAULT_GAME: Game = "elden-ring";

/** The "you are here" pin is on by default: seeded at the centre of the default map
 * (ER overworld) so it's visible the moment the app opens, ready to drag. Moving or
 * removing it persists and overrides this — it's only the starting state. */
const DEFAULT_PLAYER_MARKER: PlayerMarker = {
  game: DEFAULT_GAME,
  layer: layersByGame[DEFAULT_GAME][0].key,
  pixel: { x: NOMINAL_SIZE / 2, y: NOMINAL_SIZE / 2 },
};

/** The build a player starts from — every attribute at its class-agnostic floor.
 * Exported because cloud sync has to tell "an untouched default" apart from a
 * build the player actually chose (see map-sync-service). */
export const DEFAULT_PLAYER_STATS: Record<string, number> = {
  Vig: 10, Mind: 10, End: 10, Str: 10, Dex: 10, Int: 10, Fai: 10, Arc: 10,
};

/** Exploration-first defaults: Elden Ring's Landmarks group and Nightreign's
 * equivalent Points of Interest group. Persisted user choices always win. */
const defaultCategoryKeys = (game: Game): string[] => {
  const groupKey = game === "elden-ring" ? "landmarks" : "pois";
  return groupsByGame[game].find((group) => group.key === groupKey)?.categories ?? [];
};

const allKeys = (game: Game): string[] =>
  categoriesByGame[game].map((c) => c.key);

interface MapStore {
  game: Game;
  layer: MapLayer;
  /** Category keys currently shown on the map (for the active game). */
  activeCategories: Set<string>;
  /** Per-game filter memory. Switching game stashes the outgoing game's selection
   * here and restores the incoming game's last selection, so a game remembers how
   * you left its filters instead of snapping back to the exploration default. */
  filtersByGame: Partial<Record<Game, Set<string>>>;
  /** Category keys shown by the production Elden Ring Map tab. Kept separate
   * from the live/overlay map because the streamed manifest has extra categories. */
  erMapActiveCategories: Set<string> | null;
  /** Last Leaflet zoom (log2 scale); null until the user first zooms a map. */
  zoom: number | null;
  /** Last map center as a fraction (0..1) of the image's width/height, so it
   * reopens where the user left off. Normalised (not raw pixels) so it stays in
   * bounds across maps of different sizes; null until the user first pans. */
  center: { x: number; y: number } | null;
  /** Collapse nearby same-type markers into clusters when zoomed out. User
   * preference (persisted); off means every pin always draws individually. */
  clusterMarkers: boolean;
  /** Clustering engages only when the map is zoomed out below this percentage.
   * User-tunable (persisted); see marker-layer for why a raw percent, not a
   * Leaflet zoom level. */
  clusterBelowPercent: number;
  /** Pull the camera in when a marker is selected. ON (the default) closes to
   * markerZoomPercent; OFF leaves the camera at whatever zoom the user is already
   * at and only pans to the pick. Persisted. ER Map only — the production Map tab
   * has always kept the current zoom. */
  markerZoomEnabled: boolean;
  /** How far a marker selection closes in, as a zoom percentage (scale = 2^zoom, so
   * 100% = zoom 0). Only a floor: a user already zoomed in past it keeps their zoom.
   * User-tunable (persisted); a raw percent because that's what the zoom readout
   * shows. The ER map's own ceiling is 400%. */
  markerZoomPercent: number;
  /** Completion tracking: marker ids the player has marked "found/cleared". Persisted
   * so progress survives between sessions. Meaningful for the static Elden Ring world
   * (its markers are fixed collectibles); Nightreign markers are per-run, so the UI
   * only exposes tracking on the ER side. */
  foundMarkers: Set<string>;
  /** Tracking filters. Found + favorited markers are ALWAYS visible on the map —
   * they bypass category filtering. These two master switches are the escape hatch:
   * turn one off to hide every found / every favorited pin (declutter). Both default
   * on. ER-only in the UI (its markers are stable collectibles). */
  showFound: boolean;
  showBookmarks: boolean;
  /** Draw the map-fragment reveal rectangles (WorldMapPieceParam) over the map — which
   * fragment uncovers which stretch of the world. Off by default; ER-only. Persisted. */
  showFragments: boolean;
  /** Draw the official region overlay (MapNameTexParam mask textures) — a colour wash of
   * each named overworld region's extent. Off by default; ER overworld only. Persisted. */
  showRegions: boolean;
  /** Bookmarked marker ids — a personal shortlist (planning a route, things to come back
   * to). Persisted. ER-only in the UI (its markers are stable ids). */
  bookmarks: Set<string>;
  /** Saved Nightreign patterns, keyed "nightlord|shiftingEarth|layout" — runs worth
   * revisiting. Persisted. */
  favoritePatterns: Set<string>;
  /** The player's character build — all 8 attributes. Str/Dex/Int/Fai/Arc drive the codex's
   * attack-rating maths and requirement highlighting; Vig/Mind/End round the build out so the
   * class browser can price it as a real level. Persisted, so an older save that only stored
   * the five combat stats is still valid — readers default a missing attribute to 10. */
  playerStats: Record<string, number>;

  /** User-authored markers (created in-app: type + name + image + description, dropped
   * on the map). Persisted; flow through the normal pipeline via customToMarker. */
  customMarkers: CustomMarker[];

  /** The player's own "you are here" pin: a big red, draggable location marker that
   * sits above every other marker. Singleton + persisted; always present (on by
   * default and re-seeded if a stale session has it unset) — repositioned by drag
   * only, since its toggle button was removed. */
  playerMarker: PlayerMarker | null;

  /** Marker edit mode: changes stay in a transient draft until the user saves. */
  editMode: boolean;
  /** Persisted marker positions from the user's last successful save. */
  committedMarkerOverrides: Record<string, { x: number; y: number }>;
  /** Persisted marker removals from the user's last successful save. */
  committedMarkerDeletions: Set<string>;
  /** Persisted marker category changes from the user's last successful save. */
  committedMarkerCategoryOverrides: Record<string, string>;
  /** Effective marker positions. During editing this is the transient draft; outside
   * editing it mirrors committedMarkerOverrides. */
  markerOverrides: Record<string, { x: number; y: number }>;
  /** Ids in the order they were last dragged — the undo stack. Re-dragging a
   * marker moves it to the top, so "undo" always pops the most recent edit. */
  markerOverrideOrder: string[];
  /** True when the marker draft differs from the last saved version. */
  markerOverridesDirty: boolean;
  /** Marker ids removed in the effective edit state. */
  markerDeletions: Set<string>;
  /** Marker id → reclassified category key, applied over the shipped marker data. */
  markerCategoryOverrides: Record<string, string>;

  /** Switch game: resets the layer to that game's default and restores the game's
   * remembered filter selection (exploration default the first time it's visited). */
  setGame: (game: Game) => void;
  setLayer: (layer: MapLayer) => void;
  toggleCategory: (key: string) => void;
  /** Replace the whole selection (solo / show-all / hide-all / presets). */
  setCategories: (keys: string[]) => void;
  /** Turn every category in a group on or off at once. */
  setGroup: (groupKey: string, on: boolean) => void;
  /** Replace or derive the production Map tab's persisted category selection. */
  setErMapCategories: (
    next: Set<string> | ((current: Set<string>) => Set<string>),
  ) => void;
  showAll: () => void;
  hideAll: () => void;
  setZoom: (zoom: number) => void;
  /** Persist the current view (zoom + normalised center) after a pan/zoom settles. */
  setView: (zoom: number, center: { x: number; y: number }) => void;
  setClusterMarkers: (on: boolean) => void;
  setClusterBelowPercent: (percent: number) => void;
  setMarkerZoomEnabled: (on: boolean) => void;
  setMarkerZoomPercent: (percent: number) => void;
  /** Start a clean draft from the last saved marker edits. */
  beginMarkerEditSession: () => void;
  /** Commit the current draft to localStorage-backed state. */
  saveMarkerEdits: () => void;
  /** Drop the current draft, restore the saved state and exit edit mode. */
  discardMarkerEdits: () => void;
  setMarkerOverride: (id: string, pos: { x: number; y: number }) => void;
  /** Restore one marker position to the shipped data. Requires Save to commit. */
  restoreMarkerOverride: (id: string) => void;
  /** Undo the most recent drag — removes its override even after a "Save".
   * Call repeatedly to walk back through edits one at a time. */
  undoMarkerOverride: () => void;
  /** Remove or restore a marker in the current draft. */
  toggleMarkerDeletion: (id: string) => void;
  /** Reclassify a marker, or restore its shipped category with null. */
  setMarkerCategoryOverride: (id: string, category: string | null) => void;

  /** Toggle a marker's bookmark. */
  toggleBookmark: (id: string) => void;
  clearBookmarks: () => void;
  /** Toggle a saved Nightreign pattern (key "nightlord|shiftingEarth|layout"). */
  toggleFavoritePattern: (key: string) => void;
  /** Set one of the player's character stats (clamped to 1..99). */
  setPlayerStat: (stat: string, value: number) => void;
  /** Replace the whole build at once — how "start from this class" seeds the stats. */
  setPlayerStats: (stats: Record<string, number>) => void;
  /** Toggle a marker's found/cleared state. */
  toggleFound: (id: string) => void;
  /** Mark several markers found at once (e.g. "mark all in view"). */
  setFound: (ids: string[], found: boolean) => void;
  /** Wipe all completion progress. */
  clearFound: () => void;
  /** Tracking-filter switches: show/hide all found and all favorited pins. */
  setShowFound: (on: boolean) => void;
  setShowBookmarks: (on: boolean) => void;
  /** Show/hide the map-fragment reveal rectangles. */
  setShowFragments: (on: boolean) => void;
  /** Show/hide the official region overlay wash. */
  setShowRegions: (on: boolean) => void;
  /** Replace completion + bookmarks wholesale (restore from an exported backup). */
  importProgress: (found: string[], bookmarks: string[]) => void;

  /** Create a custom marker; returns its new id. Also makes its type's category
   * visible (so a fresh marker isn't hidden by the category filter). */
  addCustomMarker: (
    marker: Omit<CustomMarker, "id" | "createdAt">,
  ) => string;
  /** Patch a custom marker's editable fields (name / type / image / description). */
  updateCustomMarker: (
    id: string,
    patch: Partial<Pick<CustomMarker, "name" | "category" | "description" | "icon">>,
  ) => void;
  /** Persist a custom marker's new position after a drag (NOMINAL pixel). */
  moveCustomMarker: (id: string, pixel: { x: number; y: number }) => void;
  /** Delete a custom marker. */
  removeCustomMarker: (id: string) => void;

  /** Persist the player pin's new position after a drag (keeps its game + layer). The
   * pin is always present and repositioned by drag only — there's no drop/clear action
   * (its toggle button was removed). */
  movePlayerMarker: (pixel: { x: number; y: number }) => void;
  /** Drop the "you are here" pin at an exact game+layer+pixel — used by the map's
   * right-click "I am here" menu, which can retarget it to whichever ER layer was
   * clicked (move only nudges within the pin's current game+layer). */
  placePlayerMarker: (marker: PlayerMarker) => void;
}

const sameSet = (left: Set<string>, right: Set<string>): boolean =>
  left.size === right.size && [...left].every((value) => right.has(value));

const samePositionOverrides = (
  left: Record<string, { x: number; y: number }>,
  right: Record<string, { x: number; y: number }>,
): boolean => {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;
  return leftKeys.every((key) =>
    right[key]?.x === left[key].x && right[key]?.y === left[key].y,
  );
};

const sameCategoryOverrides = (
  left: Record<string, string>,
  right: Record<string, string>,
): boolean => {
  const leftKeys = Object.keys(left);
  return leftKeys.length === Object.keys(right).length &&
    leftKeys.every((key) => right[key] === left[key]);
};

const markerDraftIsDirty = (
  state: Pick<
    MapStore,
    | "committedMarkerOverrides"
    | "committedMarkerDeletions"
    | "committedMarkerCategoryOverrides"
  >,
  overrides: MapStore["markerOverrides"],
  deletions: MapStore["markerDeletions"],
  categories: MapStore["markerCategoryOverrides"],
): boolean =>
  !samePositionOverrides(overrides, state.committedMarkerOverrides) ||
  !sameSet(deletions, state.committedMarkerDeletions) ||
  !sameCategoryOverrides(categories, state.committedMarkerCategoryOverrides);

const persistedMapState = (state: MapStore): Partial<MapStore> => {
  const persisted: Partial<MapStore> = { ...state };
  delete persisted.editMode;
  delete persisted.markerOverrides;
  delete persisted.markerOverrideOrder;
  delete persisted.markerOverridesDirty;
  delete persisted.markerDeletions;
  delete persisted.markerCategoryOverrides;
  return persisted;
};

export const useMapStore = create<MapStore>()(
  persist(
    (set) => ({
      game: DEFAULT_GAME,
      layer: layersByGame[DEFAULT_GAME][0].key,
      activeCategories: new Set(defaultCategoryKeys(DEFAULT_GAME)),
      filtersByGame: {},
      erMapActiveCategories: null,
      zoom: null,
      center: null,
      clusterMarkers: true,
      clusterBelowPercent: 26,
      markerZoomEnabled: true,
      markerZoomPercent: 335,
      foundMarkers: new Set<string>(),
      showFound: true,
      showBookmarks: true,
      showFragments: false,
      showRegions: false,
      bookmarks: new Set<string>(),
      favoritePatterns: new Set<string>(),
      playerStats: { ...DEFAULT_PLAYER_STATS },
      customMarkers: [],
      playerMarker: DEFAULT_PLAYER_MARKER,
      editMode: false,
      committedMarkerOverrides: {},
      committedMarkerDeletions: new Set<string>(),
      committedMarkerCategoryOverrides: {},
      markerOverrides: {},
      markerOverrideOrder: [],
      markerOverridesDirty: false,
      markerDeletions: new Set<string>(),
      markerCategoryOverrides: {},

      setGame: (game) =>
        set((s) => {
          if (game === s.game) return s;
          // Stash the outgoing game's selection, then restore the incoming game's
          // last selection (exploration default the first time it's visited).
          const filtersByGame = { ...s.filtersByGame, [s.game]: s.activeCategories };
          const restored = filtersByGame[game] ?? new Set(defaultCategoryKeys(game));
          return {
            game,
            layer: layersByGame[game][0].key,
            activeCategories: restored,
            filtersByGame,
          };
        }),

      setLayer: (layer) => set({ layer }),

      toggleCategory: (key) =>
        set((s) => {
          const next = new Set(s.activeCategories);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return { activeCategories: next };
        }),

      setCategories: (keys) => set({ activeCategories: new Set(keys) }),

      setGroup: (groupKey, on) =>
        set((s) => {
          const group = groupsByGame[s.game].find((g) => g.key === groupKey);
          if (!group) return s;
          const next = new Set(s.activeCategories);
          for (const key of group.categories) {
            if (on) next.add(key);
            else next.delete(key);
          }
          return { activeCategories: next };
        }),

      setErMapCategories: (next) =>
        set((state) => {
          const current = state.erMapActiveCategories ?? new Set<string>();
          const resolved = typeof next === "function" ? next(current) : next;
          return { erMapActiveCategories: new Set(resolved) };
        }),

      showAll: () => set((s) => ({ activeCategories: new Set(allKeys(s.game)) })),
      hideAll: () => set({ activeCategories: new Set() }),

      setZoom: (zoom) => set({ zoom }),

      // Clamp the normalised center to [0,1] so a view left panned past the map
      // edge still reopens on the map rather than out in the black margin.
      setView: (zoom, center) =>
        set({
          zoom,
          center: {
            x: Math.min(1, Math.max(0, center.x)),
            y: Math.min(1, Math.max(0, center.y)),
          },
        }),

      setClusterMarkers: (on) => set({ clusterMarkers: on }),

      // Clamp to the slider's range so a stale/hand-edited persisted value can't
      // push clustering into a nonsensical zoom.
      setClusterBelowPercent: (percent) =>
        set({ clusterBelowPercent: Math.min(100, Math.max(10, Math.round(percent))) }),

      setMarkerZoomEnabled: (on) => set({ markerZoomEnabled: on }),

      // Clamped to the slider's range, which stops at the ER map's own 400% ceiling —
      // a persisted value past it would ask for a zoom the map can't reach.
      setMarkerZoomPercent: (percent) =>
        set({ markerZoomPercent: Math.min(400, Math.max(100, Math.round(percent))) }),

      beginMarkerEditSession: () =>
        set((s) => ({
          editMode: true,
          markerOverrides: { ...s.committedMarkerOverrides },
          markerOverrideOrder: [],
          markerOverridesDirty: false,
          markerDeletions: new Set(s.committedMarkerDeletions),
          markerCategoryOverrides: { ...s.committedMarkerCategoryOverrides },
        })),
      saveMarkerEdits: () =>
        set((s) => {
          const isCustomId = (id: string) => id.startsWith("custom:");
          const customMarkers = s.customMarkers
            .filter((marker) => !s.markerDeletions.has(marker.id))
            .map((marker) => {
              const pixel = s.markerOverrides[marker.id];
              return pixel ? { ...marker, pixel } : marker;
            });
          const committedMarkerOverrides = Object.fromEntries(
            Object.entries(s.markerOverrides).filter(([id]) => !isCustomId(id)),
          );
          const committedMarkerDeletions = new Set(
            [...s.markerDeletions].filter((id) => !isCustomId(id)),
          );
          const committedMarkerCategoryOverrides = Object.fromEntries(
            Object.entries(s.markerCategoryOverrides).filter(([id]) => !isCustomId(id)),
          );
          return {
            customMarkers,
            committedMarkerOverrides,
            committedMarkerDeletions,
            committedMarkerCategoryOverrides,
            markerOverrides: { ...committedMarkerOverrides },
            markerOverrideOrder: [],
            markerOverridesDirty: false,
            markerDeletions: new Set(committedMarkerDeletions),
            markerCategoryOverrides: { ...committedMarkerCategoryOverrides },
          };
        }),
      discardMarkerEdits: () =>
        set((s) => ({
          editMode: false,
          markerOverrides: { ...s.committedMarkerOverrides },
          markerOverrideOrder: [],
          markerOverridesDirty: false,
          markerDeletions: new Set(s.committedMarkerDeletions),
          markerCategoryOverrides: { ...s.committedMarkerCategoryOverrides },
        })),
      setMarkerOverride: (id, pos) =>
        set((s) => {
          const markerOverrides = { ...s.markerOverrides, [id]: pos };
          return {
            markerOverrides,
            // Move this id to the top of the undo stack (drop any earlier entry).
            markerOverrideOrder: [...s.markerOverrideOrder.filter((x) => x !== id), id],
            markerOverridesDirty: markerDraftIsDirty(
              s,
              markerOverrides,
              s.markerDeletions,
              s.markerCategoryOverrides,
            ),
          };
        }),
      restoreMarkerOverride: (id) =>
        set((s) => {
          if (!(id in s.markerOverrides)) return s;
          const markerOverrides = { ...s.markerOverrides };
          delete markerOverrides[id];
          return {
            markerOverrides,
            markerOverrideOrder: s.markerOverrideOrder.filter((markerId) => markerId !== id),
            markerOverridesDirty: markerDraftIsDirty(
              s,
              markerOverrides,
              s.markerDeletions,
              s.markerCategoryOverrides,
            ),
          };
        }),
      undoMarkerOverride: () =>
        set((s) => {
          const order = s.markerOverrideOrder;
          if (order.length === 0) return s;
          const lastId = order[order.length - 1];
          const next = { ...s.markerOverrides };
          const saved = s.committedMarkerOverrides[lastId];
          if (saved) next[lastId] = saved;
          else delete next[lastId];
          return {
            markerOverrides: next,
            markerOverrideOrder: order.slice(0, -1),
            markerOverridesDirty: markerDraftIsDirty(
              s,
              next,
              s.markerDeletions,
              s.markerCategoryOverrides,
            ),
          };
        }),
      toggleMarkerDeletion: (id) =>
        set((s) => {
          const next = new Set(s.markerDeletions);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return {
            markerDeletions: next,
            markerOverridesDirty: markerDraftIsDirty(
              s,
              s.markerOverrides,
              next,
              s.markerCategoryOverrides,
            ),
          };
        }),
      setMarkerCategoryOverride: (id, category) =>
        set((s) => {
          const next = { ...s.markerCategoryOverrides };
          if (category === null) delete next[id];
          else next[id] = category;
          return {
            markerCategoryOverrides: next,
            markerOverridesDirty: markerDraftIsDirty(
              s,
              s.markerOverrides,
              s.markerDeletions,
              next,
            ),
          };
        }),
      toggleFound: (id) =>
        set((s) => {
          const next = new Set(s.foundMarkers);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { foundMarkers: next };
        }),
      setFound: (ids, found) =>
        set((s) => {
          const next = new Set(s.foundMarkers);
          for (const id of ids) {
            if (found) next.add(id);
            else next.delete(id);
          }
          return { foundMarkers: next };
        }),
      clearFound: () => set({ foundMarkers: new Set() }),
      setShowFound: (on) => set({ showFound: on }),
      setShowBookmarks: (on) => set({ showBookmarks: on }),
      setShowFragments: (on) => set({ showFragments: on }),
      setShowRegions: (on) => set({ showRegions: on }),
      importProgress: (found, bookmarks) =>
        set({ foundMarkers: new Set(found), bookmarks: new Set(bookmarks) }),

      addCustomMarker: (marker) => {
        const id = newCustomMarkerId();
        set((s) => {
          const next: CustomMarker = { ...marker, id, createdAt: Date.now() };
          // Reveal the new marker's type so the category filter doesn't hide a pin
          // the user just placed. Only touch the active set for the current game.
          const activeCategories =
            marker.game === s.game && !s.activeCategories.has(marker.category)
              ? new Set(s.activeCategories).add(marker.category)
              : s.activeCategories;
          const erMapActiveCategories = s.erMapActiveCategories
            ? new Set(s.erMapActiveCategories).add(marker.category)
            : s.erMapActiveCategories;
          return {
            customMarkers: [...s.customMarkers, next],
            activeCategories,
            erMapActiveCategories,
          };
        });
        return id;
      },
      updateCustomMarker: (id, patch) =>
        set((s) => {
          const activeCategories =
            patch.category && !s.activeCategories.has(patch.category)
              ? new Set(s.activeCategories).add(patch.category)
              : s.activeCategories;
          const erMapActiveCategories = patch.category && s.erMapActiveCategories
            ? new Set(s.erMapActiveCategories).add(patch.category)
            : s.erMapActiveCategories;
          return {
            customMarkers: s.customMarkers.map((m) =>
              m.id === id ? { ...m, ...patch } : m,
            ),
            activeCategories,
            erMapActiveCategories,
          };
        }),
      moveCustomMarker: (id, pixel) =>
        set((s) => ({
          customMarkers: s.customMarkers.map((m) =>
            m.id === id ? { ...m, pixel } : m,
          ),
        })),
      removeCustomMarker: (id) =>
        set((s) => ({
          customMarkers: s.customMarkers.filter((m) => m.id !== id),
        })),

      movePlayerMarker: (pixel) =>
        set((s) =>
          s.playerMarker
            ? {
                playerMarker: {
                  ...s.playerMarker,
                  // Clamp to the NOMINAL canvas so a drag can't strand the pin off-map.
                  pixel: {
                    x: Math.min(NOMINAL_SIZE, Math.max(0, pixel.x)),
                    y: Math.min(NOMINAL_SIZE, Math.max(0, pixel.y)),
                  },
                },
              }
            : s,
        ),

      placePlayerMarker: (marker) =>
        set(() => ({
          playerMarker: {
            game: marker.game,
            layer: marker.layer,
            // Clamp to the NOMINAL canvas so a stray click can't strand the pin off-map.
            pixel: {
              x: Math.min(NOMINAL_SIZE, Math.max(0, marker.pixel.x)),
              y: Math.min(NOMINAL_SIZE, Math.max(0, marker.pixel.y)),
            },
          },
        })),

      toggleBookmark: (id) =>
        set((s) => {
          const next = new Set(s.bookmarks);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return { bookmarks: next };
        }),
      clearBookmarks: () => set({ bookmarks: new Set() }),
      toggleFavoritePattern: (key) =>
        set((s) => {
          const next = new Set(s.favoritePatterns);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return { favoritePatterns: next };
        }),
      setPlayerStat: (stat, value) =>
        set((s) => ({
          playerStats: { ...s.playerStats, [stat]: Math.min(99, Math.max(1, Math.round(value) || 1)) },
        })),
      setPlayerStats: (stats) =>
        set((s) => ({
          playerStats: {
            ...s.playerStats,
            ...Object.fromEntries(
              Object.entries(stats).map(([k, v]) => [k, Math.min(99, Math.max(1, Math.round(v) || 1))]),
            ),
          },
        })),
    }),
    {
      name: "elden-ring-atlas:map",
      // A Set can't survive JSON.stringify on its own, so round-trip it as an
      // array under a tagged wrapper.
      storage: createJSONStorage(() => localStorage, {
        replacer: (_key, value) =>
          value instanceof Set ? { __set: [...value] } : value,
        reviver: (_key, value) =>
          value && typeof value === "object" && "__set" in value
            ? new Set((value as { __set: string[] }).__set)
            : value,
      }),
      // Draft marker edits must never leak into localStorage before Save. Persist the
      // committed copies and let the effective fields live only for this session.
      partialize: persistedMapState,
      version: 9,
      // v2: the single `hideFound` declutter boolean became two "always visible"
      // master switches (showFound + showBookmarks, default on). Carry the old
      // hide preference over so a returning user's decluttered map stays that way.
      // v3: the maxBounds pan-limit was removed. While it existed it could persist a
      // jammed/off-center view (and a zoom carried over from a differently-sized
      // map), so drop the saved view once — the map then opens centered and
      // re-persists a clean view on the next pan.
      // v4: the "you are here" pin became on-by-default. Seed it for sessions that
      // predate it (or had it unset) so it's visible without a click.
      // v5: the pin's toggle button was removed — it's now always present. Re-seed it
      // for any session that had it explicitly cleared, so no one is left without it.
      // v6: marker edits became transactional. Preserve every previously persisted
      // override/deletion/category change as the initial committed state.
      // v7: the production Map tab moved its local filter state into this store.
      // Null means its manifest-driven Landmarks default has not been seeded yet.
      // v8: performance mode was removed — the app has one (animated) render path
      // now, so the stored toggle is dead weight and must not keep round-tripping.
      // v9: the ER map split `boss` into boss/great-boss/legendary-boss and moved
      // invader spawns out of the enemy chunks into `invasion`. A stored filter set
      // that had the old categories on must keep showing the same pins.
      migrate: (persisted, version) => {
        const s = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          s.showFound = s.hideFound !== true;
          s.showBookmarks = true;
          delete s.hideFound;
        }
        if (version < 3) {
          delete s.center;
          delete s.zoom;
        }
        if (version < 4) {
          // Seed the on-by-default pin in the CURRENT view, on the map the user
          // reopens, so it's visible immediately rather than parked off-screen (or on
          // another map). Mirrors the button's "drop at view centre" math.
          if (!s.playerMarker) {
            const game = (s.game as Game) ?? DEFAULT_GAME;
            const layer = (s.layer as MapLayer) ?? layersByGame[game][0].key;
            const c = s.center as { x: number; y: number } | null | undefined;
            const pixel = c
              ? { x: c.x * NOMINAL_SIZE, y: (1 - c.y) * NOMINAL_SIZE }
              : { x: NOMINAL_SIZE / 2, y: NOMINAL_SIZE / 2 };
            s.playerMarker = { game, layer, pixel };
          }
        }
        if (version < 5 && !s.playerMarker) {
          // The pin is always-on now (its toggle was removed), so a session that had it
          // cleared gets it back — same "drop at the current view centre" math as v4.
          const game = (s.game as Game) ?? DEFAULT_GAME;
          const layer = (s.layer as MapLayer) ?? layersByGame[game][0].key;
          const c = s.center as { x: number; y: number } | null | undefined;
          s.playerMarker = c
            ? { game, layer, pixel: { x: c.x * NOMINAL_SIZE, y: (1 - c.y) * NOMINAL_SIZE } }
            : { game, layer, pixel: { x: NOMINAL_SIZE / 2, y: NOMINAL_SIZE / 2 } };
        }
        if (version < 6) {
          s.committedMarkerOverrides = s.markerOverrides ?? {};
          s.committedMarkerDeletions = s.markerDeletions ?? new Set<string>();
          s.committedMarkerCategoryOverrides = s.markerCategoryOverrides ?? {};
          delete s.markerOverrides;
          delete s.markerOverrideOrder;
          delete s.markerOverridesDirty;
          delete s.markerDeletions;
          delete s.markerCategoryOverrides;
        }
        if (version < 7) s.erMapActiveCategories = null;
        if (version < 8) delete s.performanceMode;
        if (version < 9) {
          // The reviver has already turned {__set} back into a Set here.
          const active = s.erMapActiveCategories;
          if (active instanceof Set) {
            if (active.has("boss")) {
              active.add("great-boss");
              active.add("legendary-boss");
              active.add("evergaol-boss");
            }
            // The model-family buckets folded into `enemy` (+ invasion/elite split
            // out of them) — a set that showed any family keeps showing those pins.
            const families = ["enemy-humanoid", "enemy-creature", "enemy-undead-construct", "enemy-special"];
            if (families.some((key) => active.has(key))) {
              active.add("enemy");
              active.add("elite-enemy");
              active.add("invasion");
            }
            for (const key of families) active.delete(key);
          }
        }
        return s as unknown as MapStore;
      },
      // A `?game=` / `?layer=` deep link still wins over the stored session.
      onRehydrateStorage: () => (state) => {
        if (!state || typeof window === "undefined") return;
        // A reload always discards a transient draft and restores the last explicit
        // Save. Calling the action also emits a state update for existing subscribers.
        state.discardMarkerEdits();
        const params = new URLSearchParams(window.location.search);
        const requestedGame = params.get("game");
        const game = requestedGame === "nightreign" || requestedGame === "elden-ring" ? requestedGame : state.game;
        if (game !== state.game) state.setGame(game);
        const layer = layersByGame[game].find(({ key }) => key === params.get("layer"));
        if (layer) state.setLayer(layer.key);
      },
    },
  ),
);
