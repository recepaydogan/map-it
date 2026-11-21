import { filterExploredPoints, type ExplorationRestriction } from './explored-map.ts'
import type { ResourceNodePoint, ResourceStateIndex } from './resource-state.ts'

/** Search, counts, nearest-source navigation and planner links use the same view. */
export function exploredResourceIndex(source: ResourceStateIndex | null, map: ExplorationRestriction): ResourceStateIndex | null {
  if (!source || map === undefined) return source
  const cache = new Map<string, ResourceNodePoint[]>()
  const nodesForItem = (item: string) => {
    const key = item.toLowerCase()
    let result = cache.get(key)
    if (!result) { result = filterExploredPoints(source.nodesForItem(item), map); cache.set(key, result) }
    return result
  }
  const nearest = (item: string, x: number, z: number, respawning: boolean) => {
    let best: { point: ResourceNodePoint; distance: number } | null = null
    for (const point of nodesForItem(item)) {
      if (respawning ? point.status !== 'respawning' : point.status !== 'present' && point.status !== 'partial') continue
      const distance = Math.hypot(point.x - x, point.z - z)
      if (!best || distance < best.distance) best = { point, distance }
    }
    return best
  }
  return {
    ...source,
    nodesForItem,
    availableMaterials: () => source.availableMaterials().map(entry => ({
      itemPrefab: entry.itemPrefab,
      count: nodesForItem(entry.itemPrefab).filter(point => point.status === 'present' || point.status === 'partial').length,
    })).filter(entry => entry.count > 0),
    pointsForMaterials: items => filterExploredPoints(source.pointsForMaterials(items), map),
    nearestForItem: (item, x, z) => nearest(item, x, z, false),
    nearestRespawningForItem: (item, x, z) => nearest(item, x, z, true),
    hasNodesForItem: item => nodesForItem(item).length > 0,
  }
}
