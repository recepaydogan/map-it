import type { ResourceStateIndex } from '../../lib/valheim/resource-state.ts'
import type { AcquisitionSource } from '../../lib/crafting/resolve-acquisition-sources.ts'

export type CompassDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

/**
 * The one-line "where do I get this" answer under a material row, in order of
 * how sure the app is:
 *
 * - `confirmed`  – a standing node in the save; it is really there.
 * - `respawning` – every nearby node is picked, the closest respawn is timed.
 * - `location`   – a generated location type contains it (instance not checked).
 * - `creature` / `boss` / `trader` / `fishing` – actor-based sources.
 * - `craftOnly`  – only craftable; the ingredient rows carry the real hints.
 * - `unknown`    – the extracted data has no source.
 */
export type MaterialHint =
  | {
      kind: 'confirmed'
      point: { x: number; z: number }
      distance: number
      direction: CompassDirection
      /** Standing node prefab at that spot, so the row can say what to do there. */
      nodePrefab: string
    }
  | { kind: 'respawning'; minutes: number; point: { x: number; z: number }; nodePrefab: string }
  | { kind: 'location'; name: string; locationPrefab: string }
  | { kind: 'creature' | 'boss'; name: string; mappable: boolean }
  | { kind: 'trader'; name: string }
  | { kind: 'fishing' }
  | { kind: 'craftOnly' }
  | { kind: 'unknown' }

export const compassDirection = (dx: number, dz: number): CompassDirection => {
  // North is +z on the Valheim map. atan2 over (east, north) walks clockwise
  // from north in 45-degree sectors.
  const angle = (Math.atan2(dx, dz) * 180) / Math.PI
  const sector = Math.round(((angle + 360) % 360) / 45) % 8
  return (['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const)[sector]
}

export function resolveMaterialHint(
  prefabName: string,
  sources: AcquisitionSource[],
  resourceIndex: ResourceStateIndex | null,
  from: { x: number; z: number },
): MaterialHint {
  if (resourceIndex?.hasNodesForItem(prefabName)) {
    const nearest = resourceIndex.nearestForItem(prefabName, from.x, from.z)
    if (nearest) {
      return {
        kind: 'confirmed',
        point: { x: nearest.point.x, z: nearest.point.z },
        distance: nearest.distance,
        direction: compassDirection(nearest.point.x - from.x, nearest.point.z - from.z),
        nodePrefab: nearest.point.nodePrefab,
      }
    }
    const respawning = resourceIndex.nearestRespawningForItem(prefabName, from.x, from.z)
    if (respawning) {
      return {
        kind: 'respawning',
        minutes: Math.max(1, Math.ceil(respawning.point.respawnRemainingGameMinutes ?? 0)),
        point: { x: respawning.point.x, z: respawning.point.z },
        nodePrefab: respawning.point.nodePrefab,
      }
    }
  }

  const collectable = sources.find((source) =>
    source.kind !== 'craft' && source.kind !== 'conversion' && source.kind !== 'build')
  if (collectable) {
    if (collectable.kind === 'locationPickable' || collectable.kind === 'locationDestructible') {
      return {
        kind: 'location',
        name: collectable.name,
        locationPrefab: collectable.prefabName,
      }
    }
    if (collectable.kind === 'creature' || collectable.kind === 'boss') {
      return {
        kind: collectable.kind,
        name: collectable.name,
        mappable: (collectable.locationPrefabs?.length ?? 0) > 0,
      }
    }
    if (collectable.kind === 'trader') return { kind: 'trader', name: collectable.name }
    return { kind: 'fishing' }
  }

  if (sources.length > 0) return { kind: 'craftOnly' }
  return { kind: 'unknown' }
}

export const formatDistanceParts = (
  distance: number,
): { key: 'meters' | 'kilometers'; count: number } =>
  distance < 1_000
    ? { key: 'meters', count: Math.max(1, Math.round(distance)) }
    : { key: 'kilometers', count: Math.round(distance / 100) / 10 }
