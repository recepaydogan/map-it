import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { categoriesByGame, groupLabelKey, groupsByGame } from "../../data/categories";
import {
  CUSTOM_GROUP,
  isCustomCategory,
} from "../../data/custom-markers";
import type { CategoryDef, CategoryGroup, Game } from "../../data/types";
import { initialRailOpen } from "../filters/initial-rail-open";
import { matchesMarkerCategory } from "./er-map-reward-filters";
import { useErMapCategoryCounts } from "./use-er-map-category-counts";
import { rawErMapMarkers } from "./er-map-data";
import { localizeRawMarkers } from "./er-map-localize";
import { layerForArea } from "./raw-coordinate-system";
import { erMapCategoryArtUrl } from "./er-map-marker-art";
import type {
  BossRewardFilters,
  RawErMapMarker,
  ErMapLayer,
  ErMapManifestCategory,
  ErMapManifestGroup,
} from "./types";
import useErMapTracking from "./use-er-map-tracking";
import { useMapStore } from "../../store/map-store";

const TEST_CATEGORY_VISUALS: Record<string, Pick<CategoryDef, "color" | "icon">> = {
  connection: { color: "#8aa6c7", icon: "cable" },
  item: { color: "#c7ad67", icon: "package" },
  "stake-of-marika": { color: "#d6c690", icon: "milestone" },
  "summon-sign": { color: "#a88bd1", icon: "summon-sign" },
};

const PARAM_CATEGORY_KEYS = new Set(rawErMapMarkers.map((marker) => marker.category));

interface ErMapStateOptions {
  game: Game;
  markers?: RawErMapMarker[];
  /** Unfiltered full pool for the view (all category chunks). Search selections land
   * here even when their category chunk isn't part of `markers`, so the selected
   * marker can still be resolved and kept on the map. */
  allMarkers?: RawErMapMarker[];
  additionalCategories?: ErMapManifestCategory[];
  additionalGroups?: ErMapManifestGroup[];
  viewCounts?: Record<string, number>;
  bossRewardFilters?: BossRewardFilters;
  /** Which view these counts belong to — completion is per view, and a marker
   *  ticked off in a dungeon must not count towards the overworld. */
  viewKey?: string;
  activeCategories: Set<string>;
  setActiveCategories: Dispatch<SetStateAction<Set<string>>>;
}

const useErMapState = (layer: ErMapLayer | null, options: ErMapStateOptions) => {
  const { t } = useTranslation();
  const {
    game,
    markers,
    allMarkers,
    additionalCategories = [],
    additionalGroups = [],
    viewCounts,
    bossRewardFilters,
    viewKey,
    activeCategories,
    setActiveCategories,
  } = options;
  // Elden Ring drives the rail from its baked param categories; Nightreign has no
  // param base — its whole catalog comes from the (native) manifest, so an empty
  // base keeps ER categories out of the NR rail.
  const isEr = game === "elden-ring";
  const baseCatalog = useMemo<CategoryDef[]>(
    () => (isEr ? categoriesByGame["elden-ring"] : []),
    [isEr],
  );
  const paramKeys = useMemo(
    () => (isEr ? PARAM_CATEGORY_KEYS : new Set<string>()),
    [isEr],
  );
  const deletions = useMapStore((s) => s.editMode ? s.markerDeletions : s.committedMarkerDeletions);
  const [railOpen, setRailOpen] = useState(initialRailOpen);
  const [query, setQuery] = useState("");
  const [selStack, setSelStack] = useState<string[]>([]);
  const selectedId = selStack[selStack.length - 1] ?? null;

  const setSelectedId = useCallback((id: string | null) => {
    setSelStack(id ? [id] : []);
  }, []);

  const pushSelect = useCallback((id: string) => {
    setSelStack((s) => [...s, id]);
  }, []);

  const goBack = useCallback(() => {
    setSelStack((s) => s.slice(0, -1));
  }, []);

  const [markerCache, setMarkerCache] = useState<Record<string, RawErMapMarker>>({});



  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const {
    favorites,
    foundMarkers,
    hideCompleted,
    setHideCompleted,
    hideFavorites,
    setHideFavorites,
    foundMeta,
    rememberFound,
    toggleFavorite,
    toggleFound,
  } = useErMapTracking();

  const layerMarkers = useMemo(
    // The streamed view markers arrive already localized (er-map-spatial-data);
    // the baked param fallback (manifest still in flight) localizes here.
    () => markers ?? (isEr
      ? localizeRawMarkers(
        rawErMapMarkers.filter((marker) =>
          layer !== null && layerForArea(marker.areaNo) === layer),
        t,
      )
      : []),
    [isEr, layer, markers, t],
  );

  const { categoryCounts, doneCounts } = useErMapCategoryCounts({
    layerMarkers, viewCounts, viewKey, bossRewardFilters, foundMarkers, foundMeta, rememberFound,
  });

  const catalog = useMemo(() => {
    const available = new Set([
      ...paramKeys,
      ...additionalCategories.map((category) => category.key),
      ...layerMarkers.map((marker) => marker.category),
    ]);
    const byKey = new Map<string, CategoryDef>();
    for (const category of baseCatalog) {
      if (available.has(category.key)) byKey.set(category.key, category);
    }
    for (const category of additionalCategories) {
      const existing = byKey.get(category.key);
      const testVisual = TEST_CATEGORY_VISUALS[category.key];
      byKey.set(category.key, {
        ...category,
        color: testVisual?.color ?? existing?.color ?? category.color,
        icon: testVisual?.icon ?? existing?.icon ?? category.icon,
      });
    }
    return [...byKey.values()].map((category) => ({
      ...category,
      label: t(`category.${category.key}`, { defaultValue: category.label }),
      // Manifest blurbs are baked English — the catalog key wins when translated.
      description: category.description
        ? t(`erMap.categoryBlurb.${category.key}`, { defaultValue: category.description })
        : category.description,
    }));
  }, [additionalCategories, baseCatalog, layerMarkers, paramKeys, t]);
  // The rail only lists categories that have at least one pin on the CURRENT view —
  // dlc-gaol has no business on the overworld rail, evergaol none on the DLC map.
  const categories = useMemo(
    () => catalog.filter((category) => (categoryCounts.get(category.key) ?? 0) > 0),
    [catalog, categoryCounts],
  );
  // Lookups keep the FULL catalog: a cross-view selection (detail panel, back-stack
  // parent) can reference a category the current view has zero pins of.
  const categoryById = useMemo(
    () => new Map(catalog.map((category) => [category.key, category])),
    [catalog],
  );
  const groups = useMemo<CategoryGroup[]>(() => {
    const availableKeys = new Set(categories.map((category) => category.key));
    const baseGroupDefs = isEr ? groupsByGame["elden-ring"] : [];
    const baseDefKeys = new Set(baseGroupDefs.flatMap((group) => group.categories));
    const base = baseGroupDefs
      .map((group) => ({
        ...group,
        label: t(groupLabelKey(group), { defaultValue: group.label }),
        // Base categories first, then the manifest categories the builder filed
        // under this base group (e.g. enemy chunks → "bosses"). Keys already in a
        // base group def stay wherever that definition puts them.
        categories: [
          ...group.categories.filter((key) => availableKeys.has(key)),
          ...additionalCategories
            .filter((category) => category.group === group.key
              && !baseDefKeys.has(category.key)
              && availableKeys.has(category.key))
            .map((category) => category.key),
        ],
      }))
      .filter((group) => group.categories.length > 0);
    const baseCategoryKeys = new Set(base.flatMap((group) => group.categories));
    const spatial = additionalGroups.map((group) => ({
      ...group,
      label: t(groupLabelKey(group), { defaultValue: group.label }),
      categories: additionalCategories
        .filter((category) => category.group === group.key)
        .map((category) => category.key)
        .filter((key) => availableKeys.has(key) && !baseCategoryKeys.has(key)),
    }));
    const customCategories = categories
      .map((category) => category.key)
      .filter(isCustomCategory);
    const custom = customCategories.length
      ? [{
          ...CUSTOM_GROUP,
          label: t(groupLabelKey(CUSTOM_GROUP), { defaultValue: CUSTOM_GROUP.label }),
          categories: customCategories,
        }]
      : [];
    return [...custom, ...base, ...spatial].filter((group) => group.categories.length > 0);
  }, [additionalCategories, additionalGroups, categories, isEr, t]);

  useEffect(() => {
    if (layerMarkers.length === 0) return;
    setMarkerCache((current) => {
      let changed = false;
      const next = { ...current };
      for (const m of layerMarkers) {
        if (!next[m.id]) {
          next[m.id] = m;
          changed = true;
        }
      }
      if (allMarkers) {
        for (const m of allMarkers) {
          if (!next[m.id]) {
            next[m.id] = m;
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
  }, [layerMarkers, allMarkers]);

  // Name lookup for the edit Changes panel. Its ids are streamed chunk ids that the
  // baked `markersByGame` pool knows nothing about, so the panel gets them from here;
  // the cache is the widest source, covering views and categories loaded earlier in
  // the session (a change made on the overworld still reads by name from the DLC map).
  const markerNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const marker of Object.values(markerCache)) names.set(marker.id, marker.name);
    for (const marker of layerMarkers) names.set(marker.id, marker.name);
    return names;
  }, [markerCache, layerMarkers]);

  const categoryArt = useMemo(
    // Full catalog, same reason as categoryById: force-kept cross-view pins must
    // keep their art even when their category has no pins on this view.
    () => new Map(catalog.map((category) => [category.key, erMapCategoryArtUrl(category.key)])),
    [catalog],
  );
  const filteredMarkers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return layerMarkers.filter((marker) =>
      !deletions.has(marker.id) &&
      matchesMarkerCategory(marker, activeCategories, bossRewardFilters) &&
      // Declutter: what is done is out of the way. The pin is not forgotten —
      // the selected marker is force-kept below, so ticking one off from its
      // own panel doesn't yank the panel's subject off the map.
      (!hideCompleted || !foundMarkers.has(marker.id)) &&
      (!hideFavorites || !favorites.has(marker.id)) &&
      (!favoritesOnly || favorites.has(marker.id)) &&
      (!normalizedQuery ||
        marker.name.toLowerCase().includes(normalizedQuery) ||
        // Localized copies keep the English original — match both spellings.
        marker.enName?.toLowerCase().includes(normalizedQuery) ||
        marker.region?.toLowerCase().includes(normalizedQuery) ||
        marker.modelName?.toLowerCase().includes(normalizedQuery) ||
        marker.id.toLowerCase().includes(normalizedQuery)),
    );
  }, [
    activeCategories,
    bossRewardFilters,
    deletions,
    favorites,
    favoritesOnly,
    foundMarkers,
    hideCompleted,
    hideFavorites,
    layerMarkers,
    query,
  ]);

  // Selecting must NOT change this array's identity unless the set really changed:
  // the marker layer rebuilds every pin when it does, which would collapse an open
  // spiderfy the moment one of its fanned-out legs is clicked — the one case the fan
  // exists for. So the force-kept extras go into a copy, and the common case (the
  // pick is already on the map) hands back the filtered array untouched.
  const visibleMarkers = useMemo(() => {
    if (!selectedId) return filteredMarkers;
    const resolve = (id: string) =>
      layerMarkers.find((marker) => marker.id === id) ?? allMarkers?.find((marker) => marker.id === id);
    const extras: RawErMapMarker[] = [];
    const show = (id: string) => {
      if (filteredMarkers.some((marker) => marker.id === id)) return;
      if (extras.some((marker) => marker.id === id)) return;
      const marker = resolve(id);
      if (marker) extras.push(marker);
    };
    // The selected marker stays on the map even when filtered out (same rule as the
    // live Maps view) — resolved from the full pool when its category chunk isn't
    // part of the active-category load.
    show(selectedId);
    // A selected boss also puts its dungeon entrance(s) on the map. The boss pin
    // sits at its arena deep inside the hill, so on its own it never shows the way
    // in — and with a bosses-only filter the entrance's category isn't even loaded.
    const selected = resolve(selectedId);
    for (const entrance of selected?.dungeonEntrances ?? []) show(entrance.id);
    return extras.length ? [...filteredMarkers, ...extras] : filteredMarkers;
  }, [allMarkers, filteredMarkers, layerMarkers, selectedId]);

  const selectedMarker = useMemo(() => {
    if (!selectedId) return null;
    return layerMarkers.find((m) => m.id === selectedId)
      ?? allMarkers?.find((m) => m.id === selectedId)
      ?? markerCache[selectedId]
      ?? null;
  }, [selectedId, layerMarkers, allMarkers, markerCache]);

  useEffect(() => {
    if (selectedMarker) {
      setMarkerCache((current) => {
        if (current[selectedMarker.id]) return current;
        return { ...current, [selectedMarker.id]: selectedMarker };
      });
    }
  }, [selectedMarker]);

  const parentMarker = useMemo(() => {
    if (selStack.length < 2) return null;
    const parentId = selStack[selStack.length - 2];
    return layerMarkers.find((m) => m.id === parentId)
      ?? allMarkers?.find((m) => m.id === parentId)
      ?? markerCache[parentId]
      ?? null;
  }, [selStack, layerMarkers, allMarkers, markerCache]);

  const toggleCategory = useCallback((key: string) => {
    setActiveCategories((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, [setActiveCategories]);
  const showOnly = useCallback(
    (keys: string[]) => setActiveCategories(new Set(keys)),
    [setActiveCategories],
  );
  const setGroup = useCallback((groupKey: string, on: boolean) => {
    const group = groups.find((candidate) => candidate.key === groupKey);
    if (!group) return;
    setActiveCategories((current) => {
      const next = new Set(current);
      for (const key of group.categories) {
        if (on) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }, [groups, setActiveCategories]);
  return {
    categories,
    categoryById,
    groups,
    categoryCounts,
    doneCounts,
    categoryArt,
    activeCategories,
    railOpen,
    setRailOpen,
    query,
    setQuery,
    selectedId,
    setSelectedId,
    selectedMarker,
    pushSelect,
    goBack,
    parentMarker,
    favorites,
    foundMarkers,
    hideCompleted,
    setHideCompleted,
    hideFavorites,
    setHideFavorites,
    favoritesOnly,
    setFavoritesOnly,
    layerMarkers,
    markerNames,
    visibleMarkers,
    toggleCategory,
    showOnly,
    setGroup,
    toggleFavorite,
    toggleFound,
  };
};

export default useErMapState;
