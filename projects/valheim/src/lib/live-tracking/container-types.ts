/**
 * Contract for `player-containers.json`, written by the tracking mod under the
 * same consent as the character inventory. The mod reports every player-built
 * container it has seen this session (loaded or remembered), never loot chests.
 */
export const CONTAINERS_PAYLOAD_VERSION = 1

/** Mod heartbeats every 15 s; older than this and the live view is stale. */
export const CONTAINERS_FRESHNESS_MS = 45_000

export type ContainerOwner = 'own' | 'other'

export interface LiveContainerItem {
  prefab: string
  amount: number
  quality: number
}

export interface LiveContainer {
  /** ZDO id, stable for the life of the placed piece. */
  id: string
  prefab: string
  /** Container display token, e.g. `$piece_chest_wood`. */
  name: string
  owner: ContainerOwner
  creator: string
  x: number
  y: number
  z: number
  private: boolean
  /** True when the container's zone was loaded at snapshot time. */
  loaded: boolean
  items: LiveContainerItem[]
}

export interface LiveContainersSnapshot {
  payloadVersion: number
  sharing: boolean
  updatedAt: number
  worldName: string
  worldUid: string
  seedName: string
  characterId: string
  containers: LiveContainer[]
  /** Containers seen earlier this session that were then found destroyed. */
  removed: string[]
}

export interface ContainerSourceSelection {
  ownContainers: boolean
  friendContainers: boolean
}

/** A remembered container plus when the app last saw it in a snapshot. */
export interface RememberedContainer extends LiveContainer {
  lastSeenAt: number
}
