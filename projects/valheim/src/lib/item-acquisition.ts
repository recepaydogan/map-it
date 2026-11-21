import type { LocationRecord } from '../types/game-data.ts'
import type { MarkerIntelligence, MarkerItemIntel } from '../types/marker-intelligence.ts'
import type { RecipeGraph } from './crafting/recipe-types.ts'
import { resolveAcquisitionSources, type AcquisitionSource } from './crafting/resolve-acquisition-sources.ts'
import type { ResourceStateIndex } from './valheim/resource-state.ts'
import { buildTextSearchIndex, matchLocationSearch } from './location-search.ts'

export interface ItemAcquisitionSource extends Omit<AcquisitionSource, 'kind'> {
  kind: AcquisitionSource['kind'] | 'locationLoot' | 'resource'
  locationIds: string[]
  minToolTier?: number
  respawnTimeMinutes?: number
  biomes?: string[]
  resourceKind?: string
}

// Ambient habitats from the extracted spawn/vegetation rules.
// Logs inherit the habitats of their parent trees.
function ambientBiomes(prefab: string): string[] {
  const key = prefab.toLowerCase()
  if (key === 'abomination') return ['Swamp']
  if (/^birch[12]_aut$/.test(key)) return ['Plains']
  if (/^birch[12]$/.test(key)) return ['Meadows']
  if (/^birch_log(?:_half)?$/.test(key)) return ['Meadows', 'Plains']
  if (/^oak(?:1|_log(?:_half)?)$/.test(key)) return ['Meadows']
  return []
}

export function buildItemAcquisitionCatalog(locations: LocationRecord[], graph: RecipeGraph, intelligence: MarkerIntelligence) {
  const byItem = new Map<string, Array<{ location: LocationRecord; kind: string; sourcePrefab: string }>>()
  const byPrefab = new Map<string, string[]>()
  for (const location of locations) {
    if (!location.enabled) continue
    const prefabKey = location.prefabName.toLowerCase()
    byPrefab.set(prefabKey, [...(byPrefab.get(prefabKey) ?? []), location.id])
    for (const source of location.itemSources ?? []) {
      const key = source.itemPrefab.toLowerCase()
      const entries = byItem.get(key) ?? []
      entries.push({ ...source, location })
      byItem.set(key, entries)
    }
  }
  const locationBiomes = new Map(locations.map((location) => [location.id, location.placement.biomes ?? []]))
  const itemSearchIndex = buildTextSearchIndex(Object.values(intelligence.items).map((item) => ({
    id: item.prefabName, terms: [item.name, item.prefabName],
  })))
  return { byItem, byPrefab, graph, intelligence, locationBiomes, itemSearchIndex }
}

export type ItemAcquisitionCatalog = ReturnType<typeof buildItemAcquisitionCatalog>

export function matchItemLocationSearch(
  catalog: ItemAcquisitionCatalog | null,
  locationIndex: ReturnType<typeof buildTextSearchIndex>,
  query: string,
): Set<string> | null {
  if (!catalog) return matchLocationSearch(locationIndex, query)
  let items = matchLocationSearch(catalog.itemSearchIndex, query, false)
  if (!items?.size) {
    const locations = matchLocationSearch(locationIndex, query, false)
    if (locations?.size) return locations
    items = matchLocationSearch(catalog.itemSearchIndex, query)
  }
  if (!items?.size) return matchLocationSearch(locationIndex, query)
  // Item names resolve through acquisition links, not similarly named scenery
  // or an NPC's equipment (neither implies that the place gives the item).
  const ids = new Set<string>()
  for (const prefab of items) {
    const item = catalog.intelligence.items[prefab.toLowerCase()]
    if (!item) continue
    for (const source of itemAcquisitionSources(item, catalog)) {
      for (const id of source.locationIds) ids.add(id)
    }
  }
  return ids
}

/** Same source model for map search and the database; no sources disappear just
 * because they do not have coordinates in the currently selected world. */
export function itemAcquisitionSources(item: MarkerItemIntel, catalog: ItemAcquisitionCatalog): ItemAcquisitionSource[] {
  const sources = new Map<string, ItemAcquisitionSource>()
  const groupKey = (kind: string, prefab: string) => `${kind}:${prefab.toLowerCase()}`
  for (const source of resolveAcquisitionSources(catalog.graph, catalog.intelligence, item.prefabName).sources) {
    // Legacy planner links also contain disabled developer/test locations.
    // Only active world locations can be presented as acquisition places.
    if (source.kind.startsWith('location') && !catalog.byPrefab.has(source.prefabName.toLowerCase())) continue
    const locationPrefabs = source.kind.startsWith('location') ? [source.prefabName] : source.locationPrefabs ?? []
    const key = ['craft', 'conversion', 'build'].includes(source.kind) ? source.id : groupKey(source.kind, source.prefabName)
    sources.set(key, {
      ...source,
      locationIds: [...new Set(locationPrefabs.flatMap((prefab) => catalog.byPrefab.get(prefab.toLowerCase()) ?? []))],
    })
  }
  for (const entry of catalog.byItem.get(item.prefabName.toLowerCase()) ?? []) {
    const kind = entry.kind === 'loot' ? 'locationLoot'
      : entry.kind === 'pickable' ? 'locationPickable'
        : entry.kind === 'destructible' ? 'locationDestructible' : entry.kind as 'trader' | 'creature' | 'boss'
    const isPlace = kind.startsWith('location')
    const prefab = isPlace ? entry.location.prefabName : entry.sourcePrefab
    const key = groupKey(kind, prefab)
    let source = sources.get(key)
    if (!source) {
      source = {
        id: key, kind, prefabName: prefab, name: isPlace ? prefab
          : catalog.intelligence.characters[prefab.toLowerCase()]?.name ?? prefab,
        certainty: 'possible', locationIds: [],
      }
      sources.set(key, source)
    }
    if (!source.locationIds.includes(entry.location.id)) source.locationIds.push(entry.location.id)
  }
  for (const prefab of catalog.graph.itemNodes[item.prefabName.toLowerCase()] ?? []) {
    const node = catalog.graph.resourceNodes[prefab.toLowerCase()]
    const yieldItem = node?.items.find((entry) => entry.prefabName.toLowerCase() === item.prefabName.toLowerCase())
    if (!node || !yieldItem || yieldItem.chance <= 0 || yieldItem.amountMax <= 0) continue
    const id = groupKey('resource', prefab)
    sources.set(id, {
      id, kind: 'resource', name: prefab, prefabName: prefab, locationIds: [], certainty: 'possible',
      amountMin: yieldItem.amountMin, amountMax: yieldItem.amountMax, chance: yieldItem.chance,
      minToolTier: node.minToolTier, respawnTimeMinutes: node.respawnTimeMinutes,
      resourceKind: node.kind,
    })
  }
  for (const source of sources.values()) {
    source.biomes = [...new Set([
      ...ambientBiomes(source.prefabName),
      ...source.locationIds.flatMap((id) => catalog.locationBiomes.get(id) ?? []),
    ])]
  }
  const rank = ['trader', 'boss', 'creature', 'locationPickable', 'locationLoot', 'locationDestructible', 'resource', 'craft', 'conversion', 'build', 'fishing']
  return [...sources.values()].sort((a, b) => rank.indexOf(a.kind) - rank.indexOf(b.kind) || a.name.localeCompare(b.name))
}

/** Map search offers destinations, not recipes or unlocated catalog entries. */
export function itemSourceMapCount(
  item: MarkerItemIntel,
  source: ItemAcquisitionSource,
  markerCounts?: ReadonlyMap<string, number>,
  resourceIndex?: Pick<ResourceStateIndex, 'nodesForItem'> | null,
): number {
  if (['craft', 'conversion', 'build', 'fishing'].includes(source.kind)) return 0
  if (source.kind === 'resource') return resourceIndex?.nodesForItem(item.prefabName)
    .filter((point) => point.nodePrefab.toLowerCase() === source.prefabName.toLowerCase()
      && (point.status === 'present' || point.status === 'partial')).length ?? 0
  return source.locationIds.reduce((sum, id) => sum + (markerCounts?.get(id) ?? 0), 0)
}
