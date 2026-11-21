import type { LocationRecord } from '../../types/game-data.ts'
import type { SavedLocation } from '../../types/world-save.ts'
import type { GeneratedLocationMarker } from './location-generator.ts'

export function createSaveLocationMarkers(
  savedLocations: SavedLocation[],
  locations: LocationRecord[],
): GeneratedLocationMarker[] {
  const locationByPrefab = new Map(
    locations.map((location) => [location.prefabName.toLowerCase(), location]),
  )

  return savedLocations.flatMap((savedLocation, index) => {
    const location = locationByPrefab.get(savedLocation.prefabName.toLowerCase())
    if (!location) return []
    return [{
      id: `save-${location.id}-${index}`,
      locationId: location.id,
      prefabName: savedLocation.prefabName,
      x: savedLocation.x,
      y: savedLocation.y,
      height: savedLocation.height,
      zoneX: Math.floor((savedLocation.x + 32) / 64),
      zoneY: Math.floor((savedLocation.y + 32) / 64),
      source: 'save' as const,
      placed: savedLocation.placed,
    }]
  })
}
