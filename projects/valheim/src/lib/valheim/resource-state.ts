import { getStableHashCode } from './stable-hash.ts'
import { GAME_TICKS_PER_SECOND } from './world-save-format.ts'
import type { SaveResourceState } from '../../types/world-save.ts'

/**
 * Loot state of one harvestable world object, derived from its save ZDO.
 *
 * - `present`   – the object stands untouched (or its respawn timer elapsed).
 * - `partial`   – a deposit that has been mined but still holds ore.
 * - `respawning`– picked, and the respawn timer is still running.
 * - `depleted`  – picked for good; nothing to collect here.
 * - `disabled`  – the game turned the object off; not collectable.
 *
 * Objects whose harvest destroys the ZDO (trees, most deposits) never show up
 * as `depleted`; their absence inside a generated zone is the depletion signal,
 * which `zoneGenerated` lets callers test.
 */
export type ResourceNodeStatus = 'present' | 'partial' | 'respawning' | 'depleted' | 'disabled'

export interface CatalogResourceNodeItem {
  prefabName: string
  amountMin: number
  amountMax: number
  chance: number
}

export interface CatalogResourceNode {
  prefabName: string
  kind: string
  respawnTimeMinutes: number
  hideWhenPicked: boolean
  minToolTier?: number
  items: CatalogResourceNodeItem[]
}

export interface ResourceNodePoint {
  nodePrefab: string
  x: number
  z: number
  status: ResourceNodeStatus
  /** Game minutes until a respawning node comes back; null otherwise. */
  respawnRemainingGameMinutes: number | null
}

export interface NearestResourceNode {
  point: ResourceNodePoint
  distance: number
}

export interface ResourceStateIndex {
  /** Game clock of the save, in .NET ticks. */
  worldTimeTicks: number
  /** Total resource-node ZDOs retained from the save. */
  nodeCount: number
  /** Whether the zone containing this world position has been generated. */
  zoneGenerated(worldX: number, worldZ: number): boolean
  /** Every retained node that can yield the item, with its computed status. */
  nodesForItem(itemPrefab: string): ResourceNodePoint[]
  /** Materials with collectable source nodes in the selected world save. */
  availableMaterials(): Array<{ itemPrefab: string; count: number }>
  /** Unique collectable save positions for one or more selected materials. */
  pointsForMaterials(itemPrefabs: readonly string[]): ResourceNodePoint[]
  /** Nearest collectable (present or partial) node yielding the item. */
  nearestForItem(itemPrefab: string, fromX: number, fromZ: number): NearestResourceNode | null
  /** Nearest respawning node yielding the item, for a "come back later" hint. */
  nearestRespawningForItem(
    itemPrefab: string,
    fromX: number,
    fromZ: number,
  ): NearestResourceNode | null
  /** True when the catalog knows world objects that yield this item. */
  hasNodesForItem(itemPrefab: string): boolean
}

const ZONE_SIZE = 64
const TICKS_PER_GAME_MINUTE = 60 * GAME_TICKS_PER_SECOND

/** ZoneSystem.GetZone: zone = floor((coordinate + zoneSize/2) / zoneSize). */
export const worldToZone = (coordinate: number): number =>
  Math.floor((coordinate + ZONE_SIZE / 2) / ZONE_SIZE)

const zoneKey = (zoneX: number, zoneY: number): number =>
  (zoneX + 32_768) * 65_536 + (zoneY + 32_768)

const COLLECTABLE: ReadonlySet<ResourceNodeStatus> = new Set(['present', 'partial'])

interface NodePrefabInfo {
  catalog: CatalogResourceNode
  indices: number[]
}

export function buildResourceStateIndex(
  state: SaveResourceState,
  catalogNodes: Record<string, CatalogResourceNode>,
  itemNodes: Record<string, string[]>,
): ResourceStateIndex {
  const generatedZones = new Set<number>()
  for (let index = 0; index + 1 < state.generatedZones.length; index += 2) {
    generatedZones.add(zoneKey(state.generatedZones[index], state.generatedZones[index + 1]))
  }

  const infoByHash = new Map<number, NodePrefabInfo>()
  const infoByPrefabKey = new Map<string, NodePrefabInfo>()
  for (const [key, catalog] of Object.entries(catalogNodes)) {
    const info: NodePrefabInfo = { catalog, indices: [] }
    infoByHash.set(getStableHashCode(catalog.prefabName), info)
    infoByPrefabKey.set(key, info)
  }

  const { nodes } = state
  for (let index = 0; index < nodes.count; index += 1) {
    infoByHash.get(nodes.prefabHashes[index])?.indices.push(index)
  }

  const infosForItem = (itemPrefab: string): NodePrefabInfo[] => {
    const nodePrefabs = itemNodes[itemPrefab.toLowerCase()] ?? []
    const result: NodePrefabInfo[] = []
    for (const nodePrefab of nodePrefabs) {
      const info = infoByPrefabKey.get(nodePrefab.toLowerCase())
      if (info) result.push(info)
    }
    return result
  }

  const statusOf = (
    info: NodePrefabInfo,
    index: number,
  ): { status: ResourceNodeStatus; respawnRemainingGameMinutes: number | null } => {
    if (nodes.disabled[index]) return { status: 'disabled', respawnRemainingGameMinutes: null }
    if (nodes.picked[index]) {
      const respawnMinutes = info.catalog.respawnTimeMinutes
      if (respawnMinutes <= 0) return { status: 'depleted', respawnRemainingGameMinutes: null }
      // picked_time can still be zero right after picking, before the game's
      // respawn updater stamps it; treat that as freshly picked.
      const pickedTicks = nodes.pickedTimeTicks[index]
      const elapsedMinutes = pickedTicks > 0
        ? (state.worldTimeTicks - pickedTicks) / TICKS_PER_GAME_MINUTE
        : 0
      if (elapsedMinutes > respawnMinutes) {
        return { status: 'present', respawnRemainingGameMinutes: null }
      }
      return {
        status: 'respawning',
        respawnRemainingGameMinutes: Math.max(0, respawnMinutes - elapsedMinutes),
      }
    }
    if (nodes.damaged[index] && info.catalog.kind === 'mine-rock') {
      return { status: 'partial', respawnRemainingGameMinutes: null }
    }
    return { status: 'present', respawnRemainingGameMinutes: null }
  }

  const pointAt = (info: NodePrefabInfo, index: number): ResourceNodePoint => {
    const { status, respawnRemainingGameMinutes } = statusOf(info, index)
    return {
      nodePrefab: info.catalog.prefabName,
      x: nodes.x[index],
      z: nodes.z[index],
      status,
      respawnRemainingGameMinutes,
    }
  }

  const nearestWhere = (
    itemPrefab: string,
    fromX: number,
    fromZ: number,
    accept: (status: ResourceNodeStatus) => boolean,
  ): NearestResourceNode | null => {
    let bestInfo: NodePrefabInfo | null = null
    let bestIndex = -1
    let bestDistanceSq = Infinity
    for (const info of infosForItem(itemPrefab)) {
      for (const index of info.indices) {
        const dx = nodes.x[index] - fromX
        const dz = nodes.z[index] - fromZ
        const distanceSq = dx * dx + dz * dz
        if (distanceSq >= bestDistanceSq) continue
        if (!accept(statusOf(info, index).status)) continue
        bestInfo = info
        bestIndex = index
        bestDistanceSq = distanceSq
      }
    }
    if (!bestInfo) return null
    return { point: pointAt(bestInfo, bestIndex), distance: Math.sqrt(bestDistanceSq) }
  }

  return {
    worldTimeTicks: state.worldTimeTicks,
    nodeCount: nodes.count,
    zoneGenerated: (worldX, worldZ) =>
      generatedZones.has(zoneKey(worldToZone(worldX), worldToZone(worldZ))),
    nodesForItem: (itemPrefab) => {
      const result: ResourceNodePoint[] = []
      for (const info of infosForItem(itemPrefab)) {
        for (const index of info.indices) result.push(pointAt(info, index))
      }
      return result
    },
    availableMaterials: () => {
      const countsByNode = new Map<NodePrefabInfo, number>()
      for (const info of infoByPrefabKey.values()) {
        countsByNode.set(info, info.indices.filter((index) => COLLECTABLE.has(statusOf(info, index).status)).length)
      }
      return Object.entries(itemNodes).map(([itemPrefab, nodePrefabs]) => ({
        itemPrefab,
        count: [...new Set(nodePrefabs.map((name) => name.toLowerCase()))]
          .reduce((count, name) => {
            const info = infoByPrefabKey.get(name)
            return count + (info ? countsByNode.get(info) ?? 0 : 0)
          }, 0),
      })).filter((entry) => entry.count > 0)
    },
    pointsForMaterials: (itemPrefabs) => {
      const selectedNodes = new Set<NodePrefabInfo>()
      for (const itemPrefab of itemPrefabs) {
        for (const info of infosForItem(itemPrefab)) selectedNodes.add(info)
      }
      const result: ResourceNodePoint[] = []
      for (const info of selectedNodes) {
        for (const index of info.indices) {
          if (COLLECTABLE.has(statusOf(info, index).status)) result.push(pointAt(info, index))
        }
      }
      return result
    },
    nearestForItem: (itemPrefab, fromX, fromZ) =>
      nearestWhere(itemPrefab, fromX, fromZ, (status) => COLLECTABLE.has(status)),
    nearestRespawningForItem: (itemPrefab, fromX, fromZ) =>
      nearestWhere(itemPrefab, fromX, fromZ, (status) => status === 'respawning'),
    hasNodesForItem: (itemPrefab) => infosForItem(itemPrefab).length > 0,
  }
}
