import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { categoriesByGame, groupLabelKey, groupsByGame } from "../../data/categories";
import {
  CUSTOM_GROUP,
  type CustomMarker,
  customToMarker,
} from "../../data/custom-markers";
import { categoryArtUrls } from "../../data/marker-art";
import { layersByGame } from "../../data/maps";
import { markersByGame } from "../../data/markers";
import {
  nrMarkersForPattern,
  nrMatchingPatterns,
  type NightreignPattern,
} from "../../data/nightreign-data";
import { presetsByGame } from "../../data/presets";
import useKeyHintTriggers from "../hints/use-key-hint-triggers";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  type MarkerOpenSource,
  recordLiveMarkerOpened,
} from "../../services/analytics/map-events";
import { useMapStore } from "../../store/map-store";
import { initialRailOpen } from "../filters/initial-rail-open";
import type {
  CategoryDef,
  CategoryGroup,
  FilterPreset,
  Game,
  MapLayer,
  Marker,
} from "../../data/types";

interface MapExperience {
  game: Game;
  layer: MapLayer;
  categories: CategoryDef[];
  categoryById: Map<string, CategoryDef>;
  groups: CategoryGroup[];
  presets: FilterPreset[];
  layers: { key: MapLayer; label: string }[];
  activeCategories: Set<string>;
  /** Marker count per category for the current game + layer (ignores filters). */
  categoryCounts: Map<string, number>;
  /** Category key → the real map-symbol URL when its markers share one (else the
   * category falls back to its Lucide glyph, same as the map pins). */
  categoryArt: Map<string, string>;
  visibleMarkers: Marker[];
  allMarkers: Marker[];
  selectedMarker: Marker | null;
  /** Marker a back button / ESC would return to (one level down the selection stack). */
  parentMarker: Marker | null;
  query: string;
  focusNonce: number;
  /** Nightreign seed selection. */
  nightlord: string;
  shiftingEarth: string;
  patternIndex: number;
  matchingPatterns: NightreignPattern[];
  currentPattern: NightreignPattern | undefined;
  /** Detail-panel drill-down: the loot item (unique group:id key) shown in place. */
  drillItemKey: string | null;
  setDrillItemKey: (key: string | null) => void;
  /** Boss detail panel showing the full "Combat Tips" page instead of the overview. */
  combatTipsOpen: boolean;
  setCombatTipsOpen: (open: boolean) => void;
  /** Standalone Nightlord (final-night boss) detail panel. The Nightlord never has a
   * map marker, so it can't be a normal selection — it's its own overlay panel, opened
   * either manually or automatically when GEP reports a Nightreign boss_fight. */
  nightlordDetailOpen: boolean;
  openNightlordDetail: () => void;
  closeNightlordDetail: () => void;
  /** Left filter rail expanded/collapsed. */
  railOpen: boolean;
  setRailOpen: (open: boolean) => void;
  /** Tracking filters (ER-only): found + favorited pins are always visible; these
   * master switches hide them. `trackedCounts` is the per-layer tally for the rail. */
  showFound: boolean;
  showBookmarks: boolean;
  setShowFound: (on: boolean) => void;
  setShowBookmarks: (on: boolean) => void;
  trackedCounts: { found: number; favorites: number };

  setGame: (game: Game) => void;
  setLayer: (layer: MapLayer) => void;
  toggleCategory: (key: string) => void;
  setGroup: (groupKey: string, on: boolean) => void;
  /** Isolate exactly these categories (solo) — the fast way to focus one thing. */
  showOnly: (keys: string[]) => void;
  applyPreset: (preset: FilterPreset) => void;
  /** `source` is analytics-only — how the player reached the marker (a pin click
   *  by default, "search" from the search box, …). */
  select: (id: string | null, source?: MarkerOpenSource) => void;
  /** Drill into a marker, remembering the current one for back/ESC. */
  pushSelect: (id: string) => void;
  /** Unwind one level (drilled loot → parent → closed). True if something unwound. */
  goBack: () => boolean;
  focusSelected: () => void;
  setQuery: (q: string) => void;
  setSeed: (next: Partial<{ nightlord: string; shiftingEarth: string }>) => void;
  cyclePattern: (delta: number) => void;
  /** Jump straight to a matching pattern by index (the Pattern Finder result). */
  selectPattern: (index: number) => void;
  /** Set seed AND land on a specific layout in one step (restoring a saved pattern). */
  gotoPattern: (nightlord: string, shiftingEarth: string, layout: number) => void;
}

const MapExperienceContext = createContext<MapExperience | null>(null);

/** Quiet period after the last keystroke before a search is reported. */
const SEARCH_REPORT_DELAY_MS = 900;

/**
 * Maps a stored CustomMarker → its rendered Marker, cached by source identity so an
 * UNCHANGED custom marker keeps a stable Marker across renders (only an edited/moved
 * one — a fresh object from the store's immutable update — produces a new Marker,
 * which is what lets the marker layer cheaply refresh just that one pin). Module-level
 * WeakMap: entries are GC'd with their source object, and no ref is read during render.
 */
const customMarkerCache = new WeakMap<CustomMarker, Marker>();

/**
 * DEV reclassification (boss ↔ miniboss): the two ranks carry distinct in-game
 * symbols (crossed-swords "Enemy" vs single-sword "mini-boss"), so a reclassified
 * marker swaps its map art along with its category — otherwise a demoted boss
 * would keep the boss emblem. Markers without one of those two symbols keep
 * theirs (their pin resolves by category and follows automatically).
 */
const BOSS_RANK_ICON: Record<string, string> = { boss: "Enemy", miniboss: "mini-boss" };
const reclassifyMarker = (m: Marker, cat: string): Marker => ({
  ...m,
  category: cat,
  mapIcon:
    (m.mapIcon === "Enemy" || m.mapIcon === "mini-boss") && BOSS_RANK_ICON[cat]
      ? BOSS_RANK_ICON[cat]
      : m.mapIcon,
});

export const MapExperienceProvider = ({ children }: { children: ReactNode }) => {
  // UI language — re-renders this provider on a language change so every localized
  // label below (categories, groups, presets, layers) updates app-wide at once.
  const { t, i18n } = useTranslation();

  // Persisted primitives (game, layer, filters) live in the Zustand store; the
  // context owns only the derived data and the ephemeral session state below.
  const game = useMapStore((s) => s.game);
  const layer = useMapStore((s) => s.layer);
  const activeCategories = useMapStore((s) => s.activeCategories);
  const foundMarkers = useMapStore((s) => s.foundMarkers);
  const bookmarks = useMapStore((s) => s.bookmarks);
  const showFound = useMapStore((s) => s.showFound);
  const showBookmarks = useMapStore((s) => s.showBookmarks);
  const setShowFound = useMapStore((s) => s.setShowFound);
  const setShowBookmarks = useMapStore((s) => s.setShowBookmarks);
  const setLayer = useMapStore((s) => s.setLayer);
  const toggleCategory = useMapStore((s) => s.toggleCategory);
  const storeSetGroup = useMapStore((s) => s.setGroup);
  const setCategories = useMapStore((s) => s.setCategories);
  const storeSetGame = useMapStore((s) => s.setGame);
  const customMarkers = useMapStore((s) => s.customMarkers);
  const markerDeletions = useMapStore((s) =>
    s.editMode ? s.markerDeletions : s.committedMarkerDeletions,
  );
  const markerCategoryOverrides = useMapStore((s) =>
    s.editMode ? s.markerCategoryOverrides : s.committedMarkerCategoryOverrides,
  );

  // Selection is a STACK so "navigate to this loot" can drill into a new marker
  // and ESC / a back button can return to the one it came from. Top = current.
  const [selStack, setSelStack] = useState<string[]>([]);
  const selectedId = selStack[selStack.length - 1] ?? null;
  const [drillItemKey, setDrillItemKey] = useState<string | null>(null);
  const [combatTipsOpen, setCombatTipsOpen] = useState(false);
  const [nightlordDetailOpen, setNightlordDetailOpen] = useState(false);
  const [railOpen, setRailOpen] = useState(initialRailOpen);
  const [query, setQueryState] = useState("");
  const [focusNonce, setFocusNonce] = useState(0);
  const [nightlord, setNightlord] = useState("Gladius");
  const [shiftingEarth, setShiftingEarth] = useState("Default");
  const [patternIndex, setPatternIndex] = useState(0);

  const setGame = useCallback(
    (next: Game) => {
      if (next !== game) {
        track(EVENTS.GAME_SWITCHED, { from: game, to: next, source: "live-map" });
      }
      storeSetGame(next); // resets layer + filters to that game's defaults
      setSelStack([]);
      setDrillItemKey(null);
      setCombatTipsOpen(false);
      if (next !== "nightreign") setNightlordDetailOpen(false);
      setQueryState("");
    },
    [game, storeSetGame],
  );

  // Search terms are reported once typing settles (see the ER map's identical
  // rule) — a per-keystroke event would bury the real term under its prefixes.
  const searchReportRef = useRef<number | undefined>(undefined);
  const setQuery = useCallback(
    (next: string) => {
      setQueryState(next);
      window.clearTimeout(searchReportRef.current);
      const q = next.trim().toLowerCase();
      if (!q) return;
      searchReportRef.current = window.setTimeout(() => {
        track(EVENTS.MAP_SEARCHED, {
          query: q.slice(0, 60),
          query_length: q.length,
          map: game,
          map_view: layer,
        });
      }, SEARCH_REPORT_DELAY_MS);
    },
    [game, layer],
  );
  useEffect(() => () => window.clearTimeout(searchReportRef.current), []);

  // Solo / show-all / hide-all all collapse to "replace the whole selection".
  const showOnly = setCategories;

  const applyPreset = useCallback(
    (preset: FilterPreset) => {
      if (preset.categories === "all")
        setCategories(categoriesByGame[game].map((c) => c.key));
      else if (preset.categories === "none") setCategories([]);
      else setCategories(preset.categories);
    },
    [game, setCategories],
  );

  // User-authored markers for the current game (all layers), each mapped to a Marker
  // via the module-level identity cache (see customMarkerCache).
  const customForGame = useMemo(
    () =>
      customMarkers
        .filter((c) => c.game === game)
        .map((c) => {
          let m = customMarkerCache.get(c);
          if (!m) customMarkerCache.set(c, (m = customToMarker(c)));
          return m;
        }),
    [customMarkers, game],
  );

  // The injected "Your Markers" group isn't in groupsByGame, so its header checkbox
  // can't route through the store's setGroup (which resolves groups from there).
  // Handle that key here — toggling exactly the custom types currently shown in the
  // rail — and delegate every real group to the store unchanged.
  const setGroup = useCallback(
    (groupKey: string, on: boolean) => {
      if (groupKey !== CUSTOM_GROUP.key) {
        storeSetGroup(groupKey, on);
        return;
      }
      const keys = new Set(customForGame.map((m) => m.category));
      const next = new Set(activeCategories);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      setCategories([...next]);
    },
    [storeSetGroup, customForGame, activeCategories, setCategories],
  );

  // A marker can live on a different layer than the one being viewed (e.g. an item's
  // "Where to find" lists overworld AND underground spots). Selecting/navigating to it
  // must switch the map to ITS layer first, else the map flies to those pixels on the
  // wrong image and no pin shows. No-op for same-layer. Custom markers aren't in
  // markersByGame, so they're resolved from customForGame too.
  const switchLayerFor = useCallback(
    (id: string) => {
      const m =
        markersByGame[game].find((x) => x.id === id) ??
        customForGame.find((x) => x.id === id);
      if (m && m.layer !== layer) setLayer(m.layer);
    },
    [game, layer, setLayer, customForGame],
  );

  // How the current selection was reached, for analytics only (see the
  // marker_opened effect below). A ref: it must never trigger a render.
  const openSourceRef = useRef<MarkerOpenSource>("map");

  // Fresh selection (map click / search) — replaces the whole stack.
  const select = useCallback((id: string | null, source: MarkerOpenSource = "map") => {
    openSourceRef.current = source;
    setSelStack(id ? [id] : []);
    setDrillItemKey(null); // a new selection drops any drilled-into loot
    setCombatTipsOpen(false);
    if (id) setNightlordDetailOpen(false); // a real marker takes over from the Nightlord page
    if (id) {
      switchLayerFor(id);
      setFocusNonce((n) => n + 1);
      setRailOpen(false); // collapse the filter rail so the detail panel has room
    }
  }, [switchLayerFor]);

  // Drill into a new marker while remembering where we came from (push).
  const pushSelect = useCallback((id: string) => {
    openSourceRef.current = "navigation";
    setSelStack((s) => [...s, id]);
    setDrillItemKey(null);
    setCombatTipsOpen(false);
    switchLayerFor(id);
    setFocusNonce((n) => n + 1);
  }, [switchLayerFor]);

  // One step back: drilled loot → its boss/dungeon; a pushed marker → its parent;
  // a lone marker → closed. Returns false when there was nothing to unwind.
  const goBack = useCallback((): boolean => {
    if (nightlordDetailOpen) { setNightlordDetailOpen(false); return true; }
    // Drill before combat: an item drilled from the boss-build page renders on top of
    // the combat view, so unwinding it must land back on the build page.
    if (drillItemKey != null) { setDrillItemKey(null); return true; }
    if (combatTipsOpen) { setCombatTipsOpen(false); return true; }
    if (selStack.length > 1) {
      // Returning to the parent must also restore ITS layer — a cross-layer drill
      // (e.g. underground item → overworld "Where to find") switched the map, so Back
      // has to switch it back, else we'd fly to the parent's pixels on the wrong image.
      switchLayerFor(selStack[selStack.length - 2]);
      setSelStack((s) => s.slice(0, -1));
      setFocusNonce((n) => n + 1);
      return true;
    }
    if (selStack.length === 1) { setSelStack([]); return true; }
    return false;
  }, [nightlordDetailOpen, combatTipsOpen, drillItemKey, selStack, switchLayerFor]);

  // ESC unwinds the UI one layer at a time: drilled loot → parent marker → open
  // dialog → filter rail. With nothing open, ESC collapses the rail; then no-op.
  //
  // Only while the LIVE (Nightreign) map is the surface on screen. This provider
  // stays mounted under the Elden Ring map too, and there its rail is invisible
  // but still "open" — so it used to answer the first ESC of every session by
  // collapsing that phantom rail. That ate the key twice over: it called
  // preventDefault, and the state write re-rendered the tree synchronously from
  // inside the keydown, which unregisters and re-registers every other keydown
  // listener — a listener removed mid-dispatch never runs for that event. Net
  // effect on the ER map: the first ESC did nothing visible and you had to press
  // it again to close the detail panel.
  useEffect(() => {
    if (game !== "nightreign") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (goBack()) e.preventDefault();
      else if (railOpen) { setRailOpen(false); e.preventDefault(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game, goBack, railOpen]);

  // Contextual key coaching (Esc closes / Esc steps back / W A S D hops) for the
  // Nightreign live map. Elden Ring's map is a separate surface with its own
  // selection state and drives the same hints from its detail panel — hence the
  // gate, so a stale NR selection can't fire hints while ER is on screen.
  useKeyHintTriggers({
    selectedId,
    canGoBack: combatTipsOpen || drillItemKey != null || selStack.length > 1,
    enabled: game === "nightreign",
  });

  const focusSelected = useCallback(() => setFocusNonce((n) => n + 1), []);

  // Open the standalone Nightlord page. Triggered manually or by the GEP boss_fight
  // bridge — so it also pulls the app onto the Nightreign tab (the Nightlord is a NR
  // concept) and clears any open marker detail so the page isn't stacked behind one.
  const openNightlordDetail = useCallback(() => {
    if (game !== "nightreign") setGame("nightreign");
    setSelStack([]);
    setDrillItemKey(null);
    setCombatTipsOpen(false);
    setNightlordDetailOpen(true);
  }, [game, setGame]);
  const closeNightlordDetail = useCallback(() => setNightlordDetailOpen(false), []);

  const setSeed = useCallback(
    (next: Partial<{ nightlord: string; shiftingEarth: string }>) => {
      if (next.nightlord !== undefined) setNightlord(next.nightlord);
      if (next.shiftingEarth !== undefined) setShiftingEarth(next.shiftingEarth);
      setPatternIndex(0); // a new seed means a new set of patterns
      setSelStack([]);
      setDrillItemKey(null);
      setCombatTipsOpen(false);
    },
    [],
  );

  const matchingPatterns = useMemo(
    () => nrMatchingPatterns(nightlord, shiftingEarth),
    [nightlord, shiftingEarth],
  );
  const currentPattern =
    matchingPatterns.length > 0
      ? matchingPatterns[patternIndex % matchingPatterns.length]
      : undefined;

  const cyclePattern = useCallback(
    (delta: number) => {
      setPatternIndex((i) => {
        const n = matchingPatterns.length;
        if (n === 0) return 0;
        return (i + delta + n) % n;
      });
      setSelStack([]);
      setDrillItemKey(null);
      setCombatTipsOpen(false);
    },
    [matchingPatterns.length],
  );

  const selectPattern = useCallback(
    (index: number) => {
      const n = matchingPatterns.length;
      if (n === 0) return;
      setPatternIndex(((index % n) + n) % n);
      setSelStack([]);
      setDrillItemKey(null);
      setCombatTipsOpen(false);
    },
    [matchingPatterns.length],
  );

  // Restore a saved run: set the seed and land on its exact layout together. The index is
  // computed from the (nightlord, shiftingEarth) pair directly so it doesn't wait for the
  // derived matchingPatterns to recompute on the next render.
  const gotoPattern = useCallback((nl: string, se: string, layout: number) => {
    setNightlord(nl);
    setShiftingEarth(se);
    const idx = nrMatchingPatterns(nl, se).findIndex((p) => p.layout === layout);
    setPatternIndex(idx >= 0 ? idx : 0);
    setSelStack([]);
    setDrillItemKey(null);
    setCombatTipsOpen(false);
  }, []);

  // Category labels are resolved through i18n by the stable category key, so
  // localising once HERE flows localized labels to every consumer (filter rail,
  // category rows, search, detail header) without touching each one. Falls back to
  // the data file's English label for any key without a catalog entry.
  const categories = useMemo(
    () =>
      categoriesByGame[game].map((c) => ({
        ...c,
        label: t(`category.${c.key}`, { defaultValue: c.label }),
      })),
    [game, t, i18n.language],
  );
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.key, c])),
    [categories],
  );

  const allMarkers = useMemo(() => {
    const base =
      game === "nightreign"
        ? nrMarkersForPattern(currentPattern)
        : markersByGame[game].filter((m) => m.layer === layer);
    // The user's own markers for this exact view sit on top of the extracted set.
    const custom = customForGame.filter((m) => m.layer === layer);
    const combined = custom.length ? [...base, ...custom] : base;
    // Saved removals and the current edit draft are dropped from every view.
    const kept = markerDeletions.size
      ? combined.filter((m) => !markerDeletions.has(m.id))
      : combined;
    // Reclassified markers get their effective category here, at the source —
    // pins, filter counts and detail all follow.
    return Object.keys(markerCategoryOverrides).length
      ? kept.map((m) => {
          const cat = markerCategoryOverrides[m.id];
          return cat && cat !== m.category ? reclassifyMarker(m, cat) : m;
        })
      : kept;
    // i18n.language: rebuild from the (live-binding) localized markersByGame when
    // the language changes, so names/regions on the map + panels are localized.
  }, [game, layer, currentPattern, customForGame, markerDeletions, markerCategoryOverrides, i18n.language]);

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of allMarkers)
      counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
    return counts;
  }, [allMarkers]);

  // The filter chips mirror the map: a category that consistently shows one
  // real symbol on the map shows that same symbol in the rail.
  const categoryArt = useMemo(() => categoryArtUrls(allMarkers), [allMarkers]);

  // Completion + favorites are an ER-only concept (its world is static); Nightreign
  // markers are per-run, so the tracking filters never apply there.
  const tracking = game === "elden-ring";
  const visibleMarkers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allMarkers.filter((m) => {
      // Search narrows everything — tracked pins included.
      if (q && !m.name.toLowerCase().includes(q) && !(m.region ?? "").toLowerCase().includes(q))
        return false;
      if (tracking) {
        const isFound = foundMarkers.has(m.id);
        const isFav = bookmarks.has(m.id);
        // Found / favorited markers are shown regardless of their category — they
        // bypass category filtering entirely and are governed only by the two
        // tracking switches, so turning one off hides every such pin (declutter).
        if (isFound || isFav)
          return (isFound && showFound) || (isFav && showBookmarks);
      }
      return activeCategories.has(m.category);
    });
    // The selected marker stays on the map even when filtered out — navigating to a
    // weapon while only bosses are active, or to a found pin the user has hidden.
    // Otherwise the panel would describe a pin you can't see.
    if (selectedId && !list.some((m) => m.id === selectedId)) {
      const sel = allMarkers.find((m) => m.id === selectedId);
      if (sel) list.push(sel);
    }
    return list;
  }, [allMarkers, activeCategories, query, selectedId, tracking, foundMarkers, bookmarks, showFound, showBookmarks]);

  // Found / favorited counts for the rail's Tracking rows (current layer's markers).
  const trackedCounts = useMemo(() => {
    let found = 0;
    let favorites = 0;
    for (const m of allMarkers) {
      if (foundMarkers.has(m.id)) found++;
      if (bookmarks.has(m.id)) favorites++;
    }
    return { found, favorites };
  }, [allMarkers, foundMarkers, bookmarks]);

  // Nightreign markers live in the per-pattern set (allMarkers = nrMarkersForPattern),
  // NOT in markersByGame.nightreign (which is empty) — so resolve the selection from
  // allMarkers for NR. ER keeps using the full markersByGame[game] so a cross-layer
  // selection (e.g. an underground item) still resolves even off the current layer.
  // ER resolves from the RAW data, so a DEV reclassification (boss ↔ miniboss) is
  // re-applied here — the detail header then matches the pin on the map.
  const resolveMarker = useCallback(
    (id: string | null): Marker | null => {
      if (!id) return null;
      const m =
        (game === "nightreign" ? allMarkers : markersByGame[game]).find((x) => x.id === id) ??
        customForGame.find((x) => x.id === id) ??
        null;
      if (!m || m.custom) return m;
      const cat = markerCategoryOverrides[m.id];
      return cat && cat !== m.category ? reclassifyMarker(m, cat) : m;
    },
    [game, allMarkers, customForGame, markerCategoryOverrides],
  );
  const selectedMarker = useMemo(
    () => resolveMarker(selectedId),
    [resolveMarker, selectedId],
  );

  // Count each marker the player opens — what KINDS of things get looked up is
  // the most useful thing this map can tell us (one event per five, see
  // map-events). Keyed on the marker ID, so a re-resolve (filter change, DEV
  // reclassification, pattern reshuffle) that hands back a new object for the
  // same marker doesn't count it twice.
  const trackedMarkerRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedMarker) {
      trackedMarkerRef.current = null;
      return;
    }
    if (trackedMarkerRef.current === selectedMarker.id) return;
    trackedMarkerRef.current = selectedMarker.id;
    recordLiveMarkerOpened(selectedMarker, { source: openSourceRef.current });
    openSourceRef.current = "map";
  }, [selectedMarker]);

  // The marker one level down the stack — what a back button / ESC returns to.
  const parentMarker = useMemo(() => {
    if (selStack.length < 2) return null;
    return resolveMarker(selStack[selStack.length - 2]);
  }, [selStack, resolveMarker]);

  // The "Your Markers" group is injected at the TOP of the rail, but only once the
  // user actually has custom markers (no empty group for everyone else), and only
  // listing the types they've actually used so the rail stays tidy.
  const groups = useMemo(() => {
    const localize = (g: CategoryGroup): CategoryGroup => ({
      ...g,
      label: t(groupLabelKey(g), { defaultValue: g.label }),
    });
    const base = groupsByGame[game].map(localize);
    if (customForGame.length === 0) return base;
    const used = new Set(customForGame.map((m) => m.category));
    return [
      localize({ ...CUSTOM_GROUP, categories: CUSTOM_GROUP.categories.filter((k) => used.has(k)) }),
      ...base,
    ];
  }, [game, customForGame, t, i18n.language]);

  // Preset + layer labels follow the same key-based localisation as categories.
  const presets = useMemo(
    () =>
      presetsByGame[game].map((p) => ({
        ...p,
        label: t(`preset.${p.key}`, { defaultValue: p.label }),
      })),
    [game, t, i18n.language],
  );
  const layers = useMemo(
    () =>
      layersByGame[game].map((l) => ({
        ...l,
        label: t(`layer.${l.key}`, { defaultValue: l.label }),
      })),
    [game, t, i18n.language],
  );

  // Every field below is already a stable reference (store selector / useCallback
  // / useMemo / setState) or a primitive, so this useMemo only produces a NEW
  // object when something actually changed. Without it the object literal was
  // rebuilt every render, forcing EVERY useMapExperience() consumer (MarkerLayer,
  // MapView, DetailPanel, filters…) to re-render on any unrelated render — the
  // main cascade behind the in-game overlay stutter.
  const value: MapExperience = useMemo(
    () => ({
      game,
      layer,
      categories,
      categoryById,
      groups,
      presets,
      layers,
      activeCategories,
      categoryCounts,
      categoryArt,
      visibleMarkers,
      allMarkers,
      selectedMarker,
      parentMarker,
      query,
      focusNonce,
      nightlord,
      shiftingEarth,
      patternIndex,
      matchingPatterns,
      currentPattern,
      drillItemKey,
      setDrillItemKey,
      combatTipsOpen,
      setCombatTipsOpen,
      nightlordDetailOpen,
      openNightlordDetail,
      closeNightlordDetail,
      railOpen,
      setRailOpen,
      showFound,
      showBookmarks,
      setShowFound,
      setShowBookmarks,
      trackedCounts,
      setGame,
      setLayer,
      toggleCategory,
      setGroup,
      showOnly,
      applyPreset,
      select,
      pushSelect,
      goBack,
      focusSelected,
      setQuery,
      setSeed,
      cyclePattern,
      selectPattern,
      gotoPattern,
    }),
    [
      game,
      layer,
      categories,
      categoryById,
      groups,
      presets,
      layers,
      activeCategories,
      categoryCounts,
      categoryArt,
      visibleMarkers,
      allMarkers,
      selectedMarker,
      parentMarker,
      query,
      focusNonce,
      nightlord,
      shiftingEarth,
      patternIndex,
      matchingPatterns,
      currentPattern,
      drillItemKey,
      setDrillItemKey,
      combatTipsOpen,
      setCombatTipsOpen,
      nightlordDetailOpen,
      openNightlordDetail,
      closeNightlordDetail,
      railOpen,
      setRailOpen,
      showFound,
      showBookmarks,
      setShowFound,
      setShowBookmarks,
      trackedCounts,
      setGame,
      setLayer,
      toggleCategory,
      setGroup,
      showOnly,
      applyPreset,
      select,
      pushSelect,
      goBack,
      focusSelected,
      setQuery,
      setSeed,
      cyclePattern,
      selectPattern,
      gotoPattern,
    ],
  );

  return (
    <MapExperienceContext.Provider value={value}>
      {children}
    </MapExperienceContext.Provider>
  );
};

export const useMapExperience = (): MapExperience => {
  const ctx = useContext(MapExperienceContext);
  if (!ctx)
    throw new Error("useMapExperience must be used within MapExperienceProvider");
  return ctx;
};
