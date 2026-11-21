import type { LocationRecord } from '../types/game-data'

export type LocationFilterDefinition = {
  key: string
  labelKey: string
  icon:
    | 'boss'
    | 'dungeon'
    | 'trader'
    | 'camp'
    | 'settlement'
    | 'structure'
    | 'ruin'
    | 'lore'
    | 'nature'
    | 'creature'
}

export type LocationFilterGroup = {
  key: string
  labelKey: string
  filters: LocationFilterDefinition[]
  /** Whether the group supports selecting all filters and the "Only" shortcut. */
  bulkToggle: boolean
}

const TYPE_FILTERS: LocationFilterDefinition[] = [
  { key: 'type:bosses', labelKey: 'filters.bosses', icon: 'boss' },
  { key: 'type:dungeons', labelKey: 'filters.dungeons', icon: 'dungeon' },
  { key: 'type:traders', labelKey: 'filters.traders', icon: 'trader' },
  { key: 'type:camps', labelKey: 'filters.camps', icon: 'camp' },
  { key: 'type:settlements', labelKey: 'filters.settlements', icon: 'settlement' },
  { key: 'type:structures', labelKey: 'filters.structures', icon: 'structure' },
  { key: 'type:ruins', labelKey: 'filters.ruins', icon: 'ruin' },
  { key: 'type:lore', labelKey: 'filters.lore', icon: 'lore' },
  { key: 'type:natural', labelKey: 'filters.natural', icon: 'nature' },
]

/**
 * Enemy families, in world-progression order. A location joins a family when
 * one of its creature spawners spawns a member; the family label is what the
 * player asks for ("where do trolls live?"), so variants collapse together.
 */
export const CREATURE_FAMILIES: ReadonlyArray<{ key: string; members: readonly string[] }> = [
  { key: 'boar', members: ['Boar'] },
  { key: 'greydwarf', members: ['Greydwarf', 'Greydwarf_Elite', 'Greydwarf_Shaman', 'Greydwarf_Frozen', 'Greydwarf_Shaman_Frozen'] },
  { key: 'skeleton', members: ['Skeleton', 'Skeleton_NoArcher', 'Skeleton_Poison', 'Skeleton_DeepNorth', 'Skeleton_Meadows', 'Skeleton_Meadows_noarcher', 'Skeleton_Mountains', 'Skeleton_Mountains_noarcher', 'Skeleton_Swamps', 'Skeleton_Swamps_noarcher'] },
  { key: 'troll', members: ['Troll', 'Troll_sleeping'] },
  { key: 'draugr', members: ['Draugr', 'Draugr_Elite', 'Draugr_Ranged', 'Draugr_sleeping', 'Draugr_Elite_sleeping', 'Draugr_Ranged_sleeping'] },
  { key: 'blob', members: ['Blob', 'BlobElite', 'BlobTar'] },
  { key: 'wraith', members: ['Wraith'] },
  { key: 'surtling', members: ['Surtling'] },
  { key: 'hatchling', members: ['Hatchling'] },
  { key: 'stone-golem', members: ['StoneGolem'] },
  { key: 'goblin', members: ['Goblin', 'GoblinArcher', 'GoblinBrute', 'GoblinShaman'] },
  { key: 'dverger', members: ['Dverger', 'DvergerMage', 'DvergerMageFire', 'DvergerMageIce', 'DvergerMageSupport', 'DvergerAshlands', 'DvergerDeepNorth'] },
  { key: 'seeker', members: ['Seeker', 'SeekerBrute', 'SeekerBrood'] },
  { key: 'tick', members: ['Tick'] },
  { key: 'volture', members: ['Volture'] },
  { key: 'morgen', members: ['Morgen'] },
  { key: 'charred', members: ['Charred_Melee', 'Charred_Archer', 'Charred_Mage', 'Charred_Melee_Dyrnwyn', 'Charred_Twitcher'] },
  { key: 'bear', members: ['Bjorn', 'Bjorn_sleeping', 'Unbjorn'] },
  { key: 'moose', members: ['Moose', 'Moose_calf'] },
  { key: 'seal', members: ['Seal', 'Seal_Pup'] },
  { key: 'elaking', members: ['Elaking', 'ElakingLantern', 'ElakingMole'] },
  { key: 'jotun', members: ['JotunWarrior', 'JotunWarriorDualWield', 'JotunWitch'] },
  { key: 'gammeltroll', members: ['TrollFrost'] },
  { key: 'frysling', members: ['Frysling'] },
  { key: 'pulp', members: ['BlobMork', 'BlobMorkMini'] },
  { key: 'fallen-warrior', members: ['FallenWarrior'] },
  { key: 'void', members: ['Ghost_old', 'Ghost_Void', 'ShadowPerson'] },
]

const familyByCreature = new Map<string, string>()
for (const family of CREATURE_FAMILIES) for (const member of family.members) familyByCreature.set(member.toLowerCase(), family.key)

export const creatureFilterKey = (familyKey: string) => `creature:${familyKey}`

const CREATURE_FILTERS: LocationFilterDefinition[] = CREATURE_FAMILIES.map((family) => ({
  key: creatureFilterKey(family.key),
  labelKey: `filters.creatures.${family.key}`,
  icon: 'creature',
}))

export const LOCATION_FILTER_GROUPS: LocationFilterGroup[] = [
  { key: 'bosses', labelKey: 'filters.groupBosses', filters: TYPE_FILTERS.slice(0, 1), bulkToggle: true },
  { key: 'enemies', labelKey: 'filters.enemies', filters: CREATURE_FILTERS, bulkToggle: true },
  { key: 'dungeons', labelKey: 'filters.dungeons', filters: TYPE_FILTERS.slice(1, 2), bulkToggle: true },
  { key: 'npcs', labelKey: 'filters.traders', filters: TYPE_FILTERS.slice(2, 3), bulkToggle: true },
  { key: 'settlements-and-structures', labelKey: 'filters.settlementsAndStructures', filters: TYPE_FILTERS.slice(3, 7), bulkToggle: true },
  { key: 'discoveries', labelKey: 'filters.discoveries', filters: TYPE_FILTERS.slice(7), bulkToggle: true },
]

export const ALL_LOCATION_FILTER_KEYS = LOCATION_FILTER_GROUPS.flatMap((group) =>
  group.filters.map((filter) => filter.key),
)

/** First-run view: key enemies, dungeons, and built locations. */
export const DEFAULT_ACTIVE_FILTER_KEYS: readonly string[] = [
  'type:bosses',
  'type:dungeons',
  'type:camps',
  'type:settlements',
  'type:structures',
  'type:ruins',
  creatureFilterKey('boar'),
  creatureFilterKey('troll'),
  creatureFilterKey('wraith'),
  creatureFilterKey('hatchling'),
]

export const filterGroupCountKey = (groupKey: string) => `group:${groupKey}`

export const classifyLocationType = (location: LocationRecord): string => {
  const name = location.prefabName.toLowerCase()
  const componentKinds = Object.keys(location.contents?.componentKindCounts ?? {})

  if (/memorial/.test(name)) return 'type:lore'
  if (
    componentKinds.includes('boss-altar') ||
    /(eikthyr|gdking|goblin.?king|bonemass|dragonqueen|fader|dvergr.?boss|dn_bossroom)/.test(name)
  ) return 'type:bosses'
  // A guck-covered ancient tree is an outdoor Swamp resource, not an
  // infested dungeon. Keep this specific rule ahead of the broad matcher.
  if (/^infestedtree/.test(name)) return 'type:natural'
  // Frost Troll fragments are outdoor remains, not Troll Cave dungeons.
  if (/^dn_gammeltrollfrac\d+$/.test(name)) return 'type:natural'
  // Hildir's Sealed Tower is a quest dungeon, not her trading camp.
  if (name === 'hildir_plainsfortress') return 'type:dungeons'
  // The Infested Mine entrances are named after a Dvergr town, but the game's
  // location list groups both entrances as DvergrDungeon.
  if (location.placement.group === 'DvergrDungeon') return 'type:dungeons'
  if (/(crypt|cave|troll|sunken|dungeon|mine|morgen.?hole|infested|thehole|thedarkesthole|morkborg)/.test(name)) return 'type:dungeons'
  if (/(vendor|hildir|trader|^bogwitch_camp$)/.test(name)) return 'type:traders'
  if (/(runestone|lorestone|waymarker|placeof.?mystery)/.test(name)) return 'type:lore'
  // Destruction wins over the original building type: FortressRuins and
  // StoneTowerRuins are ruins, never intact structures or camps.
  if (/(ruin|abandoned|stone.?henge|stone.?circle|dolmen|grave|ship.?wreck|frozen.?ship|ship.?setting)/.test(name)) return 'type:ruins'
  if (/camp/.test(name)) return 'type:camps'
  if (/(village|town|farm|harbour)/.test(name)) return 'type:settlements'
  if (/(fort|fortress|house|tower|hut|temple|lighthouse|road.?post|excavation|upgradestation)/.test(name)) return 'type:structures'
  return 'type:natural'
}

/** Creature prefabs the location's spawners produce (deduplicated, original casing). */
export const spawnedCreaturesOf = (location: LocationRecord): string[] => {
  const found = new Set<string>()
  for (const component of location.contents?.semanticComponents ?? []) {
    if (component.kind !== 'creature-spawner') continue
    const creature = (component.data?.creaturePrefab as { name?: unknown } | undefined)?.name
    if (typeof creature === 'string' && creature) found.add(creature)
  }
  return [...found]
}

export const getLocationFilterKeys = (location: LocationRecord): Set<string> => {
  const keys = new Set<string>([classifyLocationType(location)])
  for (const creature of spawnedCreaturesOf(location)) {
    const family = familyByCreature.get(creature.toLowerCase())
    if (family) keys.add(creatureFilterKey(family))
  }
  return keys
}

/** A location shows when any active filter (type, boss altar, or enemy family) applies to it. */
export const locationMatchesFilters = (
  location: LocationRecord,
  activeFilters: ReadonlySet<string>,
): boolean => {
  if (activeFilters.size === 0) return false
  const locationKeys = getLocationFilterKeys(location)
  for (const key of locationKeys) if (activeFilters.has(key)) return true
  return false
}

/**
 * Text the map search matches against, beyond the location's own name: what
 * is inside it (pickables, spawners, chests, doors…) so "mushroom" or "troll"
 * finds the places that hold them. Object names are prefab-ish
 * ("Pickable_Mushroom (3)"), so they are normalized to plain words.
 */
export const locationSearchTerms = (location: LocationRecord): string[] => {
  const terms = new Set<string>()
  const add = (raw: string) => {
    const cleaned = raw
      .replace(/\s*\(\d+\)\s*$/, '')
      .replace(/^(pickable|spawner|piece|treasurechest|loot|prop|vegvisir)_/i, '')
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .trim()
      .toLowerCase()
    if (cleaned) terms.add(cleaned)
  }
  for (const component of location.contents?.semanticComponents ?? []) {
    if (component.objectName) add(component.objectName)
    const creature = (component.data?.creaturePrefab as { name?: unknown } | undefined)?.name
    if (typeof creature === 'string') add(creature)
  }
  return [...terms]
}
