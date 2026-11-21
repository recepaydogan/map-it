import {
  erItemByEnglishName,
  erItemByKey,
  erItemEnglishText,
  erItemKey,
  erItems,
  type ErItem,
} from "./er-items-data";
import {
  directAcquisitionSourceRegion,
  itemAcquisitionSources,
  type DirectAcquisitionKind,
  type DirectAcquisitionSource,
} from "./item-acquisition-sources";
import { erMarkerEnglishName } from "./er-markers-data";
import { markerArtUrl } from "./marker-art";
import {
  itemDropSources,
  markersByGame,
  type DropSource,
} from "./markers";
import type { MapLayer, Marker } from "./types";

export interface RemembranceTradeRoute {
  material: ErItem;
  boss?: DropSource;
  merchant: string;
  location: string;
}

export interface RecommendationItemAccess {
  available: boolean;
  effort: number;
  routeKind?: AcquisitionRouteKind;
}

export interface RecommendationTargetContext {
  layer?: MapLayer;
  region?: string;
  scaleRegion?: string;
}

export type AcquisitionRouteKind = DirectAcquisitionKind | "crafting" | "remembrance";

const REMEMBRANCE_PATTERN = /\bRemembrance\b/i;
const MATCH_STOP_WORDS = new Set([
  "a",
  "and",
  "hewn",
  "into",
  "of",
  "remembrance",
  "the",
]);
const remembranceBossCache = new Map<string, DropSource | undefined>();
const recommendationAccessCache = new Map<string, RecommendationItemAccess>();
const recipeBookKeysByItemKey = new Map<string, string[]>();

for (const item of erItems) {
  for (const unlock of item.unlocks ?? []) {
    const recipeBookKey = erItemKey(item);
    const recipeBookKeys = recipeBookKeysByItemKey.get(unlock.item_key);
    if (recipeBookKeys) recipeBookKeys.push(recipeBookKey);
    else recipeBookKeysByItemKey.set(unlock.item_key, [recipeBookKey]);
  }
}

const matchTokens = (value: string): Set<string> =>
  new Set(
    value
      .toLocaleLowerCase("en-US")
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length >= 4 && !MATCH_STOP_WORDS.has(token)) ?? [],
  );

const bossMatchScore = (clues: Set<string>, bossName: string): number => {
  let score = 0;
  for (const token of matchTokens(bossName)) {
    if (clues.has(token)) score += token.length;
  }
  return score;
};

const findRemembranceBoss = (materialName: string): DropSource | undefined => {
  if (remembranceBossCache.has(materialName)) return remembranceBossCache.get(materialName);
  const englishMaterial = erItemEnglishText(materialName);
  const localizedMaterial = erItemByEnglishName(materialName);
  if (!englishMaterial || !localizedMaterial) {
    remembranceBossCache.set(materialName, undefined);
    return undefined;
  }

  const clues = matchTokens(`${englishMaterial.name} ${englishMaterial.description.split("\n")[0]}`);
  const indexedSourceIds = new Set(
    itemDropSources(erItemKey(localizedMaterial)).map((source) => source.markerId),
  );

  const candidates = markersByGame["elden-ring"]
    .filter((marker) => marker.category === "boss")
    .map((marker) => {
      const englishName = erMarkerEnglishName(marker.id) ?? marker.name;
      const lexicalScore = bossMatchScore(clues, englishName);
      return {
        marker,
        score: lexicalScore + (lexicalScore > 0 && indexedSourceIds.has(marker.id) ? 5 : 0),
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0];

  const source = candidates ? {
    markerId: candidates.marker.id,
    name: candidates.marker.name,
    category: candidates.marker.category,
    note: "Guaranteed",
    iconUrl: markerArtUrl(candidates.marker),
  } : undefined;
  remembranceBossCache.set(materialName, source);
  return source;
};

/**
 * Resolve real remembrance exchanges while rejecting ShopLineupParam collisions
 * that incorrectly attach a material trade to ordinary equipment.
 */
export const remembranceTradeRoute = (item: ErItem): RemembranceTradeRoute | undefined => {
  const materialName = item.obtainability?.trade;
  if (!materialName || !REMEMBRANCE_PATTERN.test(materialName)) return undefined;

  const upgradeType = item.stats.upgrade;
  if (item.category === "weapon" && upgradeType === "Smithing") return undefined;
  if (itemDropSources(erItemKey(item)).length > 0) return undefined;

  const material = erItemByEnglishName(materialName);
  if (!material) return undefined;

  return {
    material,
    boss: findRemembranceBoss(materialName),
    merchant: "Finger Reader Enia",
    location: "Roundtable Hold",
  };
};

const generatedBossMarkerId = (markerId: string): string =>
  markerId.startsWith("boss:") ? `er-boss-${markerId.slice("boss:".length)}` : markerId;

const markerById = new Map(markersByGame["elden-ring"].map((marker) => [marker.id, marker]));

interface AcquisitionRoute {
  kind: AcquisitionRouteKind;
  stage: number;
  effort: number;
  lowFriction: boolean;
}

// Exact labels emitted by the game-data pipelines. Unknown labels fail closed;
// substring and NPC-name matching are deliberately not used for progression.
const REGION_STAGE = new Map<string, number>([
  ["Agheel Lake North", 1],
  ["Limgrave", 1],
  ["Misc. Limgrave", 1],
  ["Stormveil Castle", 1],
  ["Weeping Peninsula", 1],
  ["Ainsel River", 2],
  ["Liurnia", 2],
  ["Liurnia / Caria Manor / Academy", 2],
  ["Siofra River", 2],
  ["Caelid", 3],
  ["Nokron, Eternal City", 3],
  ["Redmane Castle", 3],
  ["Ainsel River, Nokstella", 4],
  ["Altus Plateau", 4],
  ["Capital Outskirts", 4],
  ["Deeproot Depths", 4],
  ["Mt. Gelmir", 4],
  ["Mt. Gelmir / Capital Outskirts / Nokron", 4],
  ["Volcano Manor / Deeproot Depths / Nokstella", 4],
  ["Dragonbarrow", 5],
  ["Dragonbarrow / Ashen Capital", 5],
  ["Lake of Rot", 5],
  ["Leyndell", 5],
  ["Leyndell / SE Caelid", 5],
  ["Mohgwyn Palace", 5],
  ["Moonlight Altar / Leyndell Sewers", 5],
  ["Mountaintops", 6],
  ["Mountaintops of the Giants", 6],
  ["Consecrated Snowfield", 7],
  ["Farum Azula", 7],
  ["Haligtree Roots", 7],
  ["Malenia", 7],
  ["South of Minor Erdtree", 7],
]);

const regionStage = (region: string | undefined): number =>
  region ? REGION_STAGE.get(region) ?? Number.POSITIVE_INFINITY : Number.POSITIVE_INFINITY;

const markerStage = (marker: Marker | undefined): number => {
  if (!marker) return Number.POSITIVE_INFINITY;
  if (marker.layer === "dlc-realm-of-shadow") return 8;
  const sourceRegion = regionStage(directAcquisitionSourceRegion(marker.id));
  if (Number.isFinite(sourceRegion)) return sourceRegion;
  const scaleStage = regionStage(marker.bossMeta?.hpScale?.region);
  return Number.isFinite(scaleStage) ? scaleStage : regionStage(marker.region);
};

const recommendationTargetStage = (
  markerId: string,
  context: RecommendationTargetContext | undefined,
): number => {
  const indexedStage = markerStage(markerById.get(markerId));
  if (Number.isFinite(indexedStage)) return indexedStage;
  if (context?.layer === "dlc-realm-of-shadow") return 8;
  const scaleStage = regionStage(context?.scaleRegion);
  return Number.isFinite(scaleStage) ? scaleStage : regionStage(context?.region);
};

const sourceStage = (source: DirectAcquisitionSource): number =>
  source.layer === "dlc-realm-of-shadow" ? 8 : regionStage(source.region);

const dropChance = (note: string | undefined): number | undefined => {
  if (note === "Guaranteed") return 100;
  const match = note?.match(/([\d.]+)%/);
  if (!match) return undefined;
  const chance = Number(match[1]);
  return Number.isFinite(chance) ? Math.min(100, chance) : undefined;
};

const routeForSource = (source: DirectAcquisitionSource): AcquisitionRoute => {
  if (source.kind === "pickup") {
    return { kind: source.kind, stage: sourceStage(source), effort: 0.04, lowFriction: true };
  }
  if (source.kind === "merchant") {
    return { kind: source.kind, stage: sourceStage(source), effort: 0.08, lowFriction: true };
  }
  const chance = dropChance(source.note);
  const isRegularEnemy = source.kind === "enemy-drop";
  return {
    kind: source.kind,
    stage: sourceStage(source),
    effort: chance == null ? 1 : 0.22 + (1 - chance / 100) * 0.58,
    // Boss gates and sub-50% farms are valid acquisition facts, but not a
    // low-friction recommendation for either advisor mode.
    lowFriction: isRegularEnemy && chance != null && chance >= 50,
  };
};

const directAccessRoutes = (item: ErItem): AcquisitionRoute[] => {
  const routes = itemAcquisitionSources(erItemKey(item)).map(routeForSource);
  const trade = remembranceTradeRoute(item);
  if (trade?.boss) {
    routes.push({
      kind: "remembrance",
      stage: markerStage(markerById.get(generatedBossMarkerId(trade.boss.markerId))),
      effort: 0.65,
      lowFriction: false,
    });
  }

  return routes;
};

const eligibleRoute = (route: AcquisitionRoute, targetStage: number): boolean =>
  route.lowFriction && route.stage <= targetStage;

const easiestEligibleRoute = (
  item: ErItem,
  targetMarkerId: string,
  targetStage: number,
): AcquisitionRoute | undefined => {
  if (!isItemAvailableForFirstClear(item, targetMarkerId)) return undefined;
  return directAccessRoutes(item)
    .filter((route) => eligibleRoute(route, targetStage))
    .sort((left, right) => left.effort - right.effort || left.stage - right.stage)[0];
};

const craftingRoutes = (
  item: ErItem,
  targetMarkerId: string,
  targetStage: number,
): AcquisitionRoute[] => {
  if (!item.crafting?.materials.length) return [];
  const materialRoutes = item.crafting.materials.map((material) => {
    const materialItem = erItemByKey.get(material.item_key ?? `goods:${material.item_id}`);
    return materialItem
      ? easiestEligibleRoute(materialItem, targetMarkerId, targetStage)
      : undefined;
  });
  if (materialRoutes.some((route) => !route)) return [];

  const routes: AcquisitionRoute[] = [];
  for (const recipeBookKey of recipeBookKeysByItemKey.get(erItemKey(item)) ?? []) {
    const recipeBook = erItemByKey.get(recipeBookKey);
    if (!recipeBook) continue;
    const recipeRoute = easiestEligibleRoute(recipeBook, targetMarkerId, targetStage);
    if (!recipeRoute) continue;
    const dependencies = [recipeRoute, ...materialRoutes] as AcquisitionRoute[];
    routes.push({
      kind: "crafting",
      stage: Math.max(...dependencies.map((route) => route.stage)),
      effort: Math.min(1, Math.max(...dependencies.map((route) => route.effort)) + 0.12),
      lowFriction: true,
    });
  }
  return routes;
};

/** Exclude gear whose direct or traded acquisition requires defeating the target boss. */
export const isItemAvailableForFirstClear = (item: ErItem, targetMarkerId: string): boolean => {
  const markerId = generatedBossMarkerId(targetMarkerId);
  if (itemAcquisitionSources(erItemKey(item)).some(
    (source) => generatedBossMarkerId(source.markerId) === markerId,
  )) return false;
  if (itemDropSources(erItemKey(item)).some((source) => source.markerId === markerId)) return false;
  return remembranceTradeRoute(item)?.boss?.markerId !== markerId;
};

/**
 * Default recommendation policy: only use gear with a verified route that is no
 * later than the selected encounter. Unknown, DLC-only and high-friction routes
 * stay out of a base-game first-clear build instead of pretending RL implies access.
 */
export const recommendationItemAccess = (
  item: ErItem,
  targetMarkerId: string,
  targetContext?: RecommendationTargetContext,
): RecommendationItemAccess => {
  const markerId = generatedBossMarkerId(targetMarkerId);
  const targetStage = recommendationTargetStage(markerId, targetContext);
  const cacheKey = `${markerId}|${targetStage}|${erItemKey(item)}`;
  const cached = recommendationAccessCache.get(cacheKey);
  if (cached) return cached;

  if (!isItemAvailableForFirstClear(item, markerId)) {
    const blocked: RecommendationItemAccess = { available: false, effort: 1 };
    recommendationAccessCache.set(cacheKey, blocked);
    return blocked;
  }

  if (!Number.isFinite(targetStage)) {
    const unresolved: RecommendationItemAccess = { available: false, effort: 1 };
    recommendationAccessCache.set(cacheKey, unresolved);
    return unresolved;
  }
  const routes = [...directAccessRoutes(item), ...craftingRoutes(item, markerId, targetStage)];

  const route = routes
    .filter((candidate) => eligibleRoute(candidate, targetStage))
    .sort((a, b) => a.effort - b.effort || a.stage - b.stage)[0];
  const result: RecommendationItemAccess = route
    ? { available: true, effort: route.effort, routeKind: route.kind }
    : { available: false, effort: 1 };
  recommendationAccessCache.set(cacheKey, result);
  return result;
};
