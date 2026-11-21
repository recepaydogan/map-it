import { classifyLocationType } from './location-filters.ts'
import type { SemanticComponent, LocationRecord } from '../types/game-data'

export type LocationFeatureKind =
  | 'boss'
  | 'creature'
  | 'door'
  | 'drop'
  | 'pickable'
  | 'runestone'

export interface LocationFeature {
  count: number
  kind: LocationFeatureKind
  name: string
  values?: Record<string, string | number | boolean>
}

type GameObjectReference = {
  name?: string
}

export const formatGameName = (value: string) => value
  .replace(/^\$/, '')
  .replace(/[_-]+/g, ' ')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/([A-Za-z])(\d+)/g, '$1 $2')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (character) => character.toUpperCase())

export const formatLocationName = (value: string) => formatGameName(value)

export const locationNameLabelKey = (prefabName: string) => {
  if (prefabName === 'StartTemple') return 'map.locationNames.sacrificialStones'
  const northNames: Record<string, string> = { DN_Bossroom: 'frozenKingCitadel', TheDarkestHole: 'darkestHole', TheHole01: 'theHole', MorkBorg: 'morkBorg', NorthVillage: 'northVillage', NorthMemorialPlace: 'memorialPlace', AncientUpgradeStation: 'ancientUpgradeStation' }
  if (northNames[prefabName]) return `map.locationNames.${northNames[prefabName]}`
  if (/^StoneHouse\d+$/i.test(prefabName)) return 'map.locationNames.abandonedStoneHouse'
  if (/^InfestedTree\d+$/i.test(prefabName)) return 'map.locationNames.infestedAncientTree'
  if (/^Mistlands_DvergrTownEntrance[12]$/i.test(prefabName)) return 'map.locationNames.infestedMine'
  if (/^Greydwarf[_-]?camp\d+$/i.test(prefabName)) return 'map.locationNames.greydwarfCamp'
  if (/^Mistlands[_-]?RoadPost\d+$/i.test(prefabName)) return 'map.locationNames.ancientRoadMarker'
  if (/^Mistlands[_-]?Giant\d+$/i.test(prefabName)) return 'map.locationNames.ancientJotunnRemains'
  if (/^CharredStone[_-]?Spawner$/i.test(prefabName)) return 'map.locationNames.charredSpawner'
  return ''
}

export const locationCategoryLabelKey = (location: LocationRecord) => {
  const category = classifyLocationType(location).replace('type:', '')
  return `filters.${category}`
}

const objectName = (value: unknown) => (
  typeof value === 'object' && value !== null && 'name' in value
    ? (value as GameObjectReference).name
    : undefined
)

export const findBossPrefab = (components: SemanticComponent[]) => {
  if (components.some((component) => component.kind === 'boss-altar' && component.objectName === 'offeraltar_FrozenKing')) return 'FrozenKing'
  const altar = components.find((component) => component.kind === 'boss-altar' && !/memorial/.test(component.objectName))
  return altar ? objectName(altar.data.bossPrefab) ?? null : null
}

const numberValue = (value: unknown) => typeof value === 'number' ? value : undefined

const addFeature = (
  features: Map<string, LocationFeature>,
  feature: LocationFeature,
) => {
  const key = `${feature.kind}:${feature.name}`
  const current = features.get(key)
  if (current) {
    current.count += feature.count
    return
  }
  features.set(key, feature)
}

const dropsFromComponent = (component: SemanticComponent) => {
  const dropWhenDestroyed = component.data.dropWhenDestroyed
  if (typeof dropWhenDestroyed !== 'object' || dropWhenDestroyed === null) return []
  const drops = 'drops' in dropWhenDestroyed ? dropWhenDestroyed.drops : undefined
  return Array.isArray(drops) ? drops : []
}

export const summarizeLocationFeatures = (
  components: SemanticComponent[],
): LocationFeature[] => {
  const features = new Map<string, LocationFeature>()

  for (const component of components) {
    if (component.kind === 'boss-altar') {
      if (/memorial/.test(component.objectName)) continue
      const boss = component.objectName === 'offeraltar_FrozenKing' ? 'FrozenKing' : objectName(component.data.bossPrefab)
      addFeature(features, {
        kind: 'boss',
        name: formatGameName(boss ?? component.objectName),
        count: 1,
        values: {
          offerings: numberValue(component.data.bossItems) ?? 0,
          summonDelay: numberValue(component.data.spawnBossDelay) ?? 0,
        },
      })
      continue
    }

    if (component.kind === 'creature-spawner') {
      const creature = objectName(component.data.creaturePrefab)
      if (!creature) continue
      addFeature(features, {
        kind: 'creature',
        name: formatGameName(creature),
        count: 1,
        values: {
          prefabName: creature,
          day: component.data.spawnAtDay === 1,
          night: component.data.spawnAtNight === 1,
        },
      })
      continue
    }

    if (component.kind === 'runestone') {
      addFeature(features, {
        kind: 'runestone',
        name: formatGameName(component.data.locationName as string || component.objectName),
        count: 1,
        values: { revealsMap: component.data.showMap === 1 },
      })
      continue
    }

    if (component.kind === 'pickable') {
      const item = objectName(component.data.itemPrefab)
      if (!item) continue
      addFeature(features, {
        kind: 'pickable',
        name: formatGameName(item),
        count: numberValue(component.data.amount) ?? 1,
        values: { prefabName: item },
      })
      continue
    }

    if (component.kind === 'door') {
      const keyItem = objectName(component.data.keyItem)
      addFeature(features, {
        kind: 'door',
        name: formatGameName(component.objectName),
        count: 1,
        values: keyItem ? {
          keyItem: formatGameName(keyItem),
          keyItemPrefab: keyItem,
        } : undefined,
      })
      continue
    }

    if (component.kind === 'drop-on-destroyed') {
      for (const drop of dropsFromComponent(component)) {
        if (typeof drop !== 'object' || drop === null || !('item' in drop)) continue
        const name = objectName(drop.item)
        if (!name) continue
        const minimum = 'stackMin' in drop ? numberValue(drop.stackMin) : undefined
        const maximum = 'stackMax' in drop ? numberValue(drop.stackMax) : undefined
        addFeature(features, {
          kind: 'drop',
          name: formatGameName(name),
          count: maximum ?? minimum ?? 1,
          values: { prefabName: name },
        })
      }
    }
  }

  const priority: Record<LocationFeatureKind, number> = {
    boss: 0,
    creature: 1,
    pickable: 2,
    drop: 3,
    runestone: 4,
    door: 5,
  }
  return [...features.values()].sort((first, second) => (
    priority[first.kind] - priority[second.kind] || first.name.localeCompare(second.name)
  ))
}

/**
 * Features worth listing inside the location detail panel. A lore location's
 * runestone is the location itself, so repeating it as inert nested content is
 * misleading. Runestones embedded in other location types remain visible.
 */
export const getLocationPanelFeatures = (location: LocationRecord): LocationFeature[] => {
  const features = summarizeLocationFeatures(location.contents?.semanticComponents ?? [])
  if (classifyLocationType(location) !== 'type:lore') return features
  return features.filter((feature) => feature.kind !== 'runestone')
}
