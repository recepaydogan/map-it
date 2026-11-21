import type { MapCoordinate, MapItemCatalogEntry, MapLocation, MapLootIndexEntry, MapLootProfile, MapMetadata } from "../types";
import type { LootRunItemOption, LootRunMatchLevel, LootRunTarget } from "./loot-run-types";

export const MAX_LOOT_RUN_STOPS = 8;
export const MAX_LOOT_RUN_TOWN_DISTANCE = 1_600;
const MAX_OPTIONAL_STOP_DETOUR = 280;
const MAX_PLANNED_STOP_DETOUR = 420;
const MIN_OPTIONAL_STOP_UTILITY = 14;

const normalize = (value: string) => value.trim().toLocaleLowerCase("en-US");

const getDistance = (left: MapCoordinate, right: MapCoordinate) =>
  Math.hypot(left.x - right.x, left.y - right.y);

const areKnownNearbyTowns = (left: MapLocation, right: MapLocation) => {
  const names = `${normalize(left.town)}|${normalize(right.town)}`;
  return names.includes("grapeseed") && names.includes("constown");
};

const getLootProfileIds = (location: MapLocation) => location.lootProfileIds
  ?? (location.lootProfileId ? [location.lootProfileId] : []);

export const createLootRunItemCatalog = (
  profiles: Record<string, MapLootProfile> | undefined,
  locations: MapLocation[],
  catalog?: MapItemCatalogEntry[],
  lootIndex?: MapLootIndexEntry[],
): LootRunItemOption[] => {
  if (!profiles) return [];
  const itemLookup = new Map((catalog ?? []).map((item) => [item.id, item]));
  if (lootIndex) {
    const indexById = new Map(lootIndex.map((entry) => [entry.id, entry]));
    const sourceItems = catalog ?? lootIndex.map((entry) => ({
      id: entry.id,
      name: itemLookup.get(entry.id)?.name ?? entry.id.replace(/^.*[.]/, ""),
      lootable: true,
    }));
    return sourceItems
      .map((item) => ({
        ...(indexById.get(item.id) ?? {
          id: item.id,
          bestWeight: 0,
          locationCount: 0,
          profileIds: [],
        }),
        name: item.name,
        lootable: item.lootable,
      }))
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }
  const locationsByProfile = locations.reduce<Record<string, number>>((counts, location) => {
    for (const profileId of getLootProfileIds(location)) {
      counts[profileId] = (counts[profileId] ?? 0) + 1;
    }
    return counts;
  }, {});
  const items = new Map<string, LootRunItemOption>();

  for (const [profileId, profile] of Object.entries(profiles)) {
    const locationCount = locationsByProfile[profileId] ?? 0;
    if (locationCount === 0) continue;
    for (const item of profile.items) {
      const current = items.get(item.id);
      if (current) {
        current.bestWeight = Math.max(current.bestWeight, item.weight);
        current.locationCount += locationCount;
        current.profileIds.push(profileId);
      } else {
        items.set(item.id, {
          id: item.id,
          name: item.name ?? itemLookup.get(item.id)?.name ?? item.id.replace(/^.*[.]/, ""),
          bestWeight: item.weight,
          locationCount,
          profileIds: [profileId],
          lootable: true,
        });
      }
    }
  }

  return [...items.values()].sort((left, right) =>
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id),
  );
};

export const searchLootRunItems = (
  items: LootRunItemOption[],
  query: string,
  limit = 20,
) => {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) {
    return [...items]
      .sort((left, right) =>
        right.locationCount - left.locationCount ||
        right.bestWeight - left.bestWeight ||
        left.name.localeCompare(right.name),
      )
      .slice(0, limit);
  }
  const terms = normalizedQuery.split(/\s+/).filter(Boolean);
  return items
    .flatMap((item) => {
      const name = normalize(item.name);
      if (!terms.every((term) => name.includes(term))) return [];
      const matchRank = name === normalizedQuery ? 0 : name.startsWith(normalizedQuery) ? 1 : 2;
      return [{ item, matchRank }];
    })
    .sort((left, right) =>
      left.matchRank - right.matchRank ||
      right.item.bestWeight - left.item.bestWeight ||
      right.item.locationCount - left.item.locationCount ||
      left.item.name.localeCompare(right.item.name),
    )
    .slice(0, limit)
    .map(({ item }) => item);
};

export const createLootRunTargets = (
  data: MapMetadata,
  selectedItemIds: string | string[] | null,
  origin: MapCoordinate | null,
): LootRunTarget[] => {
  const itemIds = [...new Set(
    (Array.isArray(selectedItemIds) ? selectedItemIds : [selectedItemIds])
      .filter((itemId): itemId is string => Boolean(itemId)),
  )];
  if (itemIds.length === 0 || !data.lootProfiles) return [];
  const itemIdSet = new Set(itemIds);
  const weightsByProfile = new Map<string, Record<string, number>>();
  for (const [profileId, profile] of Object.entries(data.lootProfiles)) {
    const itemWeights = Object.fromEntries(profile.items
      .filter((candidate) => itemIdSet.has(candidate.id))
      .map((candidate) => [candidate.id, candidate.weight]));
    if (Object.keys(itemWeights).length > 0) weightsByProfile.set(profileId, itemWeights);
  }
  return data.locations
    .flatMap((location) => {
      const itemWeights: Record<string, number> = {};
      for (const profileId of getLootProfileIds(location)) {
        const profileWeights = weightsByProfile.get(profileId);
        if (!profileWeights) continue;
        for (const [itemId, itemWeight] of Object.entries(profileWeights)) {
          itemWeights[itemId] = Math.max(itemWeights[itemId] ?? 0, itemWeight);
        }
      }
      const weights = Object.values(itemWeights);
      if (weights.length === 0) return [];
      const weight = weights.reduce((total, value) => total + value, 0)
        / itemIds.length;
      return [{
        location,
        weight,
        itemWeights,
        distance: origin ? getDistance(origin, location) : null,
      }];
    })
    .sort((left, right) =>
      right.weight - left.weight ||
      (left.distance ?? Number.POSITIVE_INFINITY) - (right.distance ?? Number.POSITIVE_INFINITY) ||
      left.location.town.localeCompare(right.location.town) ||
      left.location.name.localeCompare(right.location.name),
    );
};

export const getLootRunItemWeightAtLocation = (
  data: MapMetadata,
  location: MapLocation,
  itemId: string,
) => Math.max(0, ...getLootProfileIds(location).flatMap((profileId) => {
  const item = data.lootProfiles?.[profileId]?.items.find((candidate) => candidate.id === itemId);
  return item ? [item.weight] : [];
}));

export const selectLootRunRouteTargets = (
  targets: LootRunTarget[],
  origin: MapCoordinate | null,
  limit = MAX_LOOT_RUN_STOPS,
) => {
  if (targets.length === 0 || limit <= 0) return [];
  const townCenters = new Map<string, MapCoordinate & { count: number }>();
  for (const { location } of targets) {
    const current = townCenters.get(location.townId);
    if (!current) {
      townCenters.set(location.townId, { x: location.x, y: location.y, count: 1 });
      continue;
    }
    const count = current.count + 1;
    current.x += (location.x - current.x) / count;
    current.y += (location.y - current.y) / count;
    current.count = count;
  }
  const anchorTarget = origin
    ? [...targets].sort((left, right) =>
      getDistance(origin, left.location) - getDistance(origin, right.location)
      || right.weight - left.weight)[0]!
    : targets[0]!;
  const anchorTownCenter = townCenters.get(anchorTarget.location.townId)!;
  const scopedTargets = targets.filter(({ location }) => {
    if (location.townId === anchorTarget.location.townId) return true;
    if (areKnownNearbyTowns(anchorTarget.location, location)) return true;
    const townCenter = townCenters.get(location.townId);
    return Boolean(townCenter
      && getDistance(anchorTownCenter, townCenter) <= MAX_LOOT_RUN_TOWN_DISTANCE);
  });
  const bestWeight = scopedTargets[0]!.weight;
  const viableTargets = scopedTargets
    .filter(({ weight }) => weight >= Math.max(12, bestWeight * 0.45));
  const chosen = new Map<string, LootRunTarget>();
  const uncoveredItemIds = new Set(scopedTargets.flatMap(({ itemWeights }) => Object.keys(itemWeights)));
  let selectionCursor = origin ?? anchorTarget.location;

  // Cover the requested items without sending the player across the whole map
  // for each item's absolute best roll. A nearby good lead is more useful than
  // a perfect lead in another town, and one stop may cover several items.
  while (chosen.size < limit && uncoveredItemIds.size > 0) {
    const next = scopedTargets
      .filter(({ location }) => !chosen.has(location.id))
      .flatMap((target) => {
        const uncoveredWeights = Object.entries(target.itemWeights)
          .filter(([itemId]) => uncoveredItemIds.has(itemId));
        if (uncoveredWeights.length === 0) return [];
        const distance = getDistance(selectionCursor, target.location);
        const coverageWeight = uncoveredWeights.reduce((total, [, weight]) => total + weight, 0);
        return [{
          target,
          uncoveredWeights,
          distance,
          utility: coverageWeight / (1 + distance / 250),
        }];
      })
      .sort((left, right) =>
        right.utility - left.utility
        || right.uncoveredWeights.length - left.uncoveredWeights.length
        || left.distance - right.distance
        || right.target.weight - left.target.weight)[0];
    if (!next) break;
    chosen.set(next.target.location.id, next.target);
    for (const [itemId] of next.uncoveredWeights) uncoveredItemIds.delete(itemId);
    selectionCursor = next.target.location;
  }

  const optionalRoute = [...chosen.values()];
  const insertionCost = (candidate: LootRunTarget) => {
    if (optionalRoute.length === 0) return 0;
    const routeStart = origin ?? optionalRoute[0]!.location;
    let bestCost = Number.POSITIVE_INFINITY;
    for (let index = origin ? 0 : 1; index <= optionalRoute.length; index += 1) {
      const previous = index === 0 ? routeStart : optionalRoute[index - 1]!.location;
      const next = optionalRoute[index]?.location;
      const cost = next
        ? getDistance(previous, candidate.location)
          + getDistance(candidate.location, next)
          - getDistance(previous, next)
        : getDistance(previous, candidate.location);
      bestCost = Math.min(bestCost, cost);
    }
    return bestCost;
  };

  while (chosen.size < limit) {
    const next = viableTargets
      .filter(({ location }) => !chosen.has(location.id))
      .map((target) => {
        const detour = insertionCost(target);
        return { target, detour, utility: target.weight / (1 + detour / 120) };
      })
      .filter(({ detour, utility }) =>
        detour <= MAX_OPTIONAL_STOP_DETOUR && utility >= MIN_OPTIONAL_STOP_UTILITY)
      .sort((left, right) =>
        right.utility - left.utility
        || left.detour - right.detour
        || right.target.weight - left.target.weight)[0];
    if (!next) break;
    chosen.set(next.target.location.id, next.target);
    optionalRoute.push(next.target);
  }

  const remaining = [...chosen.values()];
  const selected: LootRunTarget[] = [];
  let cursor = origin ?? [...remaining].sort((left, right) => right.weight - left.weight)[0]!.location;

  while (remaining.length > 0 && selected.length < limit) {
    remaining.sort((left, right) => {
      const leftDistance = getDistance(cursor, left.location);
      const rightDistance = getDistance(cursor, right.location);
      return leftDistance - rightDistance || right.weight - left.weight;
    });
    const next = remaining.shift()!;
    selected.push(next);
    cursor = next.location;
  }

  if (selected.length < 2) return selected;
  const routeStart = origin ?? selected[0]!.location;
  const firstMutableIndex = origin ? 0 : 1;
  const routeDistance = (route: LootRunTarget[]) => route.reduce(
    (total, target, index) => total + getDistance(
      index === 0 ? routeStart : route[index - 1]!.location,
      target.location,
    ),
    0,
  );
  let optimized = [...selected];
  let optimizedDistance = routeDistance(optimized);
  let improved = true;

  // Greedy selection chooses a strong nearby set; this small 2-opt pass then
  // removes avoidable backtracking without changing which locations were
  // chosen. Eight stops keeps the exhaustive pair scan effectively free.
  while (improved) {
    improved = false;
    for (let from = firstMutableIndex; from < optimized.length - 1; from += 1) {
      for (let to = from + 1; to < optimized.length; to += 1) {
        const candidate = [
          ...optimized.slice(0, from),
          ...optimized.slice(from, to + 1).reverse(),
          ...optimized.slice(to + 1),
        ];
        const candidateDistance = routeDistance(candidate);
        if (candidateDistance >= optimizedDistance - 0.01) continue;
        optimized = candidate;
        optimizedDistance = candidateDistance;
        improved = true;
      }
    }
  }

  while (optimized.length > 1) {
    const detours = optimized.flatMap((target, index) => {
      if (!origin && index === 0) return [];
      const previous = index === 0 ? routeStart : optimized[index - 1]!.location;
      const next = optimized[index + 1]?.location;
      const detour = next
        ? getDistance(previous, target.location)
          + getDistance(target.location, next)
          - getDistance(previous, next)
        : getDistance(previous, target.location);
      return [{ index, detour }];
    });
    const outlier = detours.sort((left, right) => right.detour - left.detour)[0]!;
    if (outlier.detour <= MAX_PLANNED_STOP_DETOUR) break;
    optimized.splice(outlier.index, 1);
  }

  return optimized;
};

export const getLootRunMatchLevel = (weight: number): LootRunMatchLevel => {
  if (weight >= 75) return "best";
  if (weight >= 40) return "good";
  return "possible";
};
