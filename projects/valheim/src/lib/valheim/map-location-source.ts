import type { GeneratedLocationMarker } from './location-generator.ts'
import type { ValheimWorldSave } from '../../types/world-save.ts'
import { isMapPointExplored, type ExploredMap } from './explored-map.ts'

/** Saved locations inside this character's personal explored map. */
export function exploredLocationMarkers(
  markers: GeneratedLocationMarker[],
  exploration: ExploredMap | null,
): GeneratedLocationMarker[] {
  return markers.filter(marker => isMapPointExplored(exploration, marker.x, marker.y))
}

/** Live client identity wins over a matching local copy of a remote world. */
export function mapLocationVisibility(
  world: Pick<ValheimWorldSave, 'source' | 'databasePath'> | null,
  isServer: boolean | undefined,
  showSpoilers: boolean,
) {
  const canToggleSpoilers = world !== null && isServer !== false
    && (world.source !== 'remembered' || isServer === true)
  return {
    canToggleSpoilers,
    observedOnly: world?.databasePath === null || isServer === false
      || (canToggleSpoilers && !showSpoilers),
  }
}

/** Keep observations visible while a newly committed save is being read. */
export function locationsFromSaveOrObservations(
  saved: GeneratedLocationMarker[],
  observed: GeneratedLocationMarker[],
): GeneratedLocationMarker[] {
  if (saved.length === 0) return observed
  if (observed.length === 0) return saved

  const savedZones = new Set(saved.map((marker) => `${marker.locationId}:${marker.zoneX}:${marker.zoneY}`))
  const missingObservations = observed.filter((marker) =>
    !savedZones.has(`${marker.locationId}:${marker.zoneX}:${marker.zoneY}`))
  return missingObservations.length === 0 ? saved : [...saved, ...missingObservations]
}
