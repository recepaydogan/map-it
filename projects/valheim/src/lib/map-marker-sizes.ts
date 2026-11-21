import { useSyncExternalStore } from 'react'
import { PLAYER_VISIBLE_PIN_TYPES } from './valheim/character-save-format.ts'

const STORAGE_KEY = 'valheim-companion:marker-group-sizes'
export const MARKER_SIZE_MIN = 50
export const MARKER_SIZE_MAX = 200
export const MARKER_SIZE_STEP = 10

export const MARKER_SIZE_GROUPS = [
  { id: 'bosses', labelKey: 'filters.groupBosses' },
  { id: 'personal', labelKey: 'filters.markerSizesPersonal' },
  { id: 'dungeons', labelKey: 'filters.dungeons' },
  { id: 'npcs', labelKey: 'filters.traders' },
  { id: 'structures', labelKey: 'filters.settlementsAndStructures' },
  { id: 'discoveries', labelKey: 'filters.discoveries' },
  { id: 'live', labelKey: 'filters.markerSizesLive' },
] as const

export type MarkerSizeGroup = typeof MARKER_SIZE_GROUPS[number]['id']

export const MARKER_SIZE_CATEGORIES: ReadonlyArray<{ id: string; group: MarkerSizeGroup; labelKey: string }> = [
  { id: 'type:bosses', group: 'bosses', labelKey: 'filters.bosses' },
  { id: 'type:dungeons', group: 'dungeons', labelKey: 'filters.dungeons' },
  { id: 'type:traders', group: 'npcs', labelKey: 'filters.traders' },
  { id: 'type:camps', group: 'structures', labelKey: 'filters.camps' },
  { id: 'type:settlements', group: 'structures', labelKey: 'filters.settlements' },
  { id: 'type:structures', group: 'structures', labelKey: 'filters.structures' },
  { id: 'type:ruins', group: 'structures', labelKey: 'filters.ruins' },
  { id: 'type:lore', group: 'discoveries', labelKey: 'filters.lore' },
  { id: 'type:natural', group: 'discoveries', labelKey: 'filters.natural' },
  ...[...PLAYER_VISIBLE_PIN_TYPES].map((type) => ({ id: `pin:${type}`, group: 'personal' as const, labelKey: `map.pins.types.${type}` })),
  { id: 'custom', group: 'personal', labelKey: 'filters.markerSizesCustom' },
  { id: 'chests', group: 'personal', labelKey: 'filters.markerSizesChests' },
  { id: 'creatures', group: 'live', labelKey: 'map.nearbyCreatures.title' },
  { id: 'resources', group: 'live', labelKey: 'map.resources.title' },
  { id: 'player', group: 'live', labelKey: 'filters.markerSizesPlayer' },
]

const groupByCategory = new Map(MARKER_SIZE_CATEGORIES.map((category) => [category.id, category.group]))

export interface MarkerSizeSettings {
  groups: Record<MarkerSizeGroup, number>
  categories: Record<string, number>
  groupColors: Partial<Record<MarkerSizeGroup, string>>
  categoryColors: Record<string, string>
}

const defaults = (): MarkerSizeSettings => ({
  groups: Object.fromEntries(MARKER_SIZE_GROUPS.map(({ id }) => [id, 100])) as Record<MarkerSizeGroup, number>,
  categories: {},
  groupColors: {},
  categoryColors: {},
})
const DEFAULT_SETTINGS = defaults()
const normalize = (value: unknown): number => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(MARKER_SIZE_MAX, Math.max(MARKER_SIZE_MIN, Math.round(value / MARKER_SIZE_STEP) * MARKER_SIZE_STEP))
  : 100
const normalizeColor = (value: unknown): string | undefined => typeof value === 'string' && /^#[\da-fA-F]{6}$/.test(value)
  ? value.toUpperCase() : undefined

const read = (): MarkerSizeSettings => {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    const raw = stored && typeof stored === 'object' ? stored as Record<string, unknown> : {}
    const groups = raw.groups && typeof raw.groups === 'object' ? raw.groups as Record<string, unknown> : {}
    const categories = raw.categories && typeof raw.categories === 'object' ? raw.categories as Record<string, unknown> : {}
    const groupColors = raw.groupColors && typeof raw.groupColors === 'object' ? raw.groupColors as Record<string, unknown> : {}
    const categoryColors = raw.categoryColors && typeof raw.categoryColors === 'object' ? raw.categoryColors as Record<string, unknown> : {}
    return {
      groups: Object.fromEntries(MARKER_SIZE_GROUPS.map(({ id }) => [id, normalize(groups[id])])) as Record<MarkerSizeGroup, number>,
      categories: Object.fromEntries(Object.entries(categories)
        .filter(([id, value]) => groupByCategory.has(id) && typeof value === 'number' && Number.isFinite(value))
        .map(([id, value]) => [id, normalize(value)])),
      groupColors: Object.fromEntries(MARKER_SIZE_GROUPS.flatMap(({ id }) => {
        const color = normalizeColor(groupColors[id])
        return color ? [[id, color]] : []
      })) as Partial<Record<MarkerSizeGroup, string>>,
      categoryColors: Object.fromEntries(Object.entries(categoryColors).flatMap(([id, value]) => {
        const color = normalizeColor(value)
        return groupByCategory.has(id) && color ? [[id, color]] : []
      })),
    }
  } catch { return defaults() }
}

let settings = typeof window === 'undefined' ? defaults() : read()
const listeners = new Set<() => void>()
const notify = () => { for (const listener of listeners) listener() }
const save = (next: MarkerSizeSettings) => {
  settings = next
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* This window still keeps the setting. */ }
  notify()
}

export const useMarkerSizes = () => useSyncExternalStore(
  subscribe,
  getMarkerSizes,
  getDefaultMarkerSizes,
)
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export const getMarkerSizes = () => settings
const getDefaultMarkerSizes = () => DEFAULT_SETTINGS
export const markerSizePercent = (id: string, value: MarkerSizeSettings): number =>
  value.categories[id] ?? value.groups[groupByCategory.get(id) ?? 'personal']
export const markerScale = (id: string, value: MarkerSizeSettings): number => markerSizePercent(id, value) / 100
export const markerBackgroundColor = (id: string, value: MarkerSizeSettings): string | undefined =>
  value.categoryColors[id] ?? value.groupColors[groupByCategory.get(id) ?? 'personal']
export const setMarkerGroupSize = (group: MarkerSizeGroup, value: number) => {
  const next = normalize(value)
  if (settings.groups[group] !== next) save({ ...settings, groups: { ...settings.groups, [group]: next } })
}
export const setMarkerCategorySize = (id: string, value: number) => {
  const group = groupByCategory.get(id)
  if (!group) return
  const next = normalize(value)
  const categories = { ...settings.categories }
  if (next === settings.groups[group]) delete categories[id]
  else categories[id] = next
  save({ ...settings, categories })
}
export const clearMarkerCategorySize = (id: string) => {
  if (settings.categories[id] === undefined) return
  const categories = { ...settings.categories }
  delete categories[id]
  save({ ...settings, categories })
}
export const setMarkerGroupColor = (group: MarkerSizeGroup, value: string | null) => {
  const color = normalizeColor(value)
  if (value !== null && !color) return
  const groupColors = { ...settings.groupColors }
  if (color) groupColors[group] = color
  else delete groupColors[group]
  save({ ...settings, groupColors })
}
export const setMarkerCategoryColor = (id: string, value: string | null) => {
  if (!groupByCategory.has(id)) return
  const color = normalizeColor(value)
  if (value !== null && !color) return
  const categoryColors = { ...settings.categoryColors }
  if (color) categoryColors[id] = color
  else delete categoryColors[id]
  save({ ...settings, categoryColors })
}
export const resetMarkerSizes = () => save(defaults())

if (typeof window !== 'undefined') window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY && event.key !== null) return
  settings = read()
  notify()
})
