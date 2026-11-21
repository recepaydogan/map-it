import type { CharacterMapPin } from '../valheim/character-save-format.ts'
import { PLAYER_VISIBLE_PIN_TYPES } from '../valheim/character-save-format.ts'
import type { GeneratedLocationMarker } from '../valheim/location-generator.ts'
import { getStableHashCode } from '../valheim/stable-hash.ts'
import type { LocationRecord } from '../../types/game-data.ts'

export interface ClientLocation {
  kind: 'loaded-proxy' | 'known-icon'
  prefabHash?: number
  prefabName?: string
  x: number
  z: number
  height: number
}
export interface ClientLocationsSnapshot {
  payloadVersion: 1
  source: 'client-observation'
  worldUid: string
  worldName: string
  seedName: string
  characterName: string
  isServer: boolean
  updatedAt: number
  locations: ClientLocation[]
  pins: CharacterMapPin[]
}
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null
const position = (value: Record<string, unknown>) => [value.x, value.z, value.height].every(v => typeof v === 'number' && Number.isFinite(v))
export function parseClientLocations(raw: string | null): ClientLocationsSnapshot | null {
  try {
    const value: unknown = JSON.parse(raw ?? '')
    if (!object(value) || value.payloadVersion !== 1 || value.source !== 'client-observation'
      || typeof value.worldUid !== 'string' || !/^-?\d+$/.test(value.worldUid) || value.worldUid === '0'
      || typeof value.worldName !== 'string' || !value.worldName.trim()
      || typeof value.seedName !== 'string' || !value.seedName.trim()
      || typeof value.characterName !== 'string' || typeof value.isServer !== 'boolean'
      || typeof value.updatedAt !== 'number' || !Number.isFinite(value.updatedAt)
      || !Array.isArray(value.locations) || value.locations.length > 1024
      || !Array.isArray(value.pins) || value.pins.length > 4096) return null
    if (!value.locations.every(entry => object(entry) && position(entry) && (
      entry.kind === 'loaded-proxy' && Number.isInteger(entry.prefabHash) && entry.prefabHash !== 0
      || entry.kind === 'known-icon' && typeof entry.prefabName === 'string' && Boolean(entry.prefabName)))) return null
    const pins = value.pins.filter(pin => object(pin) && position(pin)
      && typeof pin.name === 'string' && !pin.name.startsWith('__vc_server_probe__:')
      && typeof pin.type === 'string' && PLAYER_VISIBLE_PIN_TYPES.has(pin.type as CharacterMapPin['type'])
      && typeof pin.checked === 'boolean' && typeof pin.ownerId === 'string') as CharacterMapPin[]
    return { ...value, pins } as unknown as ClientLocationsSnapshot
  } catch { return null }
}

export const clientLocationKey = (location: ClientLocation) =>
  `${location.prefabHash ?? getStableHashCode(location.prefabName ?? '')}:${location.x}:${location.z}`

/** Map only identified observations; never relocate a generated/guessed marker. */
export function createClientLocationMarkers(observations: ClientLocation[], catalog: LocationRecord[]): GeneratedLocationMarker[] {
  const byHash = new Map<number, LocationRecord | null>()
  const byName = new Map(catalog.map(location => [location.prefabName, location]))
  for (const location of catalog) {
    const hash = getStableHashCode(location.prefabName)
    const previous = byHash.get(hash)
    // A hash collision cannot establish which prefab was observed.
    byHash.set(hash, previous === null || previous && previous.prefabName !== location.prefabName ? null : location)
  }
  const markers = new Map<string, GeneratedLocationMarker>()
  for (const observation of observations) {
    const location = observation.kind === 'known-icon'
      ? byName.get(observation.prefabName ?? '') : byHash.get(observation.prefabHash ?? 0)
    if (!location) continue
    const id = `client-${clientLocationKey(observation)}`
    if (markers.has(id) && observation.kind === 'known-icon') continue
    markers.set(id, { id, locationId: location.id, prefabName: location.prefabName,
      x: observation.x, y: observation.z, height: observation.height,
      zoneX: Math.floor((observation.x + 32) / 64), zoneY: Math.floor((observation.z + 32) / 64),
      source: 'observed', placed: observation.kind === 'loaded-proxy' })
  }
  return [...markers.values()]
}

export function mergeClientPins(saved: CharacterMapPin[], live: ClientLocationsSnapshot | null, selectedCharacterName?: string | null): CharacterMapPin[] {
  // Live pins are the active character's current list, including deletions.
  return live && (!selectedCharacterName || selectedCharacterName.toLowerCase() === live.characterName.toLowerCase()) ? live.pins : saved
}
