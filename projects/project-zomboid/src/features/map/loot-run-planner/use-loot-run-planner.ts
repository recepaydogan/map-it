import { scopeLootRunTargets, type LootRunStart } from "./loot-run-start";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { calculateLootMapRoute } from "../calculate-loot-map-route";
import type {
  MapCoordinate,
  MapMetadata,
  SavedLootRun,
  SavedLootRunItem,
  SavedMapRoute,
} from "../types";
import type { LootRunItemOption } from "./loot-run-types";
import {
  createLootRunItemCatalog,
  createLootRunTargets,
  MAX_LOOT_RUN_TOWN_DISTANCE,
  selectLootRunRouteTargets,
} from "./loot-run-utils";

interface UseLootRunPlannerOptions {
  data: MapMetadata | null | undefined;
  position: MapCoordinate | null;
  startPosition: MapCoordinate | null;
  startChoice: LootRunStart;
  lootRuns: SavedLootRun[];
  startRun: (
    mapId: string,
    items: SavedLootRunItem[],
    locationIds: string[],
    existingRunId?: string,
  ) => SavedLootRun | null;
  toggleLocation: (runId: string, locationId: string) => void;
  clearRun: (runId: string) => void;
  replaceRoute: (
    mapId: string,
    points: Array<MapCoordinate & { label?: string }>,
    name: string,
    lootRunId: string,
  ) => SavedMapRoute;
  clearLootRoute: (lootRunId: string) => void;
}

const useLootRunPlanner = ({
  data,
  position,
  startPosition,
  startChoice,
  lootRuns,
  startRun,
  toggleLocation,
  clearRun,
  replaceRoute,
  clearLootRoute,
}: UseLootRunPlannerOptions) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const items = useMemo(
    () => createLootRunItemCatalog(
      data?.lootProfiles,
      data?.locations ?? [],
      data?.items,
      data?.lootIndex,
    ),
    [data?.items, data?.locations, data?.lootIndex, data?.lootProfiles],
  );
  const runs = useMemo(
    () => lootRuns
      .filter((run) => run.mapId === data?.id)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [data?.id, lootRuns],
  );
  const activeRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const effectiveItemIds = useMemo(
    () => activeRun ? activeRun.items.map(({ id }) => id) : selectedItemIds,
    [activeRun, selectedItemIds],
  );
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const selectedItems = useMemo(
    () => effectiveItemIds.flatMap((itemId) => {
      const item = itemsById.get(itemId);
      return item ? [item] : [];
    }),
    [effectiveItemIds, itemsById],
  );
  const targets = useMemo(
    () => data ? createLootRunTargets(data, effectiveItemIds, position) : [],
    [data, effectiveItemIds, position],
  );

  const startNewPlan = () => {
    setSelectedRunId(null);
    setSelectedItemIds([]);
    setQuery("");
  };

  const toggleItem = (item: LootRunItemOption) => {
    setSelectedRunId(null);
    setSelectedItemIds((current) => current.includes(item.id)
      ? current.filter((id) => id !== item.id)
      : [...current, item.id]);
  };

  const getRouteName = (runItems: SavedLootRunItem[]) => {
    if (runItems.length > 1) {
      return `${t("map.route.lootRunRoute")} · ${t("map.lootRun.itemCount", { count: runItems.length })}`;
    }
    return t("map.lootRun.routeName", {
      item: runItems[0]!.name,
    });
  };

  const buildRoute = async () => {
    if (!data || selectedItems.length === 0 || !startPosition) return null;
    const position = startChoice.mode === "town" ? null : startPosition;
    const routeTargets = selectLootRunRouteTargets(scopeLootRunTargets(targets, startChoice, position), position);
    if (routeTargets.length === 0) return null;
    const runItems = selectedItems.map(({ id, name }) => ({ id, name }));
    const includePosition = Boolean(position);
    const proposedPoints = [
      ...(includePosition && position
        ? [{ ...position, label: t("map.lootRun.start.routeStart") }]
        : []),
      ...routeTargets.map(({ location }) => ({
        x: location.x,
        y: location.y,
        label: location.name,
      })),
    ];
    let retainedPointIndexes = proposedPoints.map((_, index) => index);
    if (proposedPoints.length >= 2) {
      try {
        const calculation = await calculateLootMapRoute(
          proposedPoints,
          data.bounds,
          includePosition,
          data.navigationBaseUrls ?? [],
        );
        retainedPointIndexes = calculation.retainedPointIndexes;
        // An unreachable chosen origin must not silently become a loot-only route.
        if (includePosition && !retainedPointIndexes.includes(0)) return null;
      } catch (error) {
        // Route rendering uses the same resilient planner and can still remove
        // an unreachable optional stop. Validation must never block saving a
        // useful loot plan because navigation data failed to load up front.
        console.error("Loot route preflight validation failed.", error);
      }
    }
    const retainedIndexes = new Set(retainedPointIndexes);
    const pointOffset = includePosition ? 1 : 0;
    const retainedTargets = routeTargets.filter((_, index) => retainedIndexes.has(index + pointOffset));
    if (retainedTargets.length === 0) return null;
    const retainedPoints = proposedPoints.filter((_, index) => retainedIndexes.has(index));
    const run = startRun(
      data.id,
      runItems,
      retainedTargets.map(({ location }) => location.id),
      activeRun?.id,
    );
    if (!run) return null;
    const route = replaceRoute(
      data.id,
      retainedPoints,
      getRouteName(runItems),
      run.id,
    );
    setSelectedRunId(run.id);
    setSelectedItemIds([]);
    return { route, run };
  };

  const toggleCompleted = (locationId: string, runId = activeRun?.id) => {
    if (!data || !runId) return;
    const run = runs.find((candidate) => candidate.id === runId);
    if (!run) return;
    const completed = new Set(run.completedLocationIds);
    if (completed.has(locationId)) completed.delete(locationId);
    else completed.add(locationId);
    toggleLocation(run.id, locationId);

    const remaining = run.locationIds.flatMap((id) => {
      if (completed.has(id)) return [];
      const location = data.locations.find((candidate) => candidate.id === id);
      return location ? [location] : [];
    });
    if (remaining.length === 0) {
      clearLootRoute(run.id);
      return;
    }
    replaceRoute(
      data.id,
      [
        ...(position && Math.hypot(
          position.x - remaining[0]!.x,
          position.y - remaining[0]!.y,
        ) <= MAX_LOOT_RUN_TOWN_DISTANCE
          ? [{ ...position, label: t("map.lootRun.currentPosition") }]
          : []),
        ...remaining.map((location) => ({ x: location.x, y: location.y, label: location.name })),
      ],
      getRouteName(run.items),
      run.id,
    );
  };

  const removeRun = () => {
    if (!activeRun) return;
    clearRun(activeRun.id);
    clearLootRoute(activeRun.id);
    startNewPlan();
  };

  return {
    items,
    query,
    setQuery,
    selectedItemIds,
    selectedItems,
    targets,
    activeRun,
    toggleItem,
    buildRoute,
    toggleCompleted,
    removeRun,
    startNewPlan,
    reset: startNewPlan,
  };
};

export default useLootRunPlanner;
