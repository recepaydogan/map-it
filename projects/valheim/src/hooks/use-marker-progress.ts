import { useMemo } from 'react'
import { useMarkerProgressStore } from '../store/marker-progress-store'
import { EMPTY_MARKER_PROGRESS } from '../lib/marker-progress'

export function useMarkerProgress(worldKey: string) {
  const world = useMarkerProgressStore(state => state.worlds[worldKey] ?? EMPTY_MARKER_PROGRESS)
  const found = useMemo(() => new Set(world.found), [world.found])
  const favorites = useMemo(() => new Set(world.favorites), [world.favorites])
  const hideFound = useMarkerProgressStore(state => state.hideFound)
  const hideFavorites = useMarkerProgressStore(state => state.hideFavorites)
  return { found, favorites, hideFound, hideFavorites }
}
