import type { MarkerIntelligence } from '../../types/marker-intelligence.ts'
import { prefabKey, recipesFor, stationName } from './build-recipe-graph.ts'
import type { RecipeGraph } from './recipe-types.ts'

export type AcquisitionCertainty =
  /** Always produced or always dropped. */
  | 'guaranteed'
  /** Random loot with a published chance. */
  | 'chance'
  /** Present in the prefab, but the world instance may already be looted. */
  | 'possible'
  /** No source could be resolved from the extracted game data. */
  | 'unknown'

export type AcquisitionKind =
  | 'craft'
  | 'conversion'
  | 'build'
  | 'creature'
  | 'boss'
  | 'locationPickable'
  | 'locationDestructible'
  | 'trader'
  | 'fishing'

export interface AcquisitionSource {
  id: string
  kind: AcquisitionKind
  certainty: AcquisitionCertainty
  /** Already localized for creatures, traders, and stations. */
  name: string
  /** Raw prefab so the map handoff and location formatter can resolve it. */
  prefabName: string
  chance?: number
  amountMin?: number
  amountMax?: number
  onePerPlayer?: boolean
  outputAmount?: number
  inputSummary?: Array<{ prefabName: string; amount: number }>
  price?: number
  stack?: number
  requiredGlobalKey?: string
  /** Instances of this source inside one generated location. */
  count?: number
  /** Locations where a creature source is known to spawn. */
  locationPrefabs?: string[]
}

export interface AcquisitionResult {
  prefabName: string
  sources: AcquisitionSource[]
  hasKnownSource: boolean
}

const certaintyRank: Record<AcquisitionCertainty, number> = {
  guaranteed: 0,
  chance: 1,
  possible: 2,
  unknown: 3,
}

const kindRank: Record<AcquisitionKind, number> = {
  craft: 0,
  conversion: 1,
  creature: 2,
  boss: 3,
  locationPickable: 4,
  locationDestructible: 5,
  trader: 6,
  fishing: 7,
  build: 8,
}

/**
 * Turns one material into every way the extracted game data says it can be
 * obtained. Probabilistic loot keeps its chance so the UI never presents random
 * drops as guaranteed.
 */
export function resolveAcquisitionSources(
  graph: RecipeGraph,
  intelligence: Pick<MarkerIntelligence, 'items' | 'traders'>,
  prefabName: string,
): AcquisitionResult {
  const key = prefabKey(prefabName)
  const item = intelligence.items[key] ?? null
  const sources: AcquisitionSource[] = []

  for (const recipe of recipesFor(graph, prefabName)) {
    sources.push({
      id: recipe.id,
      kind: recipe.kind === 'piece' ? 'build' : recipe.kind === 'conversion' ? 'conversion' : 'craft',
      certainty: 'guaranteed',
      name: recipe.stationPrefab ? stationName(graph, recipe.stationPrefab) : '',
      prefabName: recipe.stationPrefab,
      outputAmount: recipe.outputAmount,
      inputSummary: recipe.resources.map((resource) => ({
        prefabName: resource.prefabName,
        amount: resource.amount,
      })),
    })
  }

  for (const drop of item?.dropSources ?? []) {
    sources.push({
      id: `drop:${drop.prefabName}`,
      kind: drop.boss ? 'boss' : 'creature',
      certainty: drop.chance >= 1 ? 'guaranteed' : 'chance',
      name: drop.name,
      prefabName: drop.prefabName,
      chance: drop.chance,
      amountMin: drop.amountMin,
      amountMax: drop.amountMax,
      onePerPlayer: drop.onePerPlayer,
      locationPrefabs: (graph.creatureLocations.get(prefabKey(drop.prefabName)) ?? [])
        .map((entry) => entry.locationPrefab),
    })
  }

  for (const location of graph.itemLocations.get(key) ?? []) {
    sources.push({
      id: `location:${location.kind}:${location.locationPrefab}`,
      kind: location.kind === 'pickable' ? 'locationPickable' : 'locationDestructible',
      // A generated location contains the object, but the world instance may
      // already have been picked or destroyed by the player.
      certainty: location.chance >= 1 ? 'possible' : 'chance',
      name: location.locationPrefab,
      prefabName: location.locationPrefab,
      chance: location.chance,
      count: location.count,
    })
  }

  for (const trader of Object.values(intelligence.traders ?? {})) {
    for (const traded of trader.items) {
      if (prefabKey(traded.prefabName) !== key) continue
      sources.push({
        id: `trader:${trader.prefabName}:${traded.prefabName}`,
        kind: 'trader',
        certainty: 'guaranteed',
        name: trader.name,
        prefabName: trader.prefabName,
        price: traded.price,
        stack: traded.stack,
        requiredGlobalKey: traded.requiredGlobalKey || undefined,
      })
    }
  }

  // Fish are pulled out of the water, never found lying in the world. Cooking
  // recipes do not answer "where do I get the raw fish", so the hint is added
  // whenever nothing but a recipe was resolved.
  const hasCollectableSource = sources.some((source) =>
    source.kind !== 'craft' && source.kind !== 'conversion' && source.kind !== 'build')
  if (item?.type === 'fish' && !hasCollectableSource) {
    sources.push({
      id: `fishing:${key}`,
      kind: 'fishing',
      certainty: 'chance',
      name: '',
      prefabName: item.prefabName,
    })
  }

  sources.sort((first, second) =>
    certaintyRank[first.certainty] - certaintyRank[second.certainty] ||
    kindRank[first.kind] - kindRank[second.kind] ||
    (second.count ?? 0) - (first.count ?? 0) ||
    first.id.localeCompare(second.id))

  return {
    prefabName: item?.prefabName ?? prefabName,
    sources,
    hasKnownSource: sources.length > 0,
  }
}

export interface PlannerMapSourceSelection {
  materialPrefabs: string[]
  locationPrefabs: string[]
  characterPrefabs: string[]
}

/**
 * Builds the temporary map filter payload for "show sources on map". Only
 * location-anchored sources can be drawn; creature drops contribute the
 * locations where those creatures are known to spawn.
 */
export function collectMapSources(
  graph: RecipeGraph,
  intelligence: Pick<MarkerIntelligence, 'items' | 'traders'>,
  materialPrefabs: string[],
): PlannerMapSourceSelection {
  const locationPrefabs = new Set<string>()
  const characterPrefabs = new Set<string>()
  const resolved: string[] = []

  for (const prefabName of materialPrefabs) {
    const result = resolveAcquisitionSources(graph, intelligence, prefabName)
    resolved.push(result.prefabName)
    for (const source of result.sources) {
      if (source.kind === 'locationPickable' || source.kind === 'locationDestructible') {
        locationPrefabs.add(source.prefabName)
      }
      if (source.kind === 'creature' || source.kind === 'boss') {
        characterPrefabs.add(source.prefabName)
        for (const location of source.locationPrefabs ?? []) locationPrefabs.add(location)
      }
    }
  }

  return {
    materialPrefabs: resolved,
    locationPrefabs: [...locationPrefabs].sort(),
    characterPrefabs: [...characterPrefabs].sort(),
  }
}
