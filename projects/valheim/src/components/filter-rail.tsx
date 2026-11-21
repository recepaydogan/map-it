import {
  Archive,
  Users,
  Castle,
  Check,
  CheckCheck,
  ChevronDown,
  Eye,
  EyeOff,
  Hammer,
  House,
  Landmark,
  MapPin,
  MapPinned,
  Minus,
  PawPrint,
  PanelLeftClose,
  Pickaxe,
  Search,
  Settings,
  SlidersHorizontal,
  Store,
  Star,
  Swords,
  TentTree,
  TreePine,
  X,
} from 'lucide-react'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import type { MapPinType } from '../lib/valheim/character-save-format'
import {
  LOCATION_MARKER_STYLES,
  MAP_ICONS,
  PIN_TYPE_ICONS,
  type MarkerCategory,
} from '../lib/location-marker-style'
import {
  filterGroupCountKey,
  LOCATION_FILTER_GROUPS,
  type LocationFilterDefinition,
} from '../lib/location-filters'
import { LocationMarkerVisual } from './location-marker-visual'
import { CustomMarkerFilters } from './custom-marker-filters'
import { MapMarkerSizePanel } from './map-marker-size-panel'
import { useCustomMarkerStore } from '../store/custom-marker-store'
import { MAX_SELECTED_RESOURCE_MATERIALS } from '../lib/valheim/resource-selection'
import { ALL_BIOME_KEYS, BIOME_FILTER_OPTIONS } from '../lib/valheim/marker-biome-filter'
import { isMapPointVisible, type ExplorationRestriction } from '../lib/valheim/explored-map'
import { useMarkerProgressStore } from '../store/marker-progress-store'

export interface CraftFilterEntry {
  planId: string
  name: string
  icon: string | null
}

type FilterRailProps = {
  exploration?: ExplorationRestriction
  openMarkerCustomizationOnMount?: boolean
  onMarkerCustomizationOpened?: () => void
  customMarkerWorldKey?: string
  activeFilters: ReadonlySet<string>
  selectedBiomes: readonly string[]
  onSetBiomes: (next: string[] | ((current: string[]) => string[])) => void
  counts: ReadonlyMap<string, number>
  foundCounts: ReadonlyMap<string, number>
  shown: number
  onToggle: (key: string) => void
  onSetMany: (keys: string[], active: boolean) => void
  onShowOnly: (keys: string[]) => void
  onClose: () => void
  /** The player's own map pins, per pin type. */
  pins?: {
    types: Array<{ key: string; count: number; active: boolean }>
    onToggle: (key: string) => void
    onSetAll: (active: boolean) => void
    onShowOnly?: (key: string) => void
    onShowOnlyGroup?: () => void
  }
  /** The player's tracked chests as one on/off layer. */
  containers?: {
    /** Why the list is empty: tracking off, waiting for the mod, or genuinely none yet. */
    status?: 'off' | 'waiting' | 'live' | 'remembered'
    count: number
    active: boolean
    onToggle: () => void
    onSet?: (active: boolean) => void
    onShowOnly?: () => void
    /** Set when chests were seen but belong to another world than the map shows. */
    otherWorld: boolean
  }
  friendContainers?: {
    count: number
    active: boolean
    onSet: (active: boolean) => void
    onShowOnly: () => void
  }
  /** Compact non-location map layers such as structures and live creatures. */
  mapLayers?: Array<{
    key: string
    kind: 'structures' | 'creatures'
    titleKey: string
    hintKey: string
    help?: {
      labelKey: string
      textKey: string
    }
    statusKey?: string
    count: number
    active: boolean
    onSet: (active: boolean) => void
    onShowOnly?: () => void
    options?: Array<{
      key: string
      label: string
      count: number
      active: boolean
      prefabs: string[]
    }>
    onSetOption?: (prefabs: readonly string[], active: boolean) => void
    onSetAllOptions?: (active: boolean) => void
  }>
  /** Crafts that can temporarily take over the map as a source filter. */
  crafting?: {
    entries: CraftFilterEntry[]
    activePlanId: string | null
    onSelect: (planId: string | null) => void
  }
  resources?: {
    available: boolean
    loading: boolean
    predicted?: boolean
    predictionError?: boolean
    options: Array<{ key: string; label: string; icon: string | null; count: number; predictedCount?: number; active: boolean; color: string | null }>
    onHover: (key: string | null) => void
    onToggle: (key: string) => void
    onSetAll: (active: boolean) => void
  }
}

const openGroupStorageKey = 'valheim-companion:filters:open-group'
/** The two sections that are not location groups but share the accordion. */
const CRAFTING_SECTION = 'crafting'
const PINS_SECTION = 'pins'
const NEARBY_CREATURES_SECTION = 'nearby-creatures'
const RESOURCES_SECTION = 'resources'
const BIOMES_SECTION = 'biomes'
/** Everything the accordion accepts; the empty string means all collapsed. */
const SECTION_KEYS: ReadonlySet<string> = new Set([
  '',
  CRAFTING_SECTION,
  PINS_SECTION,
  NEARBY_CREATURES_SECTION,
  RESOURCES_SECTION,
  BIOMES_SECTION,
  ...LOCATION_FILTER_GROUPS.map((group) => group.key),
])

/** The game's boss map sprite, shaped like a lucide icon so the rows stay uniform. */
const BossIcon = ({ size, className }: { size?: number; className?: string; strokeWidth?: number }) => (
  <img
    src={MAP_ICONS.boss}
    alt=""
    draggable={false}
    width={size}
    height={size}
    className={cn('object-contain', className)}
    style={{ width: size, height: size }}
    aria-hidden="true"
  />
)

const iconByType = {
  boss: BossIcon,
  dungeon: Castle,
  trader: Store,
  camp: TentTree,
  settlement: House,
  structure: Castle,
  ruin: Landmark,
  lore: MapPin,
  nature: TreePine,
  creature: PawPrint,
}

const iconByGroup = {
  bosses: BossIcon,
  dungeons: Castle,
  npcs: Store,
  'settlements-and-structures': Landmark,
  discoveries: TreePine,
  enemies: Swords,
}

export function FilterRail({
  exploration,
  openMarkerCustomizationOnMount = false,
  onMarkerCustomizationOpened,
  customMarkerWorldKey,
  activeFilters,
  selectedBiomes,
  onSetBiomes,
  counts,
  foundCounts,
  shown,
  onToggle,
  onSetMany,
  onShowOnly,
  onClose,
  crafting,
  pins,
  containers,
  friendContainers,
  mapLayers,
  resources,
}: FilterRailProps) {
  const { t, i18n } = useTranslation()
  const hideFound = useMarkerProgressStore(state => state.hideFound)
  const hideFavorites = useMarkerProgressStore(state => state.hideFavorites)
  const setHideFound = useMarkerProgressStore(state => state.setHideFound)
  const setHideFavorites = useMarkerProgressStore(state => state.setHideFavorites)
  const progressCount = (key: string, total = counts.get(key) ?? 0) => (
    <span title={t('markerProgress.count', { found: foundCounts.get(key) ?? 0, total })}>
      <span className="text-emerald-300">{(foundCounts.get(key) ?? 0).toLocaleString(i18n.language)}</span>
      <span className="mx-0.5 opacity-60">/</span>{total.toLocaleString(i18n.language)}
    </span>
  )
  const hiddenCustomCategories = useCustomMarkerStore((state) => state.hiddenCategories)
  const customMarkers = useCustomMarkerStore((state) => state.markers)
  const setAllCustomVisible = useCustomMarkerStore((state) => state.setAllVisible)
  const [query, setQuery] = useState('')
  const [markerSizesOpen, setMarkerSizesOpen] = useState(openMarkerCustomizationOnMount)
  useEffect(() => {
    if (openMarkerCustomizationOnMount) onMarkerCustomizationOpened?.()
  }, [openMarkerCustomizationOnMount, onMarkerCustomizationOpened])
  const [creatureQuery, setCreatureQuery] = useState('')
  const [resourceQuery, setResourceQuery] = useState('')
  const [openGroup, setOpenGroup] = useState(() => {
    const storedGroup = window.localStorage.getItem(openGroupStorageKey)
    // A stored empty string is a deliberate collapse-all and has to survive a
    // reload, so membership rather than truthiness decides here.
    return storedGroup !== null && SECTION_KEYS.has(storedGroup) ? storedGroup : PINS_SECTION
  })
  const normalizedQuery = query.trim().toLowerCase()
  const biomeMatches = !normalizedQuery || t('map.biomes').toLowerCase().includes(normalizedQuery)
    || BIOME_FILTER_OPTIONS.some((biome) => biome.label.toLowerCase().includes(normalizedQuery))
  const biomeExpanded = Boolean(normalizedQuery) || openGroup === BIOMES_SECTION
  const allBiomesSelected = ALL_BIOME_KEYS.every((key) => selectedBiomes.includes(key))
  const allFilters = useMemo(
    () => LOCATION_FILTER_GROUPS.flatMap((group) => group.filters),
    [],
  )
  const allActive = allFilters.every((filter) => activeFilters.has(filter.key))
  const noneActive = allFilters.every((filter) => !activeFilters.has(filter.key))
  const allPinsActive = !pins || pins.types.length === 0 || pins.types.every((type) => type.active)
  const noPinsActive = !pins || pins.types.length === 0 || pins.types.every((type) => !type.active)
  const allContainersActive = !containers || containers.count === 0 || containers.active
  const noContainersActive = !containers || containers.count === 0 || !containers.active
  const allMapLayersActive = !mapLayers || mapLayers.every((layer) =>
    layer.active && (!layer.options || layer.options.length === 0 || layer.options.every((option) => option.active)))
  const noMapLayersActive = !mapLayers || mapLayers.every((layer) =>
    !layer.active || Boolean(layer.options?.length && layer.options.every((option) => !option.active)))
  const activeResourceCount = resources?.options.filter((option) => option.active).length ?? 0
  const resourceSelectionLimit = Math.min(MAX_SELECTED_RESOURCE_MATERIALS, resources?.options.length ?? 0)
  const resourceSelectionFull = resourceSelectionLimit > 0 && activeResourceCount >= resourceSelectionLimit
  const allResourcesActive = !resources || resources.options.length === 0 || resourceSelectionFull
  const noResourcesActive = !resources || resources.options.every((option) => !option.active)

  const usedCustomCategories = new Set(customMarkers.filter((marker) => marker.worldKey === customMarkerWorldKey
    && isMapPointVisible(exploration, marker.x, marker.z)).map((marker) => marker.category))
  const allCustomActive = [...usedCustomCategories].every((category) => !hiddenCustomCategories.includes(category))
  const noCustomActive = [...usedCustomCategories].every((category) => hiddenCustomCategories.includes(category))
  const everythingActive = allActive && allBiomesSelected && allPinsActive && allContainersActive && allMapLayersActive && allResourcesActive && allCustomActive && (!friendContainers || friendContainers.active)
  const nothingActive = noneActive && noPinsActive && noContainersActive && noMapLayersActive && noResourcesActive && noCustomActive && (!friendContainers || !friendContainers.active)
  const allYourPinsActive = allPinsActive && allContainersActive && allMapLayersActive && (!friendContainers || friendContainers.active)
  const noYourPinsActive = noPinsActive && noContainersActive && noMapLayersActive && (!friendContainers || !friendContainers.active)
  const yourPinsCount = (pins?.types.reduce((total, type) => total + type.count, 0) ?? 0)
    + (containers?.count ?? 0)
    + (friendContainers?.count ?? 0)
    + (mapLayers?.reduce((total, layer) => total + layer.count, 0) ?? 0)

  const setYourPinsActive = (active: boolean) => {
    friendContainers?.onSet(active)
    pins?.onSetAll(active)
    if (containers) {
      if (containers.onSet) containers.onSet(active)
      else if (containers.active !== active) containers.onToggle()
    }
    mapLayers?.forEach((layer) => {
      layer.onSet(active)
      layer.onSetAllOptions?.(active)
    })
  }

  const toggleGroup = (groupKey: string, expanded: boolean) => {
    const nextGroup = expanded ? '' : groupKey
    setOpenGroup(nextGroup)
    window.localStorage.setItem(openGroupStorageKey, nextGroup)
  }
  // Both sections hide themselves while a search is running, so unlike the
  // location groups they never have to expand to reveal a match.
  const craftingExpanded = openGroup === CRAFTING_SECTION
  const pinsExpanded = openGroup === PINS_SECTION
  const nearbyCreaturesExpanded = openGroup === NEARBY_CREATURES_SECTION
  const resourcesExpanded = Boolean(normalizedQuery) || openGroup === RESOURCES_SECTION
  const resourceGroupMatches = t('map.resources.title').toLowerCase().includes(normalizedQuery)
  const resourceMatches = resources?.options.filter((option) =>
    (resourceGroupMatches || option.label.toLowerCase().includes(normalizedQuery))
    && option.label.toLowerCase().includes(resourceQuery.trim().toLowerCase())) ?? []

  const renderFilter = (filter: LocationFilterDefinition) => {
    const active = activeFilters.has(filter.key)
    const Icon = iconByType[filter.icon]
    const markerVisual = filter.key.startsWith('type:')
      ? LOCATION_MARKER_STYLES[filter.key as MarkerCategory]?.visual
      : undefined
    return (
      <div
        key={filter.key}
        className={cn(
          'group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
          active ? 'hover:bg-white/5' : 'opacity-70 hover:bg-white/5 hover:opacity-100',
        )}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
          onClick={() => onToggle(filter.key)}
          aria-pressed={active}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)]">
            {markerVisual ? (
              <LocationMarkerVisual visual={markerVisual} size={13} className="text-white" />
            ) : (
              <Icon size={11} strokeWidth={2.5} aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] font-normal text-[var(--text)]/90">
            {t(filter.labelKey)}
          </span>
        </button>
        <button
          type="button"
          tabIndex={-1}
          onClick={() => onShowOnly([filter.key])}
          className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)] group-hover/filter:block"
        >
          {t('filters.only')}
        </button>
        <span className="text-[11px] tabular-nums text-[var(--muted)]">
          {progressCount(filter.key)}
        </span>
        <button
          type="button"
          className={cn(
            'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
            active
              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
              : 'border-zinc-500 hover:border-zinc-400',
          )}
          onClick={() => onToggle(filter.key)}
          aria-label={t('filters.toggle', { category: t(filter.labelKey) })}
          aria-pressed={active}
        >
          {active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
        </button>
      </div>
    )
  }

  if (markerSizesOpen) return <MapMarkerSizePanel onBack={() => setMarkerSizesOpen(false)} />

  return (
    <aside className="pointer-events-auto flex max-h-full w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-background)] shadow-2xl shadow-black/40 backdrop-blur-xl">
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--border)] px-4 py-3">
        <SlidersHorizontal size={16} className="text-[var(--accent-text)]" aria-hidden="true" />
        <h2 className="flex-1 text-sm font-semibold text-[var(--text)]">{t('filters.title')}</h2>
        <span className="flex items-center gap-1 rounded-full bg-white/8 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--text)]">
          <MapPin size={11} className="text-[var(--accent-text)]" aria-hidden="true" />
          {shown.toLocaleString(i18n.language)}
        </span>
        <button type="button" onClick={() => setMarkerSizesOpen(true)} aria-label={t('filters.markerSizes')}
          title={t('filters.markerSizes')} aria-controls="map-marker-size-panel"
          className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <Settings size={15} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="grid size-7 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]"
          aria-label={t('filters.collapse')}
        >
          <PanelLeftClose size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="flex shrink-0 items-center gap-2 px-4 pt-3">
        <button
          type="button"
          disabled={everythingActive}
          onClick={() => {
            setAllCustomVisible(true)
            onSetBiomes([...ALL_BIOME_KEYS])
            onSetMany(allFilters.map((filter) => filter.key), true)
            friendContainers?.onSet(true)
            pins?.onSetAll(true)
            if (containers) {
              if (containers.onSet) containers.onSet(true)
              else if (!containers.active) containers.onToggle()
            }
            mapLayers?.forEach((layer) => {
              layer.onSet(true)
              layer.onSetAllOptions?.(true)
            })
            resources?.onSetAll(true)
          }}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-white/5 px-2 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/5"
        >
          <Eye size={13} aria-hidden="true" /> {t('filters.showAll')}
        </button>
        <button
          type="button"
          disabled={nothingActive}
          onClick={() => {
            setAllCustomVisible(false)
            onSetMany(allFilters.map((filter) => filter.key), false)
            friendContainers?.onSet(false)
            pins?.onSetAll(false)
            if (containers) {
              if (containers.onSet) containers.onSet(false)
              else if (containers.active) containers.onToggle()
            }
            mapLayers?.forEach((layer) => {
              layer.onSet(false)
              layer.onSetAllOptions?.(false)
            })
            resources?.onSetAll(false)
          }}
          className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-white/5 px-2 py-1.5 text-[12px] font-medium text-[var(--text)] transition-colors hover:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-white/5"
        >
          <EyeOff size={13} aria-hidden="true" /> {t('filters.hideAll')}
        </button>
      </div>

      <div className="flex shrink-0 items-stretch gap-2 px-4 pt-2">
        <button type="button" onClick={() => setHideFound(!hideFound)} aria-pressed={hideFound}
          className={cn('flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white',
            hideFound ? 'border-emerald-400/50 bg-white/5 text-emerald-300' : 'border-[var(--border)] text-[var(--text)]')}>
          <CheckCheck size={13} className="shrink-0" aria-hidden="true" />{t('markerProgress.hideFound')}
        </button>
        <button type="button" onClick={() => setHideFavorites(!hideFavorites)} aria-pressed={hideFavorites}
          className={cn('flex min-w-0 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-2 py-1.5 text-xs font-medium transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-white',
            hideFavorites ? 'border-sky-400/50 bg-white/5 text-sky-300' : 'border-[var(--border)] text-[var(--text)]')}>
          <Star size={13} className="shrink-0" aria-hidden="true" />{t('markerProgress.hideFavorites')}
        </button>
      </div>

      <div className="shrink-0 px-4 pb-2 pt-2">
        <label className="flex items-center gap-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-2.5 py-1.5 transition-colors focus-within:border-[var(--accent)]">
          <Search size={14} className="text-[var(--muted)]" aria-hidden="true" />
          <span className="sr-only">{t('filters.findCategory')}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('filters.findCategory')}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
          />
          {query ? (
            <button type="button" onClick={() => setQuery('')} className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-full text-[var(--muted)] hover:text-[var(--text)]" aria-label={t('filters.clearSearch')}>
              <X size={13} aria-hidden="true" />
            </button>
          ) : null}
        </label>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-1">
        <div className="flex w-[calc(17rem_-_2px)] flex-col">
          {biomeMatches ? (
            <section className="border-b border-[var(--border)]/60">
              <div className="group/header flex items-center gap-1">
                <button type="button" onClick={() => onSetBiomes(allBiomesSelected ? [] : [...ALL_BIOME_KEYS])}
                  aria-label={t('filters.toggleGroup', { group: t('map.biomes') })}
                  aria-pressed={allBiomesSelected}
                  className={cn('grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
                    allBiomesSelected
                      ? 'cursor-pointer border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : selectedBiomes.length > 0
                        ? 'cursor-pointer border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'cursor-pointer border-zinc-500 hover:border-zinc-400')}>
                  {allBiomesSelected ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                  {!allBiomesSelected && selectedBiomes.length > 0 ? <Minus size={11} strokeWidth={3} aria-hidden="true" /> : null}
                </button>
                <button type="button" onClick={() => toggleGroup(BIOMES_SECTION, biomeExpanded)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left" aria-expanded={biomeExpanded}>
                  <TreePine size={15} className="text-[var(--text)]/90" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">{t('map.biomes')}</span>
                </button>
                <button type="button" onClick={() => toggleGroup(BIOMES_SECTION, biomeExpanded)}
                  className="flex cursor-pointer items-center gap-1.5" aria-expanded={biomeExpanded}>
                  <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                    {allBiomesSelected ? t('map.allBiomes') : selectedBiomes.length}
                  </span>
                  <ChevronDown size={15} className={cn('text-[var(--muted)] transition-transform', biomeExpanded && 'rotate-180')} aria-hidden="true" />
                </button>
              </div>
              {biomeExpanded ? (
                <div className="flex flex-col gap-0.5 pb-2 pl-1">
                  <p className="px-2 pb-1 text-[11px] leading-4 text-[var(--muted)]">{t('filters.biomeHint')}</p>
                  {[
                    { key: '', label: t('map.allBiomes') },
                    ...BIOME_FILTER_OPTIONS.map((biome) => ({ key: biome.key, label: biome.label })),
                  ].filter((biome) => !normalizedQuery || t('map.biomes').toLowerCase().includes(normalizedQuery) || biome.label.toLowerCase().includes(normalizedQuery)).map((biome) => {
                    const active = biome.key ? !allBiomesSelected && selectedBiomes.includes(biome.key) : allBiomesSelected
                    const toggle = () => onSetBiomes((current) => biome.key
                      ? ALL_BIOME_KEYS.every((key) => current.includes(key))
                        ? [biome.key]
                        : current.includes(biome.key) ? current.filter((key) => key !== biome.key) : [...current, biome.key]
                      : ALL_BIOME_KEYS.every((key) => current.includes(key)) ? [] : [...ALL_BIOME_KEYS])
                    return (
                      <div key={biome.key} className={cn('group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
                        active ? 'hover:bg-white/5' : 'opacity-70 hover:bg-white/5 hover:opacity-100')}>
                        <button type="button" onClick={toggle} aria-pressed={active}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
                          <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)] text-[var(--text)]">
                            <TreePine size={11} strokeWidth={2.5} aria-hidden="true" />
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-normal text-[var(--text)]/90">{biome.label}</span>
                        </button>
                        <button type="button" onClick={toggle} aria-pressed={active}
                          aria-label={t('filters.toggle', { category: biome.label })}
                          className={cn('grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                            active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-zinc-500 hover:border-zinc-400')}>
                          {active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
          {customMarkerWorldKey ? <CustomMarkerFilters worldKey={customMarkerWorldKey} query={normalizedQuery} exploration={exploration} /> : null}
          {resources && (!normalizedQuery || resourceGroupMatches || resourceMatches.length > 0) ? (
            <section className="border-b border-[var(--border)]/60">
              <div className="group/header flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                    resourceSelectionFull
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : activeResourceCount > 0
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-zinc-500 hover:border-zinc-400',
                  )}
                  onClick={() => resources.onSetAll(!resourceSelectionFull)}
                  aria-label={t('filters.toggleGroup', { group: t('map.resources.title') })}
                  disabled={resources.options.length === 0}
                >
                  {resourceSelectionFull
                    ? <Check size={11} strokeWidth={3} aria-hidden="true" />
                    : activeResourceCount > 0 ? <Minus size={11} strokeWidth={3} aria-hidden="true" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(RESOURCES_SECTION, resourcesExpanded)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
                  aria-expanded={resourcesExpanded}
                >
                  <Pickaxe size={15} className="text-[var(--text)]/90" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">{t('map.resources.title')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(RESOURCES_SECTION, resourcesExpanded)}
                  className="flex cursor-pointer items-center gap-1.5"
                  aria-expanded={resourcesExpanded}
                  aria-label={t('filters.toggleSection', { section: t('map.resources.title') })}
                >
                  <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                    {activeResourceCount}/{resourceSelectionLimit}
                  </span>
                  <ChevronDown size={15} className={cn('text-[var(--muted)] transition-transform', resourcesExpanded && 'rotate-180')} aria-hidden="true" />
                </button>
              </div>
              {resourcesExpanded ? (
                <div className="flex flex-col gap-0.5 pb-2 pl-1">
                  {resources.loading ? <p role="status" className="px-2 py-1 text-[11px] leading-snug text-[var(--muted)]">{t('map.resources.statusLoading')}</p> : null}
                  {resources.predictionError ? <p role="status" className="px-2 py-1 text-[11px] leading-snug text-[var(--muted)]">{t('map.resources.predictionError')}</p> : null}
                  {resources.predicted ? <p className="px-2 py-1 text-[11px] leading-snug text-[var(--muted)]">{t('map.resources.predictionHint')}</p> : null}
                  {resources.options.length ? (
                    <>
                      {!normalizedQuery ? (
                        <label className="mx-1 my-1 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-black/25 px-2.5 py-1.5 focus-within:border-[var(--accent)]">
                          <Search size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
                          <span className="sr-only">{t('map.resources.findType')}</span>
                          <input
                            value={resourceQuery}
                            onChange={(event) => setResourceQuery(event.target.value)}
                            placeholder={t('map.resources.findType')}
                            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                          />
                        </label>
                      ) : null}
                      <p className="px-2 py-1 text-[11px] text-[var(--muted)]">
                        {t('map.resources.selectionLimit')}
                      </p>
                      {resourceMatches.map((option) => (
                        <div key={option.key} onPointerEnter={() => resources.onHover(option.active ? option.key : null)} onPointerLeave={() => resources.onHover(null)} onFocus={() => resources.onHover(option.active ? option.key : null)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) resources.onHover(null) }} className={cn(
                          'group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
                          option.active ? 'bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]' : 'opacity-70 hover:bg-white/5 hover:opacity-100',
                        )}>
                          <button type="button" onClick={() => resources.onToggle(option.key)} aria-pressed={option.active} aria-label={t('filters.toggle', { category: option.label })} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
                            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-[var(--border-strong)] bg-[var(--surface-raised)]">
                              {option.icon ? <img src={option.icon} alt="" className="size-4 object-contain" /> : <Pickaxe size={11} strokeWidth={2.5} aria-hidden="true" />}
                            </span>
                            {option.color ? <span className="size-2 shrink-0 rounded-full ring-1 ring-black/40" style={{ backgroundColor: option.color, boxShadow: `0 0 7px ${option.color}` }} aria-hidden="true" /> : null}
                            <span className="min-w-0 flex-1 truncate text-[12px] font-normal text-[var(--text)]/90">{option.label}</span>
                          </button>
                          <span className="text-[11px] tabular-nums text-[var(--muted)]">
                            {option.predictedCount ? '≈ ' : ''}
                            {option.count.toLocaleString(i18n.language)}
                          </span>
                          <button
                            type="button"
                            onClick={() => resources.onToggle(option.key)}
                            aria-label={t('filters.toggle', { category: option.label })}
                            aria-pressed={option.active}
                            className={cn('grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                              option.active ? 'text-[var(--accent-contrast)]' : 'border-zinc-500 hover:border-zinc-400')}
                            style={option.color ? { borderColor: option.color, backgroundColor: option.color } : undefined}
                          >
                            {option.active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                          </button>
                        </div>
                      ))}
                      {resourceMatches.length === 0 ? <p className="px-2 py-3 text-[11px] text-[var(--muted)]">{t('map.resources.noMatch')}</p> : null}
                    </>
                  ) : !resources.loading && !resources.predictionError ? (
                    <p className="px-1 text-[11px] leading-snug text-[var(--muted)]">{t(resources.loading
                      ? 'map.resources.statusLoading'
                      : resources.available ? 'map.resources.statusNone' : 'map.resources.statusNoWorld')}</p>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}
          {crafting && crafting.entries.length > 0 && !normalizedQuery ? (
            <section className="order-last border-b border-[var(--border)]/60">
              <div className="group/header flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                    crafting.activePlanId
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'border-zinc-500 hover:border-zinc-400',
                  )}
                  onClick={() => crafting.onSelect(crafting.activePlanId ? null : crafting.entries[0]?.planId ?? null)}
                  aria-label={t('filters.toggleGroup', { group: t('filters.crafting.title') })}
                >
                  {crafting.activePlanId ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(CRAFTING_SECTION, craftingExpanded)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
                  aria-expanded={craftingExpanded}
                >
                  <Hammer size={15} className="text-[var(--text)]/90" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
                    {t('filters.crafting.title')}
                  </span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => {
                    onShowOnly([])
                    crafting.onSelect(crafting.entries[0]?.planId ?? null)
                  }}
                  className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)] group-hover/header:block"
                >
                  {t('filters.only')}
                </button>
                {crafting.activePlanId ? (
                  <button
                    type="button"
                    onClick={() => crafting.onSelect(null)}
                    className="cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)]"
                  >
                    {t('filters.crafting.clear')}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => toggleGroup(CRAFTING_SECTION, craftingExpanded)}
                  className="flex cursor-pointer items-center gap-1.5"
                  aria-expanded={craftingExpanded}
                  aria-label={t('filters.toggleSection', { section: t('filters.crafting.title') })}
                >
                  <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                    {crafting.entries.length.toLocaleString(i18n.language)}
                  </span>
                  <ChevronDown
                    size={15}
                    className={cn('text-[var(--muted)] transition-transform', craftingExpanded && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
              </div>
              {craftingExpanded ? (
                <div className="flex flex-col gap-0.5 pb-2 pl-1">
                  {crafting.entries.map((entry) => {
                    const active = crafting.activePlanId === entry.planId
                    return (
                      <div
                        key={entry.planId}
                        className={cn(
                          'group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
                          active ? 'hover:bg-white/5' : 'opacity-70 hover:bg-white/5 hover:opacity-100',
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                          onClick={() => crafting.onSelect(active ? null : entry.planId)}
                          aria-pressed={active}
                          title={t('filters.crafting.select', { name: entry.name })}
                        >
                          <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 text-[var(--muted)]">
                            {entry.icon
                              ? <img src={entry.icon} alt="" className="size-6 object-contain" />
                              : <Hammer size={12} strokeWidth={2.5} aria-hidden="true" />}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[12px] font-normal text-[var(--text)]/90">
                            {entry.name}
                          </span>
                        </button>
                        <button
                          type="button"
                          tabIndex={-1}
                          onClick={() => {
                            onShowOnly([])
                            crafting.onSelect(entry.planId)
                          }}
                          className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)] group-hover/filter:block"
                        >
                          {t('filters.only')}
                        </button>
                        <button
                          type="button"
                          className={cn(
                            'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                            active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-zinc-500 hover:border-zinc-400',
                          )}
                          onClick={() => crafting.onSelect(active ? null : entry.planId)}
                          aria-label={t('filters.crafting.select', { name: entry.name })}
                          aria-pressed={active}
                        >
                          {active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                        </button>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </section>
          ) : null}
          {containers && !pins && !normalizedQuery ? (
            <section className="border-b border-[var(--border)]/60">
              <div className="group/header flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                    containers.active
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : 'border-zinc-500 hover:border-zinc-400',
                  )}
                  onClick={containers.onToggle}
                  aria-label={t('filters.toggle', { category: t('map.containers.title') })}
                  aria-pressed={containers.active}
                >
                  {containers.active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                </button>
                <button
                  type="button"
                  onClick={containers.onToggle}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
                  aria-pressed={containers.active}
                  title={containers.otherWorld ? t('map.containers.otherWorld') : t('map.containers.hint')}
                >
                  <Archive size={15} className="text-[var(--text)]/90" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
                    {t('map.containers.title')}
                  </span>
                  {containers.otherWorld ? (
                    <span className="truncate text-[10px] text-[var(--muted)]">{t('map.containers.otherWorld')}</span>
                  ) : null}
                </button>
                {containers.onShowOnly ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => containers.onShowOnly?.()}
                    className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)] group-hover/header:block"
                  >
                    {t('filters.only')}
                  </button>
                ) : null}
                <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                  {containers.count.toLocaleString(i18n.language)}
                </span>
              </div>
              {containers.count === 0 ? (
                <p className="px-2 pb-2 text-[11px] leading-snug text-[var(--muted)]">
                  {t(containers.status === 'off'
                    ? 'map.containers.statusOff'
                    : containers.status === 'waiting'
                      ? 'map.containers.statusWaiting'
                      : 'map.containers.statusNone')}
                </p>
              ) : null}
            </section>
          ) : null}
          {!pins && !normalizedQuery ? mapLayers?.filter(layer => layer.kind !== 'structures' || layer.count > 0).map((layer) => {
            const Icon = layer.kind === 'structures' ? Hammer : PawPrint
            const expandable = Boolean(layer.options && layer.onSetOption && layer.onSetAllOptions)
            const expanded = expandable && nearbyCreaturesExpanded
            const normalizedCreatureQuery = creatureQuery.trim().toLowerCase()
            const visibleOptions = layer.options?.filter((option) =>
              !normalizedCreatureQuery || option.label.toLowerCase().includes(normalizedCreatureQuery)) ?? []
            const activeOptionCount = layer.options?.filter((option) => option.active).length ?? 0
            return (
              <section key={layer.key} className="border-b border-[var(--border)]/60">
                <div className="group/header flex items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] border transition-colors',
                      layer.active
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : 'border-zinc-500 hover:border-zinc-400',
                    )}
                    onClick={() => layer.onSet(!layer.active)}
                    aria-label={t('filters.toggle', { category: t(layer.titleKey) })}
                    aria-pressed={layer.active}
                  >
                    {layer.active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                  </button>
                  <button
                    type="button"
                    onClick={() => expandable
                      ? toggleGroup(NEARBY_CREATURES_SECTION, expanded)
                      : layer.onSet(!layer.active)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
                    aria-pressed={expandable ? undefined : layer.active}
                    aria-expanded={expandable ? expanded : undefined}
                    title={t(layer.hintKey)}
                  >
                    <Icon size={15} className="text-[var(--text)]/90" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
                      {t(layer.titleKey)}
                    </span>
                  </button>
                  {layer.onShowOnly ? (
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={layer.onShowOnly}
                      className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)] group-hover/header:block"
                    >
                      {t('filters.only')}
                    </button>
                  ) : null}
                  {expandable ? (
                    <button
                      type="button"
                      onClick={() => toggleGroup(NEARBY_CREATURES_SECTION, expanded)}
                      className="flex cursor-pointer items-center gap-1.5"
                      aria-expanded={expanded}
                      aria-label={t('filters.toggleSection', { section: t(layer.titleKey) })}
                    >
                      <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                        {layer.count.toLocaleString(i18n.language)}
                      </span>
                      <ChevronDown
                        size={15}
                        className={cn('text-[var(--muted)] transition-transform', expanded && 'rotate-180')}
                        aria-hidden="true"
                      />
                    </button>
                  ) : (
                    <span className="rounded-[var(--radius-full)] bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                      {layer.count.toLocaleString(i18n.language)}
                    </span>
                  )}
                </div>
                {layer.count === 0 && layer.statusKey ? (
                  <p className="px-2 pb-2 text-[11px] leading-snug text-[var(--muted)]">{t(layer.statusKey)}</p>
                ) : null}
                {expanded ? (
                  <div className="space-y-1.5 pb-2 pl-1 pt-0.5">
                    {layer.help ? (
                      <div className="group/help relative ml-1 w-fit">
                        <button
                          type="button"
                          aria-describedby={`${layer.key}-help-tooltip`}
                          className="cursor-help text-[10.5px] font-medium text-[var(--text)]/80 underline decoration-[var(--muted)] underline-offset-2 hover:text-[var(--text)]"
                        >
                          {t(layer.help.labelKey)}
                        </button>
                        <div
                          id={`${layer.key}-help-tooltip`}
                          role="tooltip"
                          className="pointer-events-none invisible absolute left-0 top-full z-50 mt-1.5 w-64 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-2 text-[10.5px] leading-relaxed text-[var(--text)] opacity-0 shadow-2xl transition-opacity group-hover/help:visible group-hover/help:opacity-100 group-focus-within/help:visible group-focus-within/help:opacity-100"
                        >
                          {t(layer.help.textKey)}
                        </div>
                      </div>
                    ) : null}
                    <div className="px-1">
                      <label className="flex min-w-0 items-center gap-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-black/25 px-2.5 py-1.5 focus-within:border-[var(--accent)]">
                        <Search size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
                        <span className="sr-only">{t('map.nearbyCreatures.findType')}</span>
                        <input
                          value={creatureQuery}
                          onChange={(event) => setCreatureQuery(event.target.value)}
                          placeholder={t('map.nearbyCreatures.findType')}
                          className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
                        />
                      </label>
                    </div>
                    <div className="flex items-center justify-between gap-2 px-1.5">
                      <span className="text-[10px] font-medium tabular-nums text-[var(--muted)]">
                        {t('map.nearbyCreatures.typeSummary', {
                          visible: activeOptionCount,
                          total: layer.options?.length ?? 0,
                        })}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={activeOptionCount === layer.options?.length}
                          onClick={() => layer.onSetAllOptions?.(true)}
                          className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[10px] font-semibold text-[var(--text)]/80 hover:bg-white/5 hover:text-[var(--text)] disabled:cursor-default disabled:opacity-40"
                        >
                          <Eye size={11} aria-hidden="true" /> {t('filters.showAll')}
                        </button>
                        <button
                          type="button"
                          disabled={activeOptionCount === 0}
                          onClick={() => layer.onSetAllOptions?.(false)}
                          className="flex cursor-pointer items-center gap-1 rounded-[var(--radius-sm)] px-1.5 py-1 text-[10px] font-semibold text-[var(--text)]/80 hover:bg-white/5 hover:text-[var(--text)] disabled:cursor-default disabled:opacity-40"
                        >
                          <EyeOff size={11} aria-hidden="true" /> {t('filters.hideAll')}
                        </button>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto overscroll-contain pr-1">
                      {visibleOptions.map((option) => (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => layer.onSetOption?.(option.prefabs, !option.active)}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-1.5 py-1.5 text-left transition-colors hover:bg-white/5',
                            !option.active && 'text-[var(--muted)]',
                          )}
                          aria-pressed={option.active}
                        >
                          <span className={cn(
                            'grid size-4 shrink-0 place-items-center rounded-[var(--radius-sm)] border transition-colors',
                            option.active
                              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                              : 'border-zinc-500 hover:border-zinc-400',
                          )}>
                            {option.active ? <Check size={10} strokeWidth={3} aria-hidden="true" /> : null}
                          </span>
                          <span className={cn(
                            'min-w-0 flex-1 truncate text-[11.5px]',
                            option.active ? 'text-[var(--text)]/90' : 'text-[var(--muted)]',
                          )}>{option.label}</span>
                          {option.count > 0 ? (
                            <span className="rounded-[var(--radius-full)] bg-white/5 px-1.5 text-[10px] tabular-nums text-[var(--text)]/75">
                              {option.count.toLocaleString(i18n.language)}
                            </span>
                          ) : null}
                        </button>
                      ))}
                      {visibleOptions.length === 0 ? (
                        <p className="px-2 py-3 text-center text-[11px] text-[var(--muted)]">
                          {t('map.nearbyCreatures.noTypeMatch')}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </section>
            )
          }) : null}
          {pins && !normalizedQuery ? (
            <section className="order-first border-b border-[var(--border)]/60">
              <div className="group/header flex items-center gap-1">
                <button
                  type="button"
                  className={cn(
                    'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                    allYourPinsActive
                      ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                      : !noYourPinsActive
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'border-zinc-500 hover:border-zinc-400',
                  )}
                  onClick={() => setYourPinsActive(!allYourPinsActive)}
                  aria-label={t('filters.toggleGroup', { group: t('map.pins.title') })}
                >
                  {allYourPinsActive ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                  {!allYourPinsActive && !noYourPinsActive ? <Minus size={11} strokeWidth={3} aria-hidden="true" /> : null}
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(PINS_SECTION, pinsExpanded)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
                  aria-expanded={pinsExpanded}
                >
                  <MapPinned size={15} className="text-[var(--text)]/90" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
                    {t('map.pins.title')}
                  </span>
                </button>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => pins.onShowOnlyGroup ? pins.onShowOnlyGroup() : pins.onSetAll(true)}
                  className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)] group-hover/header:block"
                >
                  {t('filters.only')}
                </button>
                <button
                  type="button"
                  onClick={() => toggleGroup(PINS_SECTION, pinsExpanded)}
                  className="flex cursor-pointer items-center gap-1.5"
                  aria-expanded={pinsExpanded}
                  aria-label={t('filters.toggleSection', { section: t('map.pins.title') })}
                >
                  <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                    {yourPinsCount.toLocaleString(i18n.language)}
                  </span>
                  <ChevronDown
                    size={15}
                    className={cn('text-[var(--muted)] transition-transform', pinsExpanded && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
              </div>
              {pinsExpanded ? <div className="flex flex-col gap-0.5 pb-2 pl-1">
                {containers && containers.count > 0 ? (
                  <div className={cn(
                    'group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
                    containers.active ? 'hover:bg-white/5' : 'opacity-70 hover:bg-white/5 hover:opacity-100',
                  )}>
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                      onClick={containers.onToggle}
                      aria-pressed={containers.active}
                      title={containers.otherWorld ? t('map.containers.otherWorld') : t('map.containers.hint')}
                    >
                      <Archive size={15} className="shrink-0 text-[var(--text)]/90" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]/90">
                        {t('map.containers.title')}
                      </span>
                    </button>
                    {containers.onShowOnly ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => containers.onShowOnly?.()}
                        className="invisible pointer-events-none cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] group-hover/filter:visible group-hover/filter:pointer-events-auto hover:bg-[var(--surface-hover)]"
                      >
                        {t('filters.only')}
                      </button>
                    ) : null}
                    <span className="text-[11px] tabular-nums text-[var(--muted)]">
                      {containers.count.toLocaleString(i18n.language)}
                    </span>
                    <button
                      type="button"
                      className={cn(
                        'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                        containers.active
                          ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                          : 'border-zinc-500 hover:border-zinc-400',
                      )}
                      onClick={containers.onToggle}
                      aria-label={t('filters.toggle', { category: t('map.containers.title') })}
                      aria-pressed={containers.active}
                    >
                      {containers.active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                    </button>
                  </div>
                ) : null}
                {mapLayers?.filter(layer => layer.kind !== 'structures' || layer.count > 0).map((layer) => {
                  const Icon = layer.kind === 'structures' ? Hammer : PawPrint
                  return (
                    <Fragment key={layer.key}>
                      <div
                        className={cn(
                          'group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
                          layer.active ? 'hover:bg-white/5' : 'opacity-70 hover:bg-white/5 hover:opacity-100',
                        )}
                      >
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                          onClick={() => layer.onSet(!layer.active)}
                          aria-pressed={layer.active}
                          title={t(layer.hintKey)}
                        >
                          <Icon size={15} className="shrink-0 text-[var(--text)]/90" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]/90">
                            {t(layer.titleKey)}
                          </span>
                        </button>
                        {layer.onShowOnly ? (
                          <button
                            type="button"
                            tabIndex={-1}
                            onClick={layer.onShowOnly}
                            className="invisible pointer-events-none cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] group-hover/filter:visible group-hover/filter:pointer-events-auto hover:bg-[var(--surface-hover)]"
                          >
                            {t('filters.only')}
                          </button>
                        ) : null}
                        <span className="text-[11px] tabular-nums text-[var(--muted)]">
                          {layer.count.toLocaleString(i18n.language)}
                        </span>
                        <button
                          type="button"
                          className={cn(
                            'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                            layer.active
                              ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                              : 'border-zinc-500 hover:border-zinc-400',
                          )}
                          onClick={() => layer.onSet(!layer.active)}
                          aria-label={t('filters.toggle', { category: t(layer.titleKey) })}
                          aria-pressed={layer.active}
                        >
                          {layer.active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                        </button>
                      </div>
                      {layer.count === 0 && layer.statusKey ? (
                        <p className="pb-1 pl-8 pr-2 text-[11px] leading-snug text-[var(--muted)]">
                          {t(layer.statusKey)}
                        </p>
                      ) : null}
                    </Fragment>
                  )
                })}
                {friendContainers && friendContainers.count > 0 ? (
                  <div className={cn(
                    'group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
                    friendContainers.active ? 'hover:bg-white/5' : 'opacity-70 hover:bg-white/5 hover:opacity-100',
                  )}>
                    <button type="button" onClick={() => friendContainers.onSet(!friendContainers.active)} aria-pressed={friendContainers.active} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left">
                      <Users size={15} className="shrink-0 text-[var(--text)]/90" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]/90">{t('map.containers.friendsTitle')}</span>
                    </button>
                    <button type="button" onClick={friendContainers.onShowOnly} className="invisible pointer-events-none cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] group-hover/filter:visible group-hover/filter:pointer-events-auto hover:bg-[var(--surface-hover)]">
                      {t('filters.only')}
                    </button>
                    <span className="text-[11px] tabular-nums text-[var(--muted)]">{friendContainers.count.toLocaleString(i18n.language)}</span>
                    <button
                      type="button"
                      onClick={() => friendContainers.onSet(!friendContainers.active)}
                      aria-label={t('filters.toggle', { category: t('map.containers.friendsTitle') })}
                      aria-pressed={friendContainers.active}
                      className={cn('grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                        friendContainers.active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-zinc-500 hover:border-zinc-400')}
                    >
                      {friendContainers.active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                    </button>
                  </div>
                ) : null}
                {pins.types.map((type) => (
                  <div
                    key={type.key}
                    className={cn(
                      'group/filter flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 transition-all',
                      type.active ? 'hover:bg-white/5' : 'opacity-70 hover:bg-white/5 hover:opacity-100',
                    )}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                      onClick={() => pins.onToggle(type.key)}
                      aria-pressed={type.active}
                    >
                      {PIN_TYPE_ICONS[type.key as MapPinType] ? (
                        <img
                          src={PIN_TYPE_ICONS[type.key as MapPinType]}
                          alt=""
                          className="size-4 shrink-0 object-contain drop-shadow-[0_1px_1px_rgba(0,0,0,0.7)]"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text)]/90">
                        {t(`map.pins.types.${type.key}`)}
                      </span>
                    </button>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => pins.onShowOnly ? pins.onShowOnly(type.key) : null}
                      className="invisible pointer-events-none cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] group-hover/filter:visible group-hover/filter:pointer-events-auto hover:bg-[var(--surface-hover)]"
                    >
                      {t('filters.only')}
                    </button>
                    <span className="text-[11px] tabular-nums text-[var(--muted)]">{type.count.toLocaleString(i18n.language)}</span>
                    <button
                      type="button"
                      className={cn(
                        'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                        type.active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-zinc-500 hover:border-zinc-400',
                      )}
                      onClick={() => pins.onToggle(type.key)}
                      aria-label={t('filters.toggle', { category: t(`map.pins.types.${type.key}`) })}
                      aria-pressed={type.active}
                    >
                      {type.active ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                    </button>
                  </div>
                ))}
              </div> : null}
            </section>
          ) : null}
          {LOCATION_FILTER_GROUPS.map((group) => {
          const groupMatches = normalizedQuery && t(group.labelKey).toLowerCase().includes(normalizedQuery)
          const present = group.bulkToggle ? group.filters : group.filters.filter((filter) => (counts.get(filter.key) ?? 0) > 0 || activeFilters.has(filter.key))
          const visible = groupMatches
            ? present
            : present.filter((filter) => t(filter.labelKey).toLowerCase().includes(normalizedQuery))
          if (normalizedQuery && visible.length === 0) return null
          const expanded = normalizedQuery.length > 0 || openGroup === group.key
          const groupActive = group.filters.filter((filter) => activeFilters.has(filter.key)).length
          const groupCount = counts.get(filterGroupCountKey(group.key)) ?? group.filters.reduce(
            (total, filter) => total + (counts.get(filter.key) ?? 0),
            0,
          )
          const GroupIcon = iconByGroup[group.key as keyof typeof iconByGroup]

          return (
            <section key={group.key} className="border-b border-[var(--border)]/60 last:border-b-0">
              <div className="group/header flex items-center gap-1">
                {group.bulkToggle ? (
                  <button
                    type="button"
                    className={cn(
                      'grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border transition-colors',
                      groupActive === group.filters.length
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]'
                        : groupActive === 0
                          ? 'border-zinc-500 hover:border-zinc-400'
                          : 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]',
                    )}
                    onClick={() => onSetMany(group.filters.map((filter) => filter.key), groupActive !== group.filters.length)}
                    aria-label={t('filters.toggleGroup', { group: t(group.labelKey) })}
                  >
                    {groupActive === group.filters.length ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : null}
                    {groupActive > 0 && groupActive < group.filters.length ? <Minus size={11} strokeWidth={3} aria-hidden="true" /> : null}
                  </button>
                ) : (
                  // No all-at-once for this group: the box only clears what is on.
                  <button
                    type="button"
                    disabled={groupActive === 0}
                    className={cn(
                      'grid size-4 shrink-0 place-items-center rounded-[5px] border transition-colors',
                      groupActive > 0
                        ? 'cursor-pointer border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-text)]'
                        : 'cursor-default border-zinc-700 opacity-50',
                    )}
                    onClick={() => onSetMany(group.filters.map((filter) => filter.key), false)}
                    aria-label={t('filters.clearGroup', { group: t(group.labelKey) })}
                    title={groupActive > 0 ? t('filters.clearGroup', { group: t(group.labelKey) }) : t('filters.noBulkToggle')}
                  >
                    {groupActive > 0 ? <Minus size={11} strokeWidth={3} aria-hidden="true" /> : null}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key, expanded)}
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-2 text-left"
                  aria-expanded={expanded}
                >
                  <GroupIcon size={15} className="text-[var(--text)]/90" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">
                    {t(group.labelKey)}
                  </span>
                </button>
                {group.bulkToggle ? (
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => onShowOnly(group.filters.map((filter) => filter.key))}
                    className="hidden cursor-pointer rounded-[var(--radius-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent-text)] hover:bg-[var(--surface-hover)] group-hover/header:block"
                  >
                    {t('filters.only')}
                  </button>
                ) : null}
                <button type="button" onClick={() => toggleGroup(group.key, expanded)} className="flex cursor-pointer items-center gap-1.5" aria-expanded={expanded}>
                  <span className="rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-[var(--muted)]">
                    {progressCount(filterGroupCountKey(group.key), groupCount)}
                  </span>
                  <ChevronDown
                    size={15}
                    className={cn('text-[var(--muted)] transition-transform', expanded && 'rotate-180')}
                    aria-hidden="true"
                  />
                </button>
              </div>
              {expanded ? <div className="flex flex-col gap-0.5 pb-2 pl-1">{visible.map(renderFilter)}</div> : null}
            </section>
          )
          })}
        </div>
      </div>
    </aside>
  )
}
