import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { EMPTY_MARKER_PROGRESS, type WorldMarkerProgress } from '../lib/marker-progress.ts'

interface MarkerProgressState {
  worlds: Record<string, WorldMarkerProgress>
  hideFound: boolean
  hideFavorites: boolean
  toggleFound: (worldKey: string, id: string) => void
  toggleFavorite: (worldKey: string, id: string) => void
  setHideFound: (hide: boolean) => void
  setHideFavorites: (hide: boolean) => void
}

const STORAGE_KEY = 'valheim-companion:marker-progress'
const toggle = (ids: string[], id: string) => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]

export const useMarkerProgressStore = create<MarkerProgressState>()(persist((set) => ({
  worlds: {},
  hideFound: false,
  hideFavorites: false,
  toggleFound: (worldKey, id) => set(state => {
    const world = state.worlds[worldKey] ?? EMPTY_MARKER_PROGRESS
    return { worlds: { ...state.worlds, [worldKey]: { ...world, found: toggle(world.found, id) } } }
  }),
  toggleFavorite: (worldKey, id) => set(state => {
    const world = state.worlds[worldKey] ?? EMPTY_MARKER_PROGRESS
    return { worlds: { ...state.worlds, [worldKey]: { ...world, favorites: toggle(world.favorites, id) } } }
  }),
  setHideFound: hideFound => set({ hideFound }),
  setHideFavorites: hideFavorites => set({ hideFavorites }),
}), {
  name: STORAGE_KEY,
  partialize: state => ({ worlds: state.worlds, hideFound: state.hideFound, hideFavorites: state.hideFavorites }),
}))

// Desktop and overlay are separate Overwolf windows sharing localStorage.
if (typeof window !== 'undefined') {
  const refresh = () => { void useMarkerProgressStore.persist.rehydrate() }
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) refresh() })
  window.addEventListener('focus', refresh)
}
