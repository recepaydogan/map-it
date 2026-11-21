import { assetUrl } from './asset-url'
import type { MarkerGlyphName } from '../components/marker-glyphs'
import { classifyLocationType } from './location-filters'
import type { LocationRecord } from '../types/game-data'
import type { MapPinType } from './valheim/character-save-format'
import { MAP_MARKER_STACK } from './map-marker-stack'

export type MarkerCategory =
  | 'type:bosses'
  | 'type:dungeons'
  | 'type:traders'
  | 'type:camps'
  | 'type:settlements'
  | 'type:structures'
  | 'type:ruins'
  | 'type:lore'
  | 'type:natural'

/**
 * What a marker shows inside its badge.
 * - `icon`: one of the game's white `mapicon_*` sprites — drawn large, edge to edge.
 * - `art`: coloured game art (trophies, items) — drawn slightly inset.
 * - `glyph`: our own silhouette for kinds the game has no icon for.
 */
export type LocationMarkerVisual =
  | { kind: 'icon'; src: string }
  | { kind: 'art'; src: string }
  | { kind: 'glyph'; glyph: MarkerGlyphName }

export interface LocationMarkerStyle {
  background: string
  border: string
  /** Fallback visual for the category, used by clusters and unmatched prefabs. */
  visual: LocationMarkerVisual
  priority: number
}

const ICONS = assetUrl('/game-data/icons')
const icon = (file: string): LocationMarkerVisual => ({ kind: 'icon', src: `${ICONS}/${file}` })
const art = (file: string): LocationMarkerVisual => ({ kind: 'art', src: `${ICONS}/${file}` })
const glyph = (name: MarkerGlyphName): LocationMarkerVisual => ({ kind: 'glyph', glyph: name })

export const MAP_MARKER_BACKGROUND = '#4A3324'
export const MAP_MARKER_ACTIVE_BORDER = 'rgba(255, 255, 255, 0.72)'

export const MAP_ICONS = {
  memorial: `${ICONS}/mapicon-memorialplace-b86ce25c.png`,
  bed: `${ICONS}/mapicon-bed-f8f350d4.png`,
  bogwitch: `${ICONS}/mapicon-bogwitch-camp-76af5eac.png`,
  boss: `${ICONS}/mapicon-boss-0aa12f0d.png`,
  bossColored: `${ICONS}/mapicon-boss-colored-b53684e3.png`,
  checked: `${ICONS}/mapicon-checked-b808e845.png`,
  death: `${ICONS}/mapicon-death-382ee4c7.png`,
  eventArea: `${ICONS}/mapicon-eventarea-99c4c2b4.png`,
  fire: `${ICONS}/mapicon-fire-0d034fb5.png`,
  hammer: `${ICONS}/mapicon-hammer-5d8905cc.png`,
  hildir: `${ICONS}/mapicon-hildir-545831c5.png`,
  hildir1: `${ICONS}/mapicon-hildir1-4c568d3a.png`,
  hildir2: `${ICONS}/mapicon-hildir2-ffd7e856.png`,
  hildir3: `${ICONS}/mapicon-hildir3-73a8ec45.png`,
  house: `${ICONS}/mapicon-house-0a98ce50.png`,
  pin: `${ICONS}/mapicon-pin-52699694.png`,
  ping: `${ICONS}/mapicon-ping-b98492fe.png`,
  player: `${ICONS}/mapicon-player-32-669928e4.png`,
  portal: `${ICONS}/mapicon-portal-4efb9aaf.png`,
  randomEvent: `${ICONS}/mapicon-randevent-4cb44363.png`,
  shout: `${ICONS}/mapicon-shout-871d21bb.png`,
  start: `${ICONS}/mapicon-start-e46cd461.png`,
  trader: `${ICONS}/mapicon-trader-d564e6f5.png`,
} as const

/** The sprite the game draws for each pin type (Minimap.GetSprite). */
export const PIN_TYPE_ICONS: Partial<Record<MapPinType, string>> = {
  icon0: MAP_ICONS.fire,
  icon1: MAP_ICONS.house,
  icon2: MAP_ICONS.hammer,
  icon3: MAP_ICONS.pin,
  icon4: MAP_ICONS.portal,
  death: MAP_ICONS.death,
  bed: MAP_ICONS.bed,
  boss: MAP_ICONS.boss,
  shout: MAP_ICONS.shout,
  player: MAP_ICONS.player,
  randomEvent: MAP_ICONS.randomEvent,
  ping: MAP_ICONS.ping,
  eventArea: MAP_ICONS.eventArea,
  hildir1: MAP_ICONS.hildir1,
  hildir2: MAP_ICONS.hildir2,
  hildir3: MAP_ICONS.hildir3,
  memorial: MAP_ICONS.memorial,
}

export const LOCATION_MARKER_STYLES: Record<MarkerCategory, LocationMarkerStyle> = {
  'type:bosses': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: icon('mapicon-boss-0aa12f0d.png'),
    priority: MAP_MARKER_STACK.bosses,
  },
  'type:traders': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: icon('mapicon-trader-d564e6f5.png'),
    priority: MAP_MARKER_STACK.npcs,
  },
  'type:dungeons': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: glyph('cave'),
    priority: MAP_MARKER_STACK.dungeons,
  },
  'type:camps': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: icon('mapicon-fire-0d034fb5.png'),
    priority: MAP_MARKER_STACK.structures,
  },
  'type:settlements': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: icon('mapicon-house-0a98ce50.png'),
    priority: MAP_MARKER_STACK.structures,
  },
  'type:structures': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: glyph('tower'),
    priority: MAP_MARKER_STACK.structures,
  },
  'type:lore': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: glyph('runestone'),
    priority: MAP_MARKER_STACK.discoveries,
  },
  'type:ruins': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: glyph('ruin'),
    priority: MAP_MARKER_STACK.structures,
  },
  'type:natural': {
    background: MAP_MARKER_BACKGROUND,
    border: MAP_MARKER_ACTIVE_BORDER,
    visual: glyph('tree'),
    priority: MAP_MARKER_STACK.discoveries,
  },
}

/**
 * Per-prefab visuals, first match wins. Category-locked families deliberately
 * bypass this table so every marker in each category keeps one recognisable
 * icon. Other places use game sprites or a silhouette glyph where helpful.
 */
const PREFAB_VISUALS: ReadonlyArray<readonly [RegExp, LocationMarkerVisual]> = [
  // Every camp shares one icon. Individual inhabitants belong in the detail
  // panel, not in the marker identity (Goblin/Greydwarf/Hildir included).
  [/camp/, icon('mapicon-fire-0d034fb5.png')],
  // Boss altars keep the category's own boss sprite (the game's map icon).
  // Traders and quest sites: the game's own map sprites.
  [/bogwitch/, icon('mapicon-bogwitch-camp-76af5eac.png')],
  [/^vendor_/, icon('mapicon-trader-d564e6f5.png')],
  [/^hildir_camp/, icon('mapicon-hildir-545831c5.png')],
  [/^hildir_crypt/, icon('mapicon-hildir1-4c568d3a.png')],
  [/^hildir_cave/, icon('mapicon-hildir2-ffd7e856.png')],
  [/^hildir_plainsfortress/, icon('mapicon-hildir3-73a8ec45.png')],
  [/^starttemple/, icon('mapicon-start-e46cd461.png')],
  // The tiny Guck inventory sprite is an unreadable green smudge at marker
  // size. A bold tree silhouette describes the actual location immediately.
  [/^infestedtree/, glyph('tree')],
  // Camps, forts and settlements.
  [/^woodvillage/, icon('mapicon-house-0a98ce50.png')],
  [/^woodfarm/, icon('mapicon-house-0a98ce50.png')],
  [/^charredfortress/, art('trophy-charred-melee-c2aaf1f7.png')],
  [/^fortressruins/, art('trophy-charred-archer-eb5ef0d3.png')],
  [/^mistlands_(excavation|harbour|roadpost)/, art('trophy-dvergr-f94b01a0.png')],
  [/^mistlands_(guardtower|lighthouse)/, glyph('tower')],
  [/^drakenest/, art('dragonegg-b6293937.png')],
  [/^volturenest/, art('trophy-volture-c0877b59.png')],
  [/^charredstone_spawner/, art('charredskull-eb7d13d9.png')],
  // Lore.
  [/^(runestone_|drakelorestone)/, glyph('runestone')],
  [/^waymarker/, icon('mapicon-pin-52699694.png')],
  [/^placeofmystery/, glyph('ruin')],
  // Ruins and dwellings.
  [/^(woodhouse|abandonedlogcabin|stonehouse|swamphut)/, icon('mapicon-house-0a98ce50.png')],
  [/^(stonetower|charredtowerruins)/, glyph('tower')],
  [/^(ruin\d|swampruin|charredruins|ashlandruins)/, glyph('ruin')],
  [/well\d/, glyph('well')],
  [/^(mountaingrave|grave\d)/, glyph('grave')],
  [/^shipwreck/, glyph('ship')],
  [/^shipsetting/, glyph('stones')],
  [/^(stonehenge|stonecircle|dolmen)/, glyph('stones')],
  [/^mistlands_swords/, glyph('sword')],
  [/^mistlands_giant/, glyph('skull')],
  [/^mistlands_statue/, glyph('statue')],
  [/^mistlands_viaduct/, glyph('bridge')],
  [/^mistlands_rockspire/, glyph('spire')],
  // Natural features.
  [/^firehole/, icon('mapicon-fire-0d034fb5.png')],
  [/^tarpit/, glyph('tar')],
  [/^sulfurarch/, art('sulfur-06533670.png')],
  [/^leviathanlava/, glyph('lava')],
]

const visualCache = new Map<string, LocationMarkerVisual>()
const CATEGORY_VISUALS_ONLY = new Set<MarkerCategory>([
  'type:dungeons',
  'type:camps',
  'type:settlements',
  'type:structures',
  'type:ruins',
  'type:lore',
  'type:natural',
])

const LOCATION_DETAIL_VISUALS: Partial<Record<MarkerCategory, LocationMarkerVisual>> = {
  'type:dungeons': art('location-cave.png'),
  'type:camps': art('location-camp.png'),
  'type:settlements': art('location-settlement.png'),
  'type:structures': art('location-structure.png'),
  'type:ruins': art('location-ruins.png'),
  'type:lore': art('location-lore.png'),
  'type:natural': art('location-natural.png'),
}

export const getLocationMarkerCategory = (location: LocationRecord) => (
  classifyLocationType(location) as MarkerCategory
)

export const getLocationMarkerStyle = (location: LocationRecord) => (
  LOCATION_MARKER_STYLES[getLocationMarkerCategory(location)]
)

/** Larger, detailed art for the location panel; map markers stay silhouettes. */
export const getLocationDetailVisual = (location: LocationRecord): LocationMarkerVisual => {
  const category = getLocationMarkerCategory(location)
  return LOCATION_DETAIL_VISUALS[category] ?? getLocationMarkerVisual(location)
}

/** The visual for one specific location; falls back to its category's. */
export const getLocationMarkerVisual = (location: LocationRecord): LocationMarkerVisual => {
  const key = `${location.placement?.name ?? ''}|${location.prefabName}`
  const cached = visualCache.get(key)
  if (cached) return cached
  const category = getLocationMarkerCategory(location)
  // The filter category is the marker identity for these families. Do not
  // replace it with a prefab-specific visual or an inhabitant's trophy.
  if (CATEGORY_VISUALS_ONLY.has(category)) {
    const categoryVisual = LOCATION_MARKER_STYLES[category].visual
    visualCache.set(key, categoryVisual)
    return categoryVisual
  }
  const haystack = `${location.placement?.name ?? ''} ${location.prefabName}`.toLowerCase()
  const prefab = location.prefabName.toLowerCase()
  let visual: LocationMarkerVisual | undefined
  for (const [pattern, candidate] of PREFAB_VISUALS) {
    if (pattern.test(prefab) || (!pattern.source.startsWith('^') && pattern.test(haystack))) {
      visual = candidate
      break
    }
  }
  const resolved = visual ?? getLocationMarkerStyle(location).visual
  visualCache.set(key, resolved)
  return resolved
}
