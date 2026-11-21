import type { GeneratedLocationMarker } from './valheim/location-generator.ts'
import type { LocationRecord } from '../types/game-data.ts'
import { getLocationFilterKeys, LOCATION_FILTER_GROUPS, filterGroupCountKey } from './location-filters.ts'

export interface WorldMarkerProgress {
  found: string[]
  favorites: string[]
}

export const EMPTY_MARKER_PROGRESS: WorldMarkerProgress = { found: [], favorites: [] }

// Save and observed marker IDs depend on array order. Identify the actual spot
// instead, so refreshing a save or discovering another location retains progress.
export function locationProgressId(marker: Pick<GeneratedLocationMarker, 'prefabName' | 'x' | 'y'>): string {
  return `location:${marker.prefabName.toLowerCase()}:${marker.x.toFixed(1)}:${marker.y.toFixed(1)}`
}

export function isProgressMarkerVisible(id: string, found: ReadonlySet<string>, favorites: ReadonlySet<string>, hideFound: boolean, hideFavorites: boolean): boolean {
  return (!hideFound || !found.has(id)) && (!hideFavorites || !favorites.has(id))
}

/** Count each physical location once per matching group, even with several enemy families. */
export function countLocationProgress(markers: readonly GeneratedLocationMarker[], locations: readonly LocationRecord[], found: ReadonlySet<string>, includeCatalogFallback = false) {
  const totals = new Map<string, number>()
  const completed = new Map<string, number>()
  const byId = new Map(locations.map(location => [location.id, location]))
  const count = (location: LocationRecord, done: boolean) => {
    const keys = getLocationFilterKeys(location)
    for (const group of LOCATION_FILTER_GROUPS) {
      if (group.filters.some(filter => keys.has(filter.key))) keys.add(filterGroupCountKey(group.key))
    }
    for (const key of keys) {
      totals.set(key, (totals.get(key) ?? 0) + 1)
      if (done) completed.set(key, (completed.get(key) ?? 0) + 1)
    }
  }
  for (const marker of markers) {
    const location = byId.get(marker.locationId)
    if (location) count(location, found.has(locationProgressId(marker)))
  }
  if (markers.length === 0 && includeCatalogFallback) {
    for (const location of locations) if (location.enabled) count(location, false)
  }
  return { totals, completed }
}
