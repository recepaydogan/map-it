export const NEARBY_CREATURES_PAYLOAD_VERSION = 1
/** Temporary kill switch: keep the feature code, but do no game-file polling. */
export const NEARBY_CREATURE_TRACKING_ENABLED = false
// Snapshots refresh every three minutes. Tolerate two missed refresh windows so
// a slow save/load or atomic file swap never makes every marker blink away.
export const NEARBY_CREATURES_FRESHNESS_MS = 7 * 60_000

export interface NearbyCreature {
  id: string
  prefab: string
  name: string
  x: number
  y: number
  z: number
  level: number
  tamed: boolean
}

export interface NearbyCreaturesSnapshot {
  payloadVersion: number
  updatedAt: number
  worldName: string
  worldUid: string
  seedName: string
  radius: number
  creatures: NearbyCreature[]
}
