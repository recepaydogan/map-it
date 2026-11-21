import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type MarkerTypeDefinition = { key: string; labelKey: string; color: string; icon: string }

/** The ten choices mirror the map filter's location categories. */
export const CUSTOM_MARKER_ICON_TYPES: MarkerTypeDefinition[] = [
  { key: 'type:traders', labelKey: 'filters.traders', color: '#5ac9a0', icon: 'trader' },
  { key: 'type:dungeons', labelKey: 'filters.dungeons', color: '#b48bc9', icon: 'glyph:cave' },
  { key: 'group:enemies', labelKey: 'filters.enemies', color: '#db735c', icon: 'lucide:swords' },
  { key: 'type:bosses', labelKey: 'filters.groupBosses', color: '#e5342a', icon: 'boss' },
  { key: 'type:lore', labelKey: 'filters.lore', color: '#5ab0c9', icon: 'glyph:runestone' },
  { key: 'type:camps', labelKey: 'filters.camps', color: '#c9b15a', icon: 'fire' },
  { key: 'type:settlements', labelKey: 'filters.settlements', color: '#c9b15a', icon: 'house' },
  { key: 'type:structures', labelKey: 'filters.structures', color: '#c9b15a', icon: 'glyph:tower' },
  { key: 'type:ruins', labelKey: 'filters.ruins', color: '#c9b15a', icon: 'glyph:ruin' },
  { key: 'type:natural', labelKey: 'filters.natural', color: '#5ab0c9', icon: 'glyph:tree' },
]

/** Older saved marker categories remain readable, but are not new icon choices. */
export const CUSTOM_MARKER_TYPES: MarkerTypeDefinition[] = [
  { key: 'poi', labelKey: 'customMarkers.types.poi', color: '#5ab0c9', icon: 'pin' },
  { key: 'boss', labelKey: 'customMarkers.types.boss', color: '#e5342a', icon: 'boss' },
  { key: 'loot', labelKey: 'customMarkers.types.loot', color: '#c9b15a', icon: 'hammer' },
  { key: 'npc', labelKey: 'customMarkers.types.npc', color: '#5ac9a0', icon: 'trader' },
  { key: 'secret', labelKey: 'customMarkers.types.secret', color: '#c95a9b', icon: 'ping' },
  { key: 'objective', labelKey: 'customMarkers.types.objective', color: '#e0c14e', icon: 'shout' },
  { key: 'favorite', labelKey: 'customMarkers.types.favorite', color: '#fbbf24', icon: 'fire' },
  { key: 'note', labelKey: 'customMarkers.types.note', color: '#9ba8b4', icon: 'house' },
  { key: 'group:bosses', labelKey: 'filters.groupBosses', color: '#e5342a', icon: 'boss' },
  { key: 'group:dungeons', labelKey: 'filters.dungeons', color: '#b48bc9', icon: 'glyph:cave' },
  { key: 'group:npcs', labelKey: 'filters.traders', color: '#5ac9a0', icon: 'trader' },
  { key: 'group:settlements-and-structures', labelKey: 'filters.settlementsAndStructures', color: '#c9b15a', icon: 'glyph:tower' },
  { key: 'group:discoveries', labelKey: 'filters.discoveries', color: '#5ab0c9', icon: 'glyph:runestone' },
  ...CUSTOM_MARKER_ICON_TYPES,
]

export type CustomMarkerType = string

export const customMarkerType = (key: string) => CUSTOM_MARKER_TYPES.find((type) => type.key === key) ?? CUSTOM_MARKER_TYPES[0]

export interface CustomMarker {
  id: string
  worldKey: string
  x: number
  z: number
  category: CustomMarkerType
  name: string
  description?: string
  icon?: string
  createdAt: number
}

export type MarkerFields = Pick<CustomMarker, 'category' | 'name' | 'description' | 'icon'>

interface CustomMarkerState {
  markers: CustomMarker[]
  hiddenCategories: CustomMarkerType[]
  setCategoryVisible: (category: CustomMarkerType, visible: boolean) => void
  setAllVisible: (visible: boolean) => void
  add: (marker: Omit<CustomMarker, 'id' | 'createdAt'>) => string
  update: (id: string, fields: MarkerFields) => void
  move: (id: string, x: number, z: number) => void
  remove: (id: string) => void
}

const STORAGE_KEY = 'valheim-companion:custom-markers'

export const useCustomMarkerStore = create<CustomMarkerState>()(
  persist((set) => ({
    markers: [],
    hiddenCategories: [],
    setCategoryVisible: (category, visible) => set((state) => ({ hiddenCategories: visible
      ? state.hiddenCategories.filter((key) => key !== category)
      : [...new Set([...state.hiddenCategories, category])],
    })),
    setAllVisible: (visible) => set({ hiddenCategories: visible ? [] : CUSTOM_MARKER_TYPES.map((type) => type.key) }),
    add: (marker) => {
      const id = `custom:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      set((state) => ({ markers: [...state.markers, { ...marker, id, createdAt: Date.now() }], hiddenCategories: state.hiddenCategories.filter((key) => key !== marker.category) }))
      return id
    },
    update: (id, fields) => set((state) => ({
      markers: state.markers.map((marker) => marker.id === id ? { ...marker, ...fields } : marker),
    })),
    move: (id, x, z) => set((state) => ({
      markers: state.markers.map((marker) => marker.id === id ? { ...marker, x, z } : marker),
    })),
    remove: (id) => set((state) => ({ markers: state.markers.filter((marker) => marker.id !== id) })),
  }), {
    name: STORAGE_KEY,
    partialize: (state) => ({ markers: state.markers, hiddenCategories: state.hiddenCategories }),
  }),
)

// Each Overwolf window has its own store instance. Keep open maps in sync
// without waiting for a reload, including edits made from the mini-map.
if (typeof window !== 'undefined') {
  const refresh = () => { void useCustomMarkerStore.persist.rehydrate() }
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) refresh()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener('focus', refresh)
}
