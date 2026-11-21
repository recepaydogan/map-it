import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_ACTIVE_FILTER_KEYS } from '../lib/location-filters'
import { PLAYER_VISIBLE_PIN_TYPES } from '../lib/valheim/character-save-format'
import { normalizeResourceSelection } from '../lib/valheim/resource-selection'
import { ALL_BIOME_KEYS } from '../lib/valheim/marker-biome-filter'
import { resolveMapSpoilerMode, type MapSpoilerMode } from '../lib/valheim/map-spoiler-mode'

/** First-run view shows only the player's house pins; everything else is opt-in. */
const DEFAULT_HIDDEN_PIN_TYPES: string[] = [...PLAYER_VISIBLE_PIN_TYPES].filter((type) => type !== 'icon1')

type FilterKeysUpdater = string[] | ((current: string[]) => string[])

interface MapFilterState {
  spoilerMode: MapSpoilerMode
  setSpoilerMode: (next: MapSpoilerMode) => void
  /** Local worlds may reveal every saved location; remote observations stay limited. */
  showSpoilers: boolean
  setShowSpoilers: (next: boolean) => void
  activeFilterKeys: string[]
  setActiveFilterKeys: (next: FilterKeysUpdater) => void
  /** Selected biomes are ORed; an empty selection hides location markers. */
  selectedBiomes: string[]
  setSelectedBiomes: (next: FilterKeysUpdater) => void
  /** Saved and seed-predicted material sources selected in the resource-node group. */
  activeResourceItems: string[]
  setActiveResourceItems: (next: FilterKeysUpdater) => void
  /** Player pin types the user hid; everything else is shown by default. */
  hiddenPinTypes: string[]
  setHiddenPinTypes: (next: FilterKeysUpdater) => void
  /** Whether the player's tracked chests are drawn on the map. */
  showFriendContainers: boolean
  setShowFriendContainers: (next: boolean) => void
  showContainers: boolean
  setShowContainers: (next: boolean) => void
  /** Save-backed clusters of player-built pieces. */
  showStructures: boolean
  setShowStructures: (next: boolean) => void
  /** Live creatures inside the tracker's 200 m scan. */
  showNearbyCreatures: boolean
  setShowNearbyCreatures: (next: boolean) => void
  /** Creature prefabs hidden inside the live nearby-creature layer. */
  hiddenNearbyCreaturePrefabs: string[]
  setHiddenNearbyCreaturePrefabs: (next: FilterKeysUpdater) => void
}

export const useMapFilterStore = create<MapFilterState>()(
  persist(
    (set) => ({
      spoilerMode: 'full',
      setSpoilerMode: (next) => set({ spoilerMode: next, showSpoilers: next === 'full' }),
      showSpoilers: true,
      setShowSpoilers: (next) => set({ showSpoilers: next, spoilerMode: next ? 'full' : 'personal' }),
      activeFilterKeys: [...DEFAULT_ACTIVE_FILTER_KEYS],
      setActiveFilterKeys: (next) => set((state) => ({
        activeFilterKeys: typeof next === 'function' ? next(state.activeFilterKeys) : next,
      })),
      selectedBiomes: [...ALL_BIOME_KEYS],
      setSelectedBiomes: (next) => set((state) => ({
        selectedBiomes: typeof next === 'function' ? next(state.selectedBiomes) : next,
      })),
      activeResourceItems: [],
      setActiveResourceItems: (next) => set((state) => ({
        activeResourceItems: normalizeResourceSelection(typeof next === 'function' ? next(state.activeResourceItems) : next),
      })),
      hiddenPinTypes: [...DEFAULT_HIDDEN_PIN_TYPES],
      setHiddenPinTypes: (next) => set((state) => ({
        hiddenPinTypes: typeof next === 'function' ? next(state.hiddenPinTypes) : next,
      })),
      showFriendContainers: true,
      setShowFriendContainers: (next) => set({ showFriendContainers: next }),
      showContainers: true,
      setShowContainers: (next) => set({ showContainers: next }),
      showStructures: true,
      setShowStructures: (next) => set({ showStructures: next }),
      showNearbyCreatures: true,
      setShowNearbyCreatures: (next) => set({ showNearbyCreatures: next }),
      hiddenNearbyCreaturePrefabs: [],
      setHiddenNearbyCreaturePrefabs: (next) => set((state) => ({
        hiddenNearbyCreaturePrefabs: typeof next === 'function'
          ? next(state.hiddenNearbyCreaturePrefabs)
          : next,
      })),
    }),
    {
      name: 'valheim-companion:map-filters',
      version: 9,
      migrate: (persisted, version) => {
        const previous = persisted && typeof persisted === 'object'
          ? persisted as Partial<MapFilterState>
          : {}
        const activeFilterKeys = new Set(
          Array.isArray(previous.activeFilterKeys)
            ? previous.activeFilterKeys
            : DEFAULT_ACTIVE_FILTER_KEYS,
        )
        // Preserve the locations visible under the two former umbrella filters.
        if (version < 8 && activeFilterKeys.has('type:camps')) {
          activeFilterKeys.add('type:settlements')
          activeFilterKeys.add('type:structures')
        }
        if (version < 8 && activeFilterKeys.has('type:ruins')) activeFilterKeys.add('type:structures')
        return {
          showSpoilers: true,
          hiddenPinTypes: [...DEFAULT_HIDDEN_PIN_TYPES],
          showFriendContainers: true,
          showContainers: true,
          showStructures: true,
          showNearbyCreatures: true,
          hiddenNearbyCreaturePrefabs: [],
          activeResourceItems: [],
          ...previous,
          spoilerMode: resolveMapSpoilerMode(previous),
          activeFilterKeys: [...activeFilterKeys],
          // Before v8, [] represented "All biomes". Preserve that view.
          selectedBiomes: Array.isArray(previous.selectedBiomes) && (version >= 8 || previous.selectedBiomes.length > 0)
            ? previous.selectedBiomes
            : [...ALL_BIOME_KEYS],
        }
      },
      partialize: (state) => ({
        spoilerMode: state.spoilerMode,
        showSpoilers: state.showSpoilers,
        activeFilterKeys: state.activeFilterKeys,
        selectedBiomes: state.selectedBiomes,
        activeResourceItems: state.activeResourceItems,
        hiddenPinTypes: state.hiddenPinTypes,
        showContainers: state.showContainers,
        showFriendContainers: state.showFriendContainers,
        showStructures: state.showStructures,
        showNearbyCreatures: state.showNearbyCreatures,
        hiddenNearbyCreaturePrefabs: state.hiddenNearbyCreaturePrefabs,
      }),
      merge: (persisted, current) => {
        const previous = persisted && typeof persisted === 'object' ? persisted as Partial<MapFilterState> : {}
        return {
          ...current,
          ...previous,
          activeResourceItems: normalizeResourceSelection(previous.activeResourceItems),
          spoilerMode: resolveMapSpoilerMode(previous),
          showSpoilers: resolveMapSpoilerMode(previous) === 'full',
        }
      },
    },
  ),
)
