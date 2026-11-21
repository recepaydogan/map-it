import { IS_MAP_IT_HOSTED, sidebarLanguage, standaloneSidebarFooter } from '../components/layout/navigation-host'
import { APP_LANGUAGE_OPTIONS } from '../components/layout/app-language-options'
import { useWhatsNewReadState } from '../features/whats-new/use-whats-new-read-state'
import { WHATS_NEW_VERSION } from '../features/whats-new/whats-new-release'
import { ClipboardList, PanelsTopLeft, Warehouse } from 'lucide-react'
import { openCraftCompanion } from '../overwolf-utils/craft-window-launcher'
import NavigationSidebar, { type SidebarItem } from '../components/layout/navigation-sidebar'
import { CHEST_MAP_REQUEST_KEY, readChestMapRequest } from '../lib/crafting/chest-map-request'
import {
  ArrowLeft,
  MapPin,
  MapPinPlus,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OverwolfAdRail } from '../components/ads/overwolf-ad-rail'
import PremiumPlansPanel from '../features/subscriptions/premium-plans-panel'
import { SUBSCRIPTIONS_ENABLED, useSubscription, useSubscriptionLifecycle } from '../features/subscriptions/subscription-runtime'
import { isOverwolf } from '../utils/overwolf'
import { AppHeader, type MainSurface } from '../components/app-header'
import { DatabasePanel } from '../components/database-panel'
import { MapSearchResults } from '../components/map-search-results'
import { ItemSourceContext } from '../components/item-source-context'
import { buildItemAcquisitionCatalog, matchItemLocationSearch, type ItemAcquisitionSource } from '../lib/item-acquisition'
import type { MarkerItemIntel } from '../types/marker-intelligence'
import { FilterRail } from '../components/filter-rail'
import { MAP_SIZE_PX } from '../components/interactive-map-viewport'
import { PlacementRulesMap } from '../components/placement-rules-map'
import { MapSpoilerControl } from '../components/map-spoiler-control'
import { AppToasts } from '../components/app-toasts'
import { TrackerLocateModal } from '../components/tracker-locate-modal'
import { SettingsPanel } from '../components/settings-panel'
import { WorldSelector } from '../components/world-selector'
import { CharacterSelector } from '../components/character-selector'
import { useClientLocations } from '../hooks/use-client-locations.ts'
import { createClientLocationMarkers, mergeClientPins } from '../lib/live-tracking/client-locations.ts'
import { AccountSurface } from '../features/account/account-surface'
import { FaqSurface } from '../features/faq/faq-surface'
import { WhatsNewSurface } from '../features/whats-new/whats-new-surface'
import SupportPage from '../features/support/support-page'
import { useSupportBadges, useSupportWatch } from '../state/use-support'
import { BuildingSurface } from '../features/building/building-surface'
import { BaseOperationsSurface, type OperationMapTarget } from '../features/base-operations/base-operations-surface'
import { PlannerSurface } from '../features/crafting-planner/planner-surface'
import { usePlannerCatalog } from '../features/crafting-planner/hooks/use-planner-catalog'
import { describeSourceContext } from '../features/crafting-planner/source-context-text'
import { useGameData } from '../hooks/use-game-data'
import { useSeedWorld } from '../hooks/use-seed-world'
import { useSeedResources } from '../hooks/use-seed-resources'
import { useWorldSaves } from '../hooks/use-world-saves'
import { useCharacterPins } from '../hooks/use-character-pins'
import { useLocalExploration } from '../hooks/use-local-exploration'
import { filterExploredPoints, isMapPointVisible, type ExplorationRestriction } from '../lib/valheim/explored-map'
import { exploredResourceIndex } from '../lib/valheim/explored-resource-index'
import { saveDiagnostic } from '../lib/valheim/save-diagnostics.ts'
import { resolveSelectedWorldUid } from '../lib/valheim/selected-world-uid.ts'
import { shouldUseBaseFallback } from '../lib/live-tracking/base-fallback.ts'
import { useBaseFallback } from '../hooks/use-base-fallback.ts'
import { OnboardingTour } from '../features/onboarding/onboarding-tour'
import { serveMapMirror } from '../lib/map-mirror'
import { PLAYER_VISIBLE_PIN_TYPES, type CharacterMapPin, type MapPinType } from '../lib/valheim/character-save-format'
import { useLocalizationTable } from '../hooks/use-localization-table'
import { useLiveInventory } from '../hooks/use-live-inventory.ts'
import { useLiveContainers } from '../hooks/use-live-containers.ts'
import { useLivePosition } from '../hooks/use-live-position'
import { useLocationGenerationProfile } from '../hooks/use-location-generation-profile.ts'
import { useNearbyCreatures } from '../hooks/use-nearby-creatures.ts'
import { useNearbyCreatureCatalog } from '../hooks/use-nearby-creature-catalog.ts'
import { setupGameLaunchMonitorSwitch } from '../overwolf-utils/game-launch-monitor-switch'
import { InGameAutoOpenBanner } from '../components/in-game-auto-open-banner'
import {
  ALL_LOCATION_FILTER_KEYS,
  locationMatchesFilters,
} from '../lib/location-filters'
import { buildLocationSearchIndex, buildTextSearchIndex, matchLocationSearch } from '../lib/location-search'
import { collectMapSources } from '../lib/crafting/resolve-acquisition-sources'
import { mergeStock } from '../lib/crafting/allocate-inventory'
import { calculatePlan } from '../lib/crafting/calculate-plan'
import type { GeneratedLocationMarker } from '../lib/valheim/location-generator'
import { buildResourceStateIndex } from '../lib/valheim/resource-state'
import { mergeResourceSources, shouldPredictServerResources } from '../lib/valheim/seed-resources'
import { resourceAreaColor } from '../lib/valheim/resource-area-colors'
import { isResourceFilterMaterial, normalizeResourceSelection, toggleResourceSelection } from '../lib/valheim/resource-selection'
import { createSaveLocationMarkers } from '../lib/valheim/save-location-markers'
import { exploredLocationMarkers, locationsFromSaveOrObservations, mapLocationVisibility } from '../lib/valheim/map-location-source'
import { chooseAutomaticWorld } from '../lib/valheim/world-selection'
import { chooseNewLiveWorld, worldIdentityKey } from '../lib/valheim/known-worlds'
import { useCraftingPlannerStore } from '../store/crafting-planner-store'
import { useMapFilterStore } from '../store/map-filter-store'
import { LOCAL_MAP_SPOILER_CONTROLS_ENABLED } from '../lib/map-features'
import { ALL_BIOME_KEYS, filterMarkersByBiomes } from '../lib/valheim/marker-biome-filter'
import { useCustomMarkerUi } from '../store/custom-marker-ui'
import { useCustomMarkerStore } from '../store/custom-marker-store'
import { useMarkerProgress } from '../hooks/use-marker-progress'
import { countLocationProgress, isProgressMarkerVisible, locationProgressId } from '../lib/marker-progress'
import { useContainerMemoryStore } from '../store/container-memory-store'
import { containersFromSave } from '../lib/live-tracking/container-payload'
import { usePlannerMapSourceStore } from '../store/planner-map-source-store'
import { readPreferences, writePreferences } from '../store/preferences'
import { capturePageview, track, trackSpoilerModeChanged } from '../lib/analytics/analytics'
import { EVENTS } from '../lib/analytics/events'
import type { LocationRecord } from '../types/game-data'
import { findBossPrefab, formatLocationName, locationCategoryLabelKey, locationNameLabelKey } from '../lib/location-presentation'
import type { RememberedContainer } from '../lib/live-tracking/container-types'
import type { PlannerMapSourcePoint } from '../store/planner-map-source-store'
import {
  cleanCreatureLabel,
  normalizeCreaturePrefab,
} from '../lib/live-tracking/creature-catalog.ts'

const noContainersOnMap: readonly RememberedContainer[] = []
const noStructureClusters = [] as const
const noStructurePaths: readonly string[] = []
const WORLD_DIAMETER = 21_000
const ROUTE_FRAME_PX = 420

interface OperationsMapSelection {
  points: PlannerMapSourcePoint[]
  focus: PlannerMapSourcePoint
}

const routeFocus = (points: PlannerMapSourcePoint[], focusId: string): PlannerMapSourcePoint => {
  if (points.length < 2) return { ...points[0], focusId }
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const point of points) {
    minX = Math.min(minX, point.x)
    maxX = Math.max(maxX, point.x)
    minZ = Math.min(minZ, point.z)
    maxZ = Math.max(maxZ, point.z)
  }
  const span = Math.max(maxX - minX, maxZ - minZ, 1)
  return {
    x: (minX + maxX) / 2,
    z: (minZ + maxZ) / 2,
    focusId,
    focusZoom: Math.min(20, Math.max(0.65, ROUTE_FRAME_PX * WORLD_DIAMETER / (span * MAP_SIZE_PX))),
  }
}

export function MainWindow({ inGame = false }: { inGame?: boolean }) {
  const { t, i18n } = useTranslation()
  useSubscriptionLifecycle()
  const subscription = useSubscription()
  const adFree = SUBSCRIPTIONS_ENABLED && subscription.premium
  const waitingForSubscription = SUBSCRIPTIONS_ENABLED && subscription.status === 'loading'
  const premiumPreview = !isOverwolf() && new URLSearchParams(window.location.search).get('previewPremium') === '1'
  const [premiumPlansOpen, setPremiumPlansOpen] = useState(false)
  const closePremiumPlans = useCallback(() => setPremiumPlansOpen(false), [])
  useSupportWatch()
  const { locations, loading, error } = useGameData()
  const [surface, setSurface] = useState<MainSurface>(() => {
    // Browser preview only (?surface=building); Overwolf always starts on the map.
    const requested = new URLSearchParams(window.location.search).get('surface')
    const surfaces: MainSurface[] = ['map', 'database', 'planner', 'operations', 'building', 'settings', 'faq', 'support', 'whats-new']
    return surfaces.find((entry) => entry === requested) ?? 'map'
  })
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [openMarkerCustomizationOnMap, setOpenMarkerCustomizationOnMap] = useState(false)
  const [openCharacterPickerOnMap, setOpenCharacterPickerOnMap] = useState(false)
  const [observedLocationsNoticeDismissed, setObservedLocationsNoticeDismissed] = useState(
    () => readPreferences().observedLocationsNoticeDismissed,
  )
  const [newLocalWorldNoticeDismissedFor, setNewLocalWorldNoticeDismissedFor] = useState<string | null>(null)
  useEffect(() => {
    capturePageview(`/${inGame ? 'in-game' : 'desktop'}/${surface}`)
  }, [inGame, surface])

  const [searchOpen, setSearchOpen] = useState(false)
  const [searchResultsHidden, setSearchResultsHidden] = useState(false)
  const [query, setQuery] = useState('')
  const [searchFocus, setSearchFocus] = useState<{ point: PlannerMapSourcePoint; worldKey: string; query: string; pin?: CharacterMapPin; locationIds?: Set<string> } | null>(null)
  const [itemSourceSelection, setItemSourceSelection] = useState<{
    locationIds: Set<string>; label: string; focus: PlannerMapSourcePoint; worldKey: string; points: PlannerMapSourcePoint[]
  } | null>(null)
  const tracking = useLivePosition()
  const liveInventory = useLiveInventory(tracking.status === 'tracking')
  const seedContainersFromSave = useContainerMemoryStore((state) => state.seedFromSave)
  const [pendingPlannerPrefab, setPendingPlannerPrefab] = useState<string | null>(null)
  const plannerSources = usePlannerMapSourceStore()
  const [operationsMapSelection, setOperationsMapSelection] = useState<OperationsMapSelection | null>(null)
  const operationFocusSequence = useRef(0)
  const [selectedLocation, setSelectedLocation] = useState<{
    location: LocationRecord
    marker: GeneratedLocationMarker | null
  } | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const activeFilterKeys = useMapFilterStore((state) => state.activeFilterKeys)
  const spoilerMode = useMapFilterStore((state) => LOCAL_MAP_SPOILER_CONTROLS_ENABLED ? state.spoilerMode : 'full')
  const showSpoilers = spoilerMode === 'full'
  const setSpoilerMode = useMapFilterStore((state) => state.setSpoilerMode)
  useEffect(() => {
    const syncFilters = (event: StorageEvent) => {
      if (event.key === 'valheim-companion:map-filters') void useMapFilterStore.persist.rehydrate()
    }
    window.addEventListener('storage', syncFilters)
    return () => window.removeEventListener('storage', syncFilters)
  }, [])
  const setActiveFilterKeys = useMapFilterStore((state) => state.setActiveFilterKeys)
  const selectedBiomes = useMapFilterStore((state) => state.selectedBiomes)
  const setSelectedBiomes = useMapFilterStore((state) => state.setSelectedBiomes)
  const activeResourceItems = useMapFilterStore((state) => state.activeResourceItems)
  const setActiveResourceItems = useMapFilterStore((state) => state.setActiveResourceItems)
  const [highlightedResourceItem, setHighlightedResourceItem] = useState<string | null>(null)
  const activeFilters = useMemo(() => new Set(activeFilterKeys), [activeFilterKeys])
  const activePlanTargetCount = useCraftingPlannerStore(
    (state) => state.plans.find((plan) => plan.id === state.activePlanId)?.targets.length ?? 0,
  )
  const [seedName, setSeedName] = useState(() => readPreferences().worldSeed)
  const placingCustomMarker = useCustomMarkerUi((state) => state.placing)
  const setPlacingCustomMarker = useCustomMarkerUi((state) => state.setPlacing)
  const selectCustomMarker = useCustomMarkerUi((state) => state.select)
  useEffect(() => { if (surface !== 'map') setPlacingCustomMarker(false) }, [surface, setPlacingCustomMarker])
  const allCustomMarkers = useCustomMarkerStore((state) => state.markers)
  const [selectedWorldId, setSelectedWorldId] = useState<string | null>(
    () => readPreferences().worldSaveId,
  )
  const [locationProfile, setLocationProfile] = useLocationGenerationProfile(
    selectedWorldId ?? `seed:${seedName}`,
  )
  const initialWorldSelectionResolved = useRef(false)
  const worldSaves = useWorldSaves(selectedWorldId, tracking.status === 'tracking' ? tracking.position : null)
  const lastTrackedWorldKey = useRef<string | null>(null)
  const worldDiscoveryPending = useRef(true)
  const plannerCatalog = usePlannerCatalog()

  useEffect(() => {
    if (worldSaves.discovering) {
      worldDiscoveryPending.current = true
      return
    }
    if (!worldDiscoveryPending.current) return
    worldDiscoveryPending.current = false

    const localWorldCount = worldSaves.worlds.filter((world) => world.source === 'local').length
    const steamCloudWorldCount = worldSaves.worlds.filter((world) => world.source === 'steam-cloud').length
    track(EVENTS.WORLD_SAVES_DISCOVERED, {
      result: worldSaves.discoveryError ? 'error' : worldSaves.worlds.length > 0 ? 'found' : 'empty',
      world_count: worldSaves.worlds.length,
      local_world_count: localWorldCount,
      steam_cloud_world_count: steamCloudWorldCount,
    })
  }, [worldSaves.discovering, worldSaves.discoveryError, worldSaves.worlds])

  // The player's own map pins live in the character save; reload with the world.
  const [pinRefreshToken, setPinRefreshToken] = useState(0)
  const clientLocations = useClientLocations(worldSaves.selectedWorld, tracking.status === 'tracking' ? tracking.position : null)
  const { canToggleSpoilers, observedOnly: observedLocationsOnly } = mapLocationVisibility(
    worldSaves.selectedWorld, clientLocations.snapshot?.isServer, showSpoilers,
  )
  const hideUnexploredLocations = canToggleSpoilers && !showSpoilers
  const showUnexploredTerrain = canToggleSpoilers && spoilerMode === 'terrain'
  const selectedWorldUid = resolveSelectedWorldUid(
    worldSaves.selectedWorld,
    liveInventory.status === 'live' ? liveInventory.snapshot : null,
    tracking.status === 'tracking' ? tracking.position : null,
  ) ?? clientLocations.world?.worldUid ?? null
  const customMarkerWorldKey = selectedWorldUid
    ? `world:${selectedWorldUid}`
    : selectedWorldId ? `save:${selectedWorldId}` : `seed:${seedName}`
  const { found, favorites, hideFound, hideFavorites } = useMarkerProgress(customMarkerWorldKey)
  const containers = useLiveContainers(selectedWorldUid)
  // Chest contents count as owned everywhere the planner counts inventory.
  const inventory = useMemo(
    () => ({ ...liveInventory, stock: mergeStock(liveInventory.stock, containers.stock) }),
    [containers.stock, liveInventory],
  )
  const baseFallbackEnabled = shouldUseBaseFallback(worldSaves.database, worldSaves.discovering, worldSaves.readingDatabase)
  const baseFallback = useBaseFallback(baseFallbackEnabled, worldSaves.selectedWorld, selectedWorldUid,
    tracking.status === 'tracking' && liveInventory.status === 'live'
      && liveInventory.snapshot?.worldUid === selectedWorldUid
      && liveInventory.snapshot?.worldName === worldSaves.selectedWorld?.name
      && liveInventory.snapshot?.seedName === worldSaves.selectedWorld?.seedName)
  // A stale inventory (or one from another world) cannot identify this map's player.
  const activePinInventory = liveInventory.status === 'live' && tracking.status === 'tracking'
    && liveInventory.snapshot?.worldUid === selectedWorldUid
    && liveInventory.snapshot?.worldName === worldSaves.selectedWorld?.name
    && liveInventory.snapshot?.seedName === worldSaves.selectedWorld?.seedName
    && tracking.position?.worldName === worldSaves.selectedWorld?.name
    && tracking.position?.seedName === worldSaves.selectedWorld?.seedName
    ? liveInventory.snapshot : null
  const pinIdentity = clientLocations.snapshot && (!activePinInventory || clientLocations.snapshot.updatedAt >= activePinInventory.updatedAt)
    ? clientLocations.snapshot : activePinInventory
  const lastObservedPinCharacter = useMemo(() => {
    const snapshot = liveInventory.snapshot
    return (liveInventory.status === 'live' || liveInventory.status === 'stale') && snapshot?.characterName
      && snapshot.worldUid === selectedWorldUid
      && snapshot.worldName === worldSaves.selectedWorld?.name
      && snapshot.seedName === worldSaves.selectedWorld?.seedName
      ? { name: snapshot.characterName, updatedAt: snapshot.updatedAt } : null
  }, [liveInventory.snapshot, liveInventory.status, selectedWorldUid, worldSaves.selectedWorld?.name, worldSaves.selectedWorld?.seedName])
  const savedCharacterPins = useCharacterPins(
    selectedWorldUid,
    pinIdentity?.characterName || null,
    pinRefreshToken,
    lastObservedPinCharacter,
    hideUnexploredLocations,
  )
  const liveExploration = useLocalExploration(hideUnexploredLocations, worldSaves.selectedWorld && selectedWorldUid ? {
    uid: selectedWorldUid, name: worldSaves.selectedWorld.name, seedName: worldSaves.selectedWorld.seedName,
    characterId: savedCharacterPins.manualCharacterId || pinIdentity?.characterName ? savedCharacterPins.characterPlayerId : null,
    characterName: savedCharacterPins.manualCharacterId ? savedCharacterPins.characterName
      : pinIdentity?.characterName || (tracking.status === 'tracking' ? null : savedCharacterPins.characterName),
    manualCharacter: Boolean(savedCharacterPins.manualCharacterId),
  } : null, tracking.status !== 'tracking' || clientLocations.snapshot?.isServer === true)
  const exploration: ExplorationRestriction = hideUnexploredLocations
    ? liveExploration.exploration ?? (!savedCharacterPins.manualCharacterId && tracking.status === 'tracking' && !pinIdentity?.characterName
      ? null : savedCharacterPins.exploration) : undefined
  // An explicit saved-character selection stays on that save, even for duplicate names.
  const livePinSnapshot = savedCharacterPins.manualCharacterId ? null : clientLocations.snapshot
  const mergedCharacterPins = mergeClientPins(savedCharacterPins.pins, livePinSnapshot, savedCharacterPins.characterName)
  const characterPins = { ...savedCharacterPins, pins: useMemo(() => filterExploredPoints(mergedCharacterPins, exploration), [mergedCharacterPins, exploration]) }
  const showingLivePins = Boolean(livePinSnapshot && mergedCharacterPins === livePinSnapshot.pins)
  const hiddenPinTypes = useMapFilterStore((state) => state.hiddenPinTypes)
  const showFriendContainers = useMapFilterStore((state) => state.showFriendContainers)
  const setShowFriendContainers = useMapFilterStore((state) => state.setShowFriendContainers)
  const showContainers = useMapFilterStore((state) => state.showContainers)
  const setShowContainers = useMapFilterStore((state) => state.setShowContainers)
  const showStructures = useMapFilterStore((state) => state.showStructures)
  const setShowStructures = useMapFilterStore((state) => state.setShowStructures)
  const showNearbyCreatures = useMapFilterStore((state) => state.showNearbyCreatures)
  const setShowNearbyCreatures = useMapFilterStore((state) => state.setShowNearbyCreatures)
  const nearbyCreatures = useNearbyCreatures(showNearbyCreatures && surface === 'map')
  const nearbyCreatureCatalog = useNearbyCreatureCatalog()
  const setHiddenPinTypes = useMapFilterStore((state) => state.setHiddenPinTypes)
  const visiblePinTypes = useMemo(() => new Set<MapPinType>(
    [...PLAYER_VISIBLE_PIN_TYPES].filter((type) => !hiddenPinTypes.includes(type)),
  ), [hiddenPinTypes])
  const pinTypeCounts = useMemo(() => {
    const counts = new Map<MapPinType, number>()
    for (const pin of characterPins.pins) counts.set(pin.type, (counts.get(pin.type) ?? 0) + 1)
    return counts
  }, [characterPins.pins])
  const localization = useLocalizationTable()
  const translatePinToken = useCallback((token: string) =>
    localization?.[token] ?? localization?.[token.replace(/^\$/, '')] ?? null,
  [localization])
  const translateCreatureToken = useCallback((token: string) => {
    const translated = localization?.[token] ?? localization?.[token.replace(/^\$/, '')]
    return translated ? cleanCreatureLabel(translated) : null
  }, [localization])
  // Tracked chests belong to one world; only draw them on that world's map.
  // The save file knows every chest in the world; the mod only the ones it has
  // seen. Seed the memory from the save, then let live reports take over.
  const ownPlayerIds = characterPins.playerIds
  useEffect(() => {
    const database = worldSaves.database
    const world = worldSaves.selectedWorld
    if (!database || !world?.uid || database.containers.length === 0) return
    seedContainersFromSave(world.uid, world.name, containersFromSave(database.containers, new Set(ownPlayerIds), Date.now()))
  }, [ownPlayerIds, seedContainersFromSave, worldSaves.database, worldSaves.selectedWorld])

  const containersOnThisWorld = useMemo(() => {
    if (containers.containers.length === 0) return noContainersOnMap
    const worldUid = selectedWorldUid
    if (!worldUid || worldUid !== containers.worldUid) return noContainersOnMap
    return filterExploredPoints(containers.containers, exploration)
  }, [containers.containers, containers.worldUid, selectedWorldUid, exploration])
  const visibleContainers = useMemo(() => containersOnThisWorld.filter(container =>
    container.owner === 'own' ? showContainers : showFriendContainers),
  [containersOnThisWorld, showContainers, showFriendContainers])
  const ownContainerCount = containersOnThisWorld.filter(container => container.owner === 'own').length
  const friendContainerCount = containersOnThisWorld.length - ownContainerCount
  const containerName = useCallback((token: string, prefab: string) =>
    (token ? translatePinToken(token) : null) ?? t('planner.containers.chest', { defaultValue: prefab || 'Chest' }),
  [t, translatePinToken])
  const containerItemFor = useCallback((prefab: string) => {
    const item = plannerCatalog.graph?.items.get(prefab.toLowerCase())
    return item ? { name: item.name, icon: item.icon } : null
  }, [plannerCatalog.graph])
  const plannerContainerId = plannerSources.active ? plannerSources.focus?.containerId ?? null : null
  const plannerMapPoints = useMemo(() => filterExploredPoints(plannerSources.points, exploration), [plannerSources.points, exploration])
  const mapContainers = useMemo(() => (visibleContainers.length > 0 || plannerContainerId) ? {
    list: plannerContainerId
      ? containersOnThisWorld.filter(container => visibleContainers.includes(container) || container.id === plannerContainerId)
      : visibleContainers,
    live: containers.status === 'live',
    containerName,
    itemFor: containerItemFor,
    highlightId: plannerContainerId,
    openId: plannerContainerId,
  } : undefined, [containerItemFor, containerName, containers.status, containersOnThisWorld, plannerContainerId, visibleContainers])
  const allStructureClusters = worldSaves.database?.structures ?? baseFallback.geometry?.structures ?? noStructureClusters
  const structureClusters = useMemo(() => filterExploredPoints(allStructureClusters, exploration), [allStructureClusters, exploration])
  const structurePaths = worldSaves.database?.structurePaths ?? baseFallback.geometry?.structurePaths ?? noStructurePaths
  useEffect(() => {
    saveDiagnostic('base.source', { source: worldSaves.database ? 'world-save' : baseFallback.operations ? 'observed-areas' : 'unavailable',
      fallbackEnabled: baseFallbackEnabled, worldUid: selectedWorldUid })
  }, [worldSaves.database, baseFallback.operations, baseFallbackEnabled, selectedWorldUid])
  useEffect(() => {
    saveDiagnostic('map.save-layers', {
      worldUid: selectedWorldUid, savedWorldUid: worldSaves.selectedWorld?.uid ?? null,
      uidSource: worldSaves.selectedWorld?.uid ? 'save' : selectedWorldUid ? 'live-inventory' : 'unresolved',
      source: worldSaves.selectedWorld?.source,
      hasDatabase: Boolean(worldSaves.database), loadingDatabase: worldSaves.readingDatabase,
      databaseError: worldSaves.error, containerWorldUid: containers.worldUid, containerStatus: containers.status,
      totalContainers: containers.containers.length, containersOnWorld: containersOnThisWorld.length,
      ownContainers: ownContainerCount, friendContainers: friendContainerCount,
      visibleContainers: visibleContainers.length, ownPlayerIds: ownPlayerIds.length,
      showContainers, showFriendContainers, showStructures,
      structureClusters: structureClusters.length, structurePaths: structurePaths.length,
      pins: characterPins.pins.length, hiddenPinTypes,
    })
  }, [selectedWorldUid, worldSaves.selectedWorld?.uid, worldSaves.selectedWorld?.source, worldSaves.database,
    worldSaves.readingDatabase, worldSaves.error, containers.worldUid, containers.status,
    containers.containers.length, containersOnThisWorld.length, ownContainerCount, friendContainerCount,
    visibleContainers.length, ownPlayerIds.length, showContainers, showFriendContainers, showStructures,
    structureClusters.length, structurePaths.length, characterPins.pins.length, hiddenPinTypes])
  const nearbyCreaturesOnThisWorld = useMemo(() => {
    const selectedUid = selectedWorldUid
    if (selectedUid && nearbyCreatures.worldUid && selectedUid !== nearbyCreatures.worldUid) return []
    return filterExploredPoints(nearbyCreatures.creatures, exploration)
  }, [nearbyCreatures.creatures, nearbyCreatures.worldUid, selectedWorldUid, exploration])
  const ambientNearbyCreatureSet = useMemo(
    () => new Set(nearbyCreatureCatalog.map((entry) => normalizeCreaturePrefab(entry.prefab))),
    [nearbyCreatureCatalog],
  )
  const ambientNearbyCreaturesOnThisWorld = useMemo(
    () => nearbyCreaturesOnThisWorld.filter((creature) =>
      ambientNearbyCreatureSet.has(normalizeCreaturePrefab(creature.prefab))),
    [ambientNearbyCreatureSet, nearbyCreaturesOnThisWorld],
  )
  // The creature filter is temporarily absent from the UI. If tracking is
  // re-enabled later, do not let an old persisted per-creature filter silently
  // hide markers the user can no longer control.
  const visibleNearbyCreatures = ambientNearbyCreaturesOnThisWorld

  // Loot state of the selected world: which resource nodes still stand, which
  // were picked, and which zones the player has generated.
  const savedResourceIndex = useMemo(() => {
    if (selectedWorldId === null) return null
    const resourceState = worldSaves.database?.resourceState
    const graph = plannerCatalog.graph
    if (!resourceState || !graph) return null
    return buildResourceStateIndex(resourceState, graph.resourceNodes, graph.itemNodes)
  }, [plannerCatalog.graph, selectedWorldId, worldSaves.database])
  const resourceIndex = useMemo(() => exploredResourceIndex(savedResourceIndex, exploration), [savedResourceIndex, exploration])
  const resourceSeedName = worldSaves.selectedWorld?.seedName ?? seedName
  const predictServerResources = shouldPredictServerResources(worldSaves.selectedWorld, clientLocations.snapshot?.isServer)
  const seedResources = useSeedResources(resourceSeedName, predictServerResources && resourceSeedName.trim().length > 0, locationProfile)
  const resourceSources = useMemo(() => mergeResourceSources(resourceIndex, seedResources.points), [resourceIndex, seedResources.points])
  const resourceOptions = useMemo(() => {
    const materials = resourceSources.options
      .filter((entry) => isResourceFilterMaterial(entry.itemPrefab))
    return materials.map((entry) => ({
      key: entry.itemPrefab,
      label: plannerCatalog.graph?.items.get(entry.itemPrefab.toLowerCase())?.name ?? entry.itemPrefab,
      icon: plannerCatalog.graph?.items.get(entry.itemPrefab.toLowerCase())?.icon ?? null,
      count: entry.count,
      predictedCount: entry.predictedCount,
    }))
      .sort((first, second) => first.label.localeCompare(second.label, i18n.language))
  }, [i18n.language, plannerCatalog.graph, resourceSources])
  const availableResourceKeys = useMemo(() => new Set(resourceOptions.map((entry) => entry.key)), [resourceOptions])
  const resourceColorByKey = useMemo(() => new Map(activeResourceItems.map((key, index) => [key, resourceAreaColor(index)])), [activeResourceItems])
  useEffect(() => {
    if (seedResources.loading || seedResources.error || worldSaves.discovering || worldSaves.readingDatabase ||
      (worldSaves.selectedWorld?.databasePath && !resourceIndex)) return
    // Personal exploration can temporarily hide a selected material. Preserve
    // the user's selection so it reappears when that material is discovered.
    if (hideUnexploredLocations || activeResourceItems.every((item) => availableResourceKeys.has(item))) return
    setActiveResourceItems(activeResourceItems.filter((item) => availableResourceKeys.has(item)))
  }, [activeResourceItems, availableResourceKeys, resourceIndex, seedResources.loading, seedResources.error, setActiveResourceItems,
    worldSaves.discovering, worldSaves.readingDatabase, worldSaves.selectedWorld, hideUnexploredLocations])
  const selectedResourceAreas = useMemo(() => {
    return activeResourceItems.flatMap((itemPrefab) => {
      const option = resourceOptions.find((entry) => entry.key === itemPrefab)
      if (!option) return []
      const points = resourceSources.pointsForItem(itemPrefab)
      return points.length ? [{ key: itemPrefab, label: option.label, color: resourceColorByKey.get(itemPrefab)!, points }] : []
    })
  }, [activeResourceItems, resourceColorByKey, resourceSources, resourceOptions])
  const useSaveMarkers = selectedWorldId !== null && (
    worldSaves.selectedWorld === null || worldSaves.selectedWorld.databasePath !== null
  )
  const seedWorld = useSeedWorld(seedName, locations, !useSaveMarkers && !observedLocationsOnly, locationProfile)
  const savedMarkers = useMemo(
    () => createSaveLocationMarkers(worldSaves.database?.locations ?? [], locations),
    [locations, worldSaves.database],
  )
  const observedMarkers = useMemo(() => createClientLocationMarkers(clientLocations.observations, locations), [clientLocations.observations, locations])
  const saveAndObservedMarkers = useMemo(() => locationsFromSaveOrObservations(savedMarkers, observedMarkers), [savedMarkers, observedMarkers])
  const mapMarkers = useMemo(() => {
    if (hideUnexploredLocations) return exploredLocationMarkers(
      useSaveMarkers ? saveAndObservedMarkers : observedMarkers,
      exploration ?? null,
    )
    return observedLocationsOnly ? observedMarkers : useSaveMarkers ? saveAndObservedMarkers : seedWorld.markers
  }, [hideUnexploredLocations, useSaveMarkers, saveAndObservedMarkers, observedMarkers,
    exploration, observedLocationsOnly, seedWorld.markers])
  const newLocalWorldWithoutSave = worldSaves.selectedWorld?.databasePath === null && clientLocations.snapshot?.isServer === true
  const newLocalWorldNoticeKey = worldSaves.selectedWorld ? worldIdentityKey(worldSaves.selectedWorld) : null
  const itemSourceCatalog = useMemo(() => plannerCatalog.graph && plannerCatalog.intelligence
    ? buildItemAcquisitionCatalog(locations, plannerCatalog.graph, plannerCatalog.intelligence) : null,
  [locations, plannerCatalog.graph, plannerCatalog.intelligence])
  const sourceMarkerCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const marker of mapMarkers) counts.set(marker.locationId, (counts.get(marker.locationId) ?? 0) + 1)
    return counts
  }, [mapMarkers])
  const activeItemSource = itemSourceSelection?.worldKey === `${selectedWorldId ?? ''}:${seedName}` ? itemSourceSelection : null

  const observedFiltersInitializedFor = useRef<{ worldId: string | null; initialized: boolean }>({ worldId: null, initialized: false })
  useEffect(() => {
    if (observedFiltersInitializedFor.current.worldId !== selectedWorldId) {
      observedFiltersInitializedFor.current = { worldId: selectedWorldId, initialized: false }
    }
    if (!newLocalWorldWithoutSave || observedMarkers.length === 0 || observedFiltersInitializedFor.current.initialized) return
    observedFiltersInitializedFor.current.initialized = true
    // A new local world must reveal its live discoveries even when the previous
    // world's saved filters hid every location type. Later filter changes remain manual.
    setActiveFilterKeys([...ALL_LOCATION_FILTER_KEYS])
    setSelectedBiomes([...ALL_BIOME_KEYS])
  }, [newLocalWorldWithoutSave, observedMarkers, selectedWorldId, setActiveFilterKeys, setSelectedBiomes])
  const locationSearchIndex = useMemo(() => buildLocationSearchIndex(locations, (location) =>
    t(locationNameLabelKey(location.prefabName), { defaultValue: formatLocationName(location.prefabName) }),
  ), [locations, t])
  const namedLocationSearchIndex = useMemo(() => buildTextSearchIndex(locations.filter((location) => location.enabled).map((location) => {
    const bossPrefab = findBossPrefab(location.contents?.semanticComponents ?? [])
    const bossName = bossPrefab ? plannerCatalog.intelligence?.characters[bossPrefab.toLowerCase()]?.name : undefined
    return { id: location.id, terms: [location.prefabName, location.placement.name, bossName,
      t(locationNameLabelKey(location.prefabName), { defaultValue: formatLocationName(location.prefabName) }),
      t(locationCategoryLabelKey(location))] }
  })), [locations, plannerCatalog.intelligence, t])
  const normalLocationIds = useMemo(() => {
    // A search is "find this on the map": it looks inside every location and
    // ignores the type filters, which only decide the resting view.
    const matches = matchItemLocationSearch(itemSourceCatalog, locationSearchIndex, query)
    if (matches) return new Set([...matches, ...(matchLocationSearch(namedLocationSearchIndex, query) ?? [])])
    return new Set(
      locations
        .filter((location) => location.enabled && locationMatchesFilters(location, activeFilters))
        .map((location) => location.id),
    )
  }, [activeFilters, locations, query, locationSearchIndex, itemSourceCatalog, namedLocationSearchIndex])

  const activeSearchFocus = searchFocus?.query === query && searchFocus.worldKey === `${selectedWorldId ?? ''}:${seedName}` ? searchFocus : null
  const searchVisiblePinTypes = useMemo(() => activeSearchFocus?.pin
    ? new Set([...visiblePinTypes, activeSearchFocus.pin.type]) : visiblePinTypes,
  [activeSearchFocus, visiblePinTypes])

  // Planner source mode replaces which markers are drawn without touching the
  // persisted filters, so leaving it restores the player's own configuration.
  const plannerLocationIds = useMemo(() => {
    if (!plannerSources.active) return null
    const wanted = new Set(plannerSources.locationPrefabs.map((prefab) => prefab.toLowerCase()))
    return new Set(
      locations
        .filter((location) => location.enabled && wanted.has(location.prefabName.toLowerCase()))
        .map((location) => location.id),
    )
  }, [locations, plannerSources.active, plannerSources.locationPrefabs])

  const filteredLocationIds = activeSearchFocus?.locationIds ?? activeItemSource?.locationIds ?? plannerLocationIds ?? normalLocationIds
  // Search and planner source views intentionally reveal their results even
  // when a biome is selected in the resting map filters.
  const biomeFilteredMarkers = useMemo(() => filterMarkersByBiomes(mapMarkers, seedName, selectedBiomes),
    [mapMarkers, seedName, selectedBiomes])
  const biomeDisplayMarkers = query.trim() || activeSearchFocus || activeItemSource || plannerLocationIds
    ? mapMarkers : biomeFilteredMarkers
  const displayMarkers = useMemo(() => biomeDisplayMarkers.filter(marker =>
    isProgressMarkerVisible(locationProgressId(marker), found, favorites, hideFound, hideFavorites)),
  [biomeDisplayMarkers, found, favorites, hideFound, hideFavorites])

  // Hand the in-game mini-map exactly what this map shows.
  const mirrorRef = useRef<{
    seedName: string
    worldUid: string | null
    customMarkerWorldKey: string
    observedLocationsOnly: boolean
    exploration: ExplorationRestriction
    showUnexploredTerrain: boolean
    mapMarkers: typeof mapMarkers
    filteredLocationIds: Set<string>
    playerPins: typeof characterPins.pins
    visiblePinTypes: Set<MapPinType>
    containers: typeof containersOnThisWorld
    containersLive: boolean
    structurePaths: typeof structurePaths
    nearbyCreatures: typeof visibleNearbyCreatures
  } | null>(null)
  const mirrorServer = useRef<ReturnType<typeof serveMapMirror> | null>(null)
  useEffect(() => {
    const server = serveMapMirror(() => {
      const current = mirrorRef.current
      return current ? {
        seedName: current.seedName,
        worldUid: current.worldUid,
        customMarkerWorldKey: current.customMarkerWorldKey,
        observedLocationsOnly: current.observedLocationsOnly,
        exploration: current.exploration,
        showUnexploredTerrain: current.showUnexploredTerrain,
        markers: current.mapMarkers,
        visibleLocationIds: [...current.filteredLocationIds],
        playerPins: [...current.playerPins],
        visiblePinTypes: [...current.visiblePinTypes],
        containers: [...current.containers],
        containersLive: current.containersLive,
        structurePaths: [...current.structurePaths],
        nearbyCreatures: [...current.nearbyCreatures],
      } : null
    })
    mirrorServer.current = server
    return () => { server.close(); mirrorServer.current = null }
  }, [])
  useEffect(() => {
    mirrorRef.current = {
      seedName,
      worldUid: selectedWorldUid,
      customMarkerWorldKey,
      observedLocationsOnly,
      exploration,
      showUnexploredTerrain,
      mapMarkers: displayMarkers,
      filteredLocationIds,
      playerPins: characterPins.pins,
      visiblePinTypes,
      containers: visibleContainers,
      containersLive: visibleContainers.length > 0 && containers.status === 'live',
      structurePaths: showStructures ? structurePaths : noStructurePaths,
      nearbyCreatures: showNearbyCreatures ? visibleNearbyCreatures : [],
    }
    mirrorServer.current?.publish()
  }, [
    observedLocationsOnly,
    exploration,
    showUnexploredTerrain,
    customMarkerWorldKey,
    characterPins.pins,
    containers.status,
    visibleContainers,
    filteredLocationIds,
    displayMarkers,
    useSaveMarkers,
    seedName,
    showNearbyCreatures,
    showStructures,
    structurePaths,
    visibleNearbyCreatures,
    visiblePinTypes,
    selectedWorldUid,
  ])

  const exitPlannerSourceMode = useCallback((returnToPlan: boolean) => {
    plannerSources.clear()
    if (returnToPlan) setSurface('planner')
  }, [plannerSources])

  const plannerPlans = useCraftingPlannerStore((state) => state.plans)
  const craftFilterEntries = useMemo(() => {
    const graph = plannerCatalog.graph
    if (!graph) return []
    return plannerPlans
      .filter((plan) => !plan.archived && plan.targets.length > 0)
      .map((plan) => {
        const item = graph.items.get(plan.targets[0].prefabName.toLowerCase())
        return {
          planId: plan.id,
          name: item?.name ?? plan.targets[0].prefabName,
          icon: item?.icon ?? null,
        }
      })
  }, [plannerCatalog.graph, plannerPlans])

  // Selecting a craft in the filter rail turns the map into a source view for
  // that craft: markers holding its missing materials plus every standing
  // resource node the world save confirms.
  const showCraftSources = useCallback((planId: string | null) => {
    if (!planId) {
      plannerSources.clear()
      return
    }
    const graph = plannerCatalog.graph
    const intelligence = plannerCatalog.intelligence
    const plan = useCraftingPlannerStore.getState().plans.find((entry) => entry.id === planId)
    if (!graph || !intelligence || !plan || plan.targets.length === 0) return
    const calculation = calculatePlan({
      graph,
      targets: plan.targets,
      stock: mergeStock(plan.manualOwned, inventory.stock),
      honorManualCompletion: !inventory.authoritative,
      recipeChoices: plan.recipeChoices,
    })
    const missing = calculation.materials
      .filter((material) => material.missing > 0)
      .map((material) => material.prefabName)
    const prefabs = missing.length > 0
      ? missing
      : calculation.materials.map((material) => material.prefabName)
    const selection = collectMapSources(graph, intelligence, prefabs)
    const origin = { x: tracking.position?.x ?? 0, z: tracking.position?.z ?? 0 }
    const points = resourceIndex
      ? prefabs
        .flatMap((prefab) => resourceIndex.nodesForItem(prefab)
          .filter((point) => point.status === 'present' || point.status === 'partial')
          .map((point) => ({
            x: point.x,
            z: point.z,
            nodePrefab: point.nodePrefab,
            status: point.status as 'present' | 'partial',
            distance: Math.hypot(point.x - origin.x, point.z - origin.z),
          })))
        .sort((first, second) => first.distance - second.distance)
        .slice(0, 60)
        .map(({ x, z, nodePrefab, status }) => ({ x, z, nodePrefab, status }))
      : []
    const item = graph.items.get(plan.targets[0].prefabName.toLowerCase())
    setSelectedLocation(null)
    plannerSources.show({
      planId,
      label: item?.name ?? plan.targets[0].prefabName,
      ...selection,
      points,
      focus: null,
      context: null,
    })
  }, [inventory.authoritative, inventory.stock, plannerCatalog.graph, plannerCatalog.intelligence, plannerSources, resourceIndex, tracking.position])

  const { totals: filterCounts, completed: foundCounts } = useMemo(
    () => countLocationProgress(mapMarkers, locations, found, !observedLocationsOnly),
    [mapMarkers, locations, found, observedLocationsOnly],
  )

  const shown = useMemo(() => mapMarkers.length > 0
    ? displayMarkers.filter((marker) => filteredLocationIds.has(marker.locationId)).length
    : observedLocationsOnly ? 0 : filteredLocationIds.size,
  [filteredLocationIds, displayMarkers, mapMarkers.length, observedLocationsOnly])

  const updateManyFilters = (keys: string[], active: boolean) => {
    setActiveFilterKeys((current) => {
      const next = new Set(current)
      keys.forEach((key) => active ? next.add(key) : next.delete(key))
      return [...next]
    })
  }
  const showOnlyFilters = (keys: string[]) => {
    setActiveFilterKeys((current) => (
      current.length === keys.length && keys.every((key) => current.includes(key)) ? [] : keys
    ))
  }
  const closeSearch = () => {
    setSearchResultsHidden(false)
    setSearchFocus(null)
    setQuery('')
    setSearchOpen(false)
    setItemSourceSelection(null)
  }
  const showItemSource = (item: MarkerItemIntel, source: ItemAcquisitionSource) => {
    setSearchFocus(null)
    const locationIds = new Set(source.locationIds)
    const resourcePoints: PlannerMapSourcePoint[] = source.kind === 'resource'
      ? (resourceIndex?.nodesForItem(item.prefabName) ?? []).filter((point) =>
        point.nodePrefab.toLowerCase() === source.prefabName.toLowerCase() && (point.status === 'present' || point.status === 'partial'))
        .map((point) => ({ x: point.x, z: point.z, nodePrefab: point.nodePrefab, status: point.status as 'present' | 'partial' })) : []
    const points = source.kind === 'resource' ? resourcePoints
      : mapMarkers.filter((marker) => locationIds.has(marker.locationId)).map((marker) => ({ x: marker.x, z: marker.y }))
    if (!points.length) return
    setSelectedLocation(null)
    setFiltersOpen(false)
    plannerSources.clear()
    setOperationsMapSelection(null)
    setQuery(item.name)
    setSearchResultsHidden(false)
    setSearchOpen(true)
    setItemSourceSelection({
      locationIds, label: item.name, points: resourcePoints,
      focus: routeFocus(points, `item-source-${Date.now()}`), worldKey: `${selectedWorldId ?? ''}:${seedName}`,
    })
    setSurface('map')
  }
  const itemSourceProps = {
    catalog: itemSourceCatalog, sourceError: plannerCatalog.error,
    mapLoading: loading || worldSaves.discovering || worldSaves.readingDatabase || (!useSaveMarkers && seedWorld.generating),
    markerCounts: sourceMarkerCounts, resourceIndex, onShowSource: showItemSource,
  }
  const selectSeed = (nextSeed: string) => {
    initialWorldSelectionResolved.current = true
    setSelectedLocation(null)
    setSelectedWorldId(null)
    setSeedName(nextSeed)
    writePreferences({
      ...readPreferences(),
      worldSeed: nextSeed,
      worldSaveId: null,
    })
  }

  useEffect(() => {
    if (worldSaves.discovering || initialWorldSelectionResolved.current) return
    if (worldSaves.selectedWorld) {
      initialWorldSelectionResolved.current = true
      return
    }
    const automaticWorld = chooseAutomaticWorld(worldSaves.worlds)
    if (!automaticWorld) return
    initialWorldSelectionResolved.current = true
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setSelectedLocation(null)
      setSelectedWorldId(automaticWorld.id)
      setSeedName(automaticWorld.seedName)
      writePreferences({
        ...readPreferences(),
        worldSeed: automaticWorld.seedName,
        worldSaveId: automaticWorld.id,
      })
    })
    return () => { cancelled = true }
  }, [worldSaves.discovering, worldSaves.selectedWorld, worldSaves.worlds])

  useEffect(() => {
    const name = tracking.position?.worldName
    const seedName = tracking.position?.seedName
    if (tracking.status !== 'tracking' || !name?.trim() || !seedName?.trim()) return
    const identity = { name, seedName }
    const key = worldIdentityKey(identity)
    // Follow a newly entered world once; subsequent scans must not override
    // a map the user deliberately selected while staying in that world.
    const trackedWorld = chooseNewLiveWorld(worldSaves.worlds, identity, lastTrackedWorldKey.current)
    if (!trackedWorld) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      lastTrackedWorldKey.current = key
      initialWorldSelectionResolved.current = true
      setSelectedLocation(null)
      setSelectedWorldId(trackedWorld.id)
      setSeedName(trackedWorld.seedName)
      writePreferences({ ...readPreferences(), worldSeed: trackedWorld.seedName, worldSaveId: trackedWorld.id })
    })
    return () => { cancelled = true }
  }, [tracking.status, tracking.position?.seedName, tracking.position?.worldName, worldSaves.worlds])

  // A live seed becomes a normal saved world once the files are committed.
  // Resolve only the current selection, never an unrelated manually chosen map.
  useEffect(() => {
    const world = worldSaves.selectedWorld
    if (!world || world.id === selectedWorldId) return
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setSelectedWorldId(world.id)
      writePreferences({ ...readPreferences(), worldSaveId: world.id, worldSeed: world.seedName })
    })
    return () => { cancelled = true }
  }, [selectedWorldId, worldSaves.selectedWorld])

  useEffect(() => {
    if (!searchOpen || surface !== 'map') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setQuery('')
      setSearchOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [searchOpen, surface])

  useEffect(() => {
    if (!filtersOpen || searchOpen || surface !== 'map') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setFiltersOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filtersOpen, searchOpen, surface])

  // The dashboard moves itself off the game's monitor and surfaces on game
  // launch (see game-launch-monitor-switch); it must arm inside this window.
  useEffect(() => {
    if (!inGame) setupGameLaunchMonitorSwitch()
  }, [inGame])
  useEffect(() => {
    const receive = () => {
      const request = readChestMapRequest()
      if (!request) return
      const world = worldSaves.worlds.find((entry) => entry.uid === request.worldUid)
      if (!world && !request.seedName) return
      localStorage.removeItem(CHEST_MAP_REQUEST_KEY)
      setSelectedWorldId(world?.id ?? null)
      setSeedName(world?.seedName ?? request.seedName)
      setSelectedLocation(null)
      setFiltersOpen(false)
      setSurface('map')
      const point = { x: request.x, z: request.z, containerId: request.containerId, nodePrefab: request.prefab, kind: 'container', status: 'present' as const, label: request.label, focusId: `chest-${request.createdAt}` }
      usePlannerMapSourceStore.getState().show({ planId: '', label: request.label, materialPrefabs: [], locationPrefabs: [], characterPrefabs: [], points: [point], focus: point, context: null })
    }
    receive()
    window.addEventListener('storage', receive)
    window.addEventListener(CHEST_MAP_REQUEST_KEY, receive)
    return () => {
      window.removeEventListener('storage', receive)
      window.removeEventListener(CHEST_MAP_REQUEST_KEY, receive)
    }
  }, [worldSaves.worlds])
  const adRailVisible = !adFree && !waitingForSubscription && surface !== 'settings' && surface !== 'account'

  const navigate = (nextSurface: MainSurface) => {
    setSelectedLocation(null)
    if (nextSurface !== 'map') {
      plannerSources.clear()
      setOperationsMapSelection(null)
    }
    setSurface(nextSurface)
  }

  const { unread: updatesUnread, markRead: markUpdatesRead } = useWhatsNewReadState(WHATS_NEW_VERSION)
  const sidebarTools: SidebarItem[] = [
    sidebarLanguage(t('settings.language'), i18n.language, APP_LANGUAGE_OPTIONS.map(({ code, name, flag }) => ({
      id: code, label: name, icon: <img src={flag} alt="" />,
    })), language => writePreferences({ ...readPreferences(), language })),
    { id: 'updates', label: t('whatsNew.title'), active: surface === 'whats-new',
      indicator: updatesUnread ? <span className="app-navigation-dot" /> : undefined,
      onSelect: () => { markUpdatesRead(); navigate('whats-new') } },
  ]

  const { unreadReplies, inboxPending, isAdmin } = useSupportBadges()
  const standaloneItems = standaloneSidebarFooter(
    { label: t('support.title'), active: surface === 'support', onSelect: () => navigate('support'),
      indicator: unreadReplies + (isAdmin ? inboxPending : 0) > 0 ? <span className="app-navigation-dot" /> : undefined },
    { label: t('navigation.account'), active: surface === 'account', onSelect: () => navigate('account') },
  )
  const navItems: SidebarItem[] = [
    { id: 'map', label: t('navigation.map'), active: surface === 'map', onSelect: () => navigate('map') },
    { id: 'database', label: t('navigation.database'), active: surface === 'database', onSelect: () => navigate('database') },
    { id: 'operations', label: t('navigation.operations'), icon: <Warehouse size={18} />, active: surface === 'operations', onSelect: () => navigate('operations') },
    { id: 'planner', label: t('navigation.planner'), icon: <ClipboardList size={18} />, active: surface === 'planner',
      indicator: activePlanTargetCount > 0 ? <span className="app-navigation-count">{activePlanTargetCount > 99 ? '99+' : activePlanTargetCount}</span> : undefined,
      onSelect: () => navigate('planner') },
    { id: 'companion', label: t('planner.tracker.companion'), icon: <PanelsTopLeft size={18} />, onSelect: () => void openCraftCompanion().catch(console.error) },
  ]

  return (
    <ItemSourceContext.Provider value={itemSourceProps}>
    <main className="app-dashboard-window relative flex h-screen w-screen flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--background)]">
      {typeof overwolf !== 'undefined' && <AppHeader standaloneDashboard={!IS_MAP_IT_HOSTED} windowName={inGame ? 'in_game' : 'main'} />}
      <div className="flex min-h-0 flex-1">
        <NavigationSidebar label={t('app.name')} brandIcon={<img src="/icon.png" alt="" draggable={false} />} pinLabel={t('navigation.pin')} storageKey="app:navigation-pinned"
          items={navItems} tour="nav" systemFooter={standaloneItems} footer={[
            ...sidebarTools,
            { id: 'faq', label: t('navigation.faq'), active: surface === 'faq', onSelect: () => navigate('faq') },
            { id: 'settings', tour: 'settings', label: t('navigation.settings'), active: surface === 'settings', onSelect: () => navigate('settings') },
          ]} />
        <section id="tour-boundary" data-app-window-page-content={surface !== 'map' ? '' : undefined} className="game-page-artwork relative min-w-0 flex-1">
          {surface === 'settings' ? (
            <SettingsPanel onClose={() => setSurface('map')} onViewPlans={() => setPremiumPlansOpen(true)} inventory={inventory} tracking={tracking} />
          ) : surface === 'account' ? (
            <AccountSurface onClose={() => setSurface('map')} onViewPlans={() => setPremiumPlansOpen(true)} />
          ) : surface === 'faq' ? (
            <FaqSurface onClose={() => setSurface('map')} onOpenSupport={() => setSurface('support')} />
          ) : surface === 'whats-new' ? (
            <WhatsNewSurface onClose={() => setSurface('map')} onOpenFeedback={() => setSurface('support')} onOpenCharacterPins={() => {
              setOpenCharacterPickerOnMap(true)
              setFiltersOpen(false)
              setSearchOpen(false)
              setSurface('map')
            }} onOpenMarkerCustomization={() => {
              setFiltersOpen(true)
              setOpenMarkerCustomizationOnMap(true)
              setSurface('map')
            }} />
          ) : surface === 'support' ? (
            <SupportPage />
          ) : surface === 'database' ? (
            <DatabasePanel
              {...itemSourceProps}
              onAddToPlanner={(prefabName) => {
                setPendingPlannerPrefab(prefabName)
                setSurface('planner')
              }}
            />
          ) : surface === 'operations' ? (
            <BaseOperationsSurface
              world={worldSaves.selectedWorld}
              database={worldSaves.database}
              fallback={baseFallback.operations}
              fallbackEnabled={baseFallbackEnabled}
              discovering={worldSaves.discovering}
              loading={worldSaves.readingDatabase}
              error={worldSaves.error}
              onRefresh={worldSaves.refreshWorlds}
              onOpenMap={() => setSurface('map')}
              onLocate={(target: OperationMapTarget) => {
                setSelectedLocation(null)
                setFiltersOpen(false)
                closeSearch()
                plannerSources.clear()
                operationFocusSequence.current += 1
                const requestId = `operation-${operationFocusSequence.current}`
                const points = [target, ...(target.related ?? [])].map((point, index) => ({
                  x: point.x,
                  z: point.z,
                  label: point.label,
                  focusId: `${requestId}-point-${index}`,
                  kind: 'operation',
                  status: 'present' as const,
                }))
                setOperationsMapSelection({
                  points,
                  focus: routeFocus(points, `${requestId}-route`),
                })
                setSurface('map')
              }}
            />
          ) : surface === 'building' ? (
            <BuildingSurface />
          ) : surface === 'planner' ? (
            <PlannerSurface
              inventory={inventory}
              containers={containers}
              translateToken={translatePinToken}
              resourceIndex={resourceIndex}
              playerPosition={tracking.position}
              pendingTargetPrefab={pendingPlannerPrefab}
              onPendingTargetConsumed={() => setPendingPlannerPrefab(null)}
              onInstallTracker={() => setSurface('settings')}
              onRefreshWorldData={() => { worldSaves.refreshWorlds(); setPinRefreshToken((value) => value + 1) }}
              onShowSourcesOnMap={(request) => {
                setSelectedLocation(null)
                plannerSources.show(request)
                setSurface('map')
              }}
            />
          ) : (
            <div className="relative h-full overflow-hidden">
              {error ? (
                <div className="grid h-full place-items-center p-8 text-center text-[var(--muted)]">{t('map.loadError')}</div>
              ) : loading ? (
                <div className="grid h-full place-items-center p-8 text-center text-[var(--muted)]">{t('common.loading')}</div>
              ) : (
                <PlacementRulesMap
                  exploration={exploration}
                  showUnexploredTerrain={showUnexploredTerrain}
                  explorationContext={selectedWorldUid && (liveExploration.characterId || savedCharacterPins.characterPlayerId)
                    ? `${selectedWorldUid}:${liveExploration.characterId ?? savedCharacterPins.characterPlayerId}` : undefined}
                  filtersOpen={filtersOpen}
                  selected={observedLocationsOnly && selectedLocation?.marker
                    && !mapMarkers.some((marker) => marker.id === selectedLocation.marker?.id) ? null : selectedLocation}
                  onSelect={(location, marker) => {
                    closeSearch()
                    setFiltersOpen(false)
                    setSelectedLocation({ location, marker })
                  }}
                  onSelectContainer={() => {
                    closeSearch()
                    setFiltersOpen(false)
                  }}
                  onClearSelection={() => setSelectedLocation(null)}
                  locations={locations}
                  visibleLocationIds={filteredLocationIds}
                  seedName={seedName}
                  customMarkerWorldKey={customMarkerWorldKey}
                  onStartCustomMarkerPlacement={() => { setFiltersOpen(false); closeSearch() }}
                  generatedMarkers={displayMarkers}
                  generating={!useSaveMarkers && !observedLocationsOnly && seedWorld.generating}
                  loadingWorldSave={useSaveMarkers && (worldSaves.discovering || worldSaves.readingDatabase)}
                  generationProgress={useSaveMarkers ? null : seedWorld.progress}
                  generationError={useSaveMarkers ? null : seedWorld.error}
                  playerPosition={tracking.position}
                  desktopFollow={!inGame && isOverwolf()}
                  resourcePoints={activeItemSource ? activeItemSource.points : plannerSources.active
                    ? plannerMapPoints
                    : operationsMapSelection?.points}
                  resourceAreas={activeItemSource || plannerSources.active || operationsMapSelection ? [] : selectedResourceAreas}
                  highlightedResourceKey={highlightedResourceItem && activeResourceItems.includes(highlightedResourceItem) ? highlightedResourceItem : null}
                  nodeKindFor={(nodePrefab) => plannerCatalog.graph?.resourceNodes[nodePrefab.toLowerCase()]?.kind}
                  playerPins={activeSearchFocus?.pin ? [activeSearchFocus.pin, ...characterPins.pins.filter((pin) => pin !== activeSearchFocus.pin)] : characterPins.pins}
                  visiblePinTypes={searchVisiblePinTypes}
                  translatePinToken={translatePinToken}
                  focusTarget={activeSearchFocus?.point ?? activeItemSource?.focus ?? (plannerSources.active ? plannerSources.focus : operationsMapSelection?.focus)}
                  cameraKey="main-map"
                  containers={mapContainers}
                  structurePaths={showStructures ? structurePaths : undefined}
                  nearbyCreatures={showNearbyCreatures ? visibleNearbyCreatures : undefined}
                  translateCreatureToken={translateCreatureToken}
                />
              )}

              {observedLocationsOnly && !(canToggleSpoilers && !showSpoilers) && !loading && !error && (
                newLocalWorldWithoutSave
                  ? newLocalWorldNoticeKey !== newLocalWorldNoticeDismissedFor
                  : !observedLocationsNoticeDismissed
              ) ? (
                <div
                  role="note"
                  data-observed-locations-notice
                  className={`absolute left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--overlay-background)] py-1.5 pl-3 pr-1.5 text-xs font-medium text-[var(--text)] shadow-lg backdrop-blur-xl ${plannerSources.active && !plannerContainerId ? 'bottom-20' : 'bottom-2'}`}
                >
                  <span>{newLocalWorldWithoutSave
                    ? t('map.newLocalWorldWithoutSave', { defaultValue: "It seems you're playing in a brand new world. Save it and re-enter to load all map locations. Until then, nearby and discovered locations will appear here." })
                    : t('map.observedLocationsOnly', { defaultValue: 'Showing nearby and explored structures.' })}</span>
                  <button
                    type="button"
                    aria-label={t('common.close')}
                    title={t('common.close')}
                    onClick={() => {
                      if (newLocalWorldWithoutSave) {
                        setNewLocalWorldNoticeDismissedFor(newLocalWorldNoticeKey)
                      } else {
                        setObservedLocationsNoticeDismissed(true)
                        writePreferences({ ...readPreferences(), observedLocationsNoticeDismissed: true })
                      }
                    }}
                    className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              ) : null}

              {placingCustomMarker ? <div className="pointer-events-none absolute left-1/2 top-12 z-40 flex -translate-x-1/2 items-center gap-3 rounded-[var(--radius-full)] border border-[var(--accent)] bg-[var(--overlay-background)] px-4 py-2 text-xs font-medium text-[var(--text)] shadow-xl">
                <MapPinPlus size={15} className="text-[var(--accent-text)]" aria-hidden="true" />
                <span>{t('customMarkers.placeHint')}</span>
                <button type="button" onClick={() => setPlacingCustomMarker(false)} className="pointer-events-auto cursor-pointer text-[var(--muted)] hover:text-[var(--text)]">{t('customMarkers.cancel')}</button>
              </div> : null}

              {plannerSources.active && !plannerContainerId ? (
                <div className="pointer-events-none absolute bottom-2 left-1/2 z-40 w-[min(560px,calc(100%-1rem))] -translate-x-1/2">
                  <div className="pointer-events-auto flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--accent)]/40 bg-[var(--overlay-background)] px-3 py-2 shadow-xl">
                    <MapPin size={15} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-semibold text-[var(--text)]">
                        {t('planner.mapMode.title', { name: plannerSources.label })}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
                        {plannerSources.context
                          ? describeSourceContext(t, exploration === undefined ? plannerSources.context
                            : { ...plannerSources.context, confirmedCount: plannerMapPoints.length })
                          : plannerSources.points.length > 0
                            ? t('planner.mapMode.points', { count: plannerMapPoints.length })
                            : plannerSources.locationPrefabs.length > 0
                              ? t('planner.mapMode.locations', { count: shown })
                              : t('planner.mapMode.noLocations')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => exitPlannerSourceMode(false)}
                      className="shrink-0 cursor-pointer rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-2.5 py-1.5 text-[10.5px] font-semibold text-[var(--text)] hover:border-[var(--accent)]"
                    >
                      {t('planner.mapMode.exit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => exitPlannerSourceMode(true)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-[10.5px] font-bold text-[var(--text)] hover:bg-[var(--surface-hover)]"
                    >
                      <ArrowLeft size={12} aria-hidden="true" />{t('planner.mapMode.backToPlan')}
                    </button>
                  </div>
                </div>
              ) : null}

              <div data-app-window-top-controls className="pointer-events-none absolute bottom-2 right-2 top-[max(0.5rem,var(--app-window-drag-height,0px))] z-30 flex max-w-[calc(100%-1rem)] flex-col items-end gap-2">
                <div className="pointer-events-auto flex shrink-0 items-center gap-2">
                  {searchOpen ? (
                    <label className="focus-frame flex h-9 w-56 items-center gap-2 overflow-hidden rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--overlay-background)] px-3 shadow-lg transition-colors focus-within:border-[var(--accent)] focus-within:ring-1 focus-within:ring-[var(--accent)]">
                      <Search size={14} className="text-[var(--muted)]" aria-hidden="true" />
                      <span className="sr-only">{t('map.search')}</span>
                      <input ref={searchInputRef} autoFocus value={query} onFocus={() => setSearchResultsHidden(false)} onChange={(event) => { setSearchResultsHidden(false); setQuery(event.target.value); setSearchFocus(null); setItemSourceSelection(null); plannerSources.clear() }} onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); closeSearch() } }} onBlur={() => window.setTimeout(() => { if (!query) setSearchOpen(false) }, 120)} placeholder={t('map.searchPlaceholder')} className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text)] outline-none placeholder:text-[var(--muted)]" />
                      <button type="button" onClick={closeSearch} className="grid size-5 cursor-pointer place-items-center text-[var(--muted)] hover:text-[var(--text)]" aria-label={t('map.closeSearch')}>
                        <X size={13} aria-hidden="true" />
                      </button>
                    </label>
                  ) : (
                    <button data-tour="search" type="button" onClick={() => { setSearchOpen(true); requestAnimationFrame(() => searchInputRef.current?.focus()) }} className="grid size-9 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--overlay-background)] text-[var(--muted)] shadow-lg hover:text-[var(--accent-text)]" aria-label={t('map.search')} title={t('map.search')}>
                      <Search size={16} aria-hidden="true" />
                    </button>
                  )}
                </div>
                {searchOpen && !searchResultsHidden && query.trim() ? <>
                  <MapSearchResults key={`${selectedWorldId ?? ''}:${seedName}:${query}`} query={query}
                    locations={locations} markers={mapMarkers} matchingLocationIds={normalLocationIds}
                    pins={characterPins.pins} translatePinToken={translatePinToken}
                    customMarkers={allCustomMarkers.filter((marker) => marker.worldKey === customMarkerWorldKey && isMapPointVisible(exploration, marker.x, marker.z))}
                    onSelectLocation={(location, markers) => {
                      if (!markers.length) return
                      setSearchResultsHidden(true)
                      setItemSourceSelection(null)
                      plannerSources.clear()
                      setFiltersOpen(false)
                      setSelectedLocation(markers.length === 1 ? { location, marker: markers[0] } : null)
                      setSearchFocus({
                        point: routeFocus(markers.map((marker) => ({ x: marker.x, z: marker.y })), `search-${++operationFocusSequence.current}`),
                        locationIds: new Set(markers.map((marker) => marker.locationId)),
                        worldKey: `${selectedWorldId ?? ''}:${seedName}`, query,
                      })
                    }}
                    onSelectPin={(pin) => {
                      setItemSourceSelection(null)
                      plannerSources.clear()
                      setFiltersOpen(false)
                      setSelectedLocation(null)
                      setSearchFocus({ point: { x: pin.x, z: pin.z, focusId: `search-${++operationFocusSequence.current}` }, worldKey: `${selectedWorldId ?? ''}:${seedName}`, query, pin })
                    }}
                    onSelectCustomMarker={(marker) => {
                      setItemSourceSelection(null)
                      plannerSources.clear()
                      setFiltersOpen(false)
                      setSelectedLocation(null)
                      selectCustomMarker(marker.id)
                      setSearchResultsHidden(true)
                      setSearchFocus({ point: { x: marker.x, z: marker.z, focusId: `search-${++operationFocusSequence.current}` }, worldKey: `${selectedWorldId ?? ''}:${seedName}`, query })
                    }}
                    {...itemSourceProps} />
                </> : null}
              </div>

              <div className="pointer-events-none absolute bottom-2 left-2 top-[max(0.5rem,var(--app-window-drag-height,0px))] z-30 flex flex-col items-start gap-2">
                <div data-map-identity-controls className="flex shrink-0 items-center gap-2">
                  <button
                    data-tour="filters"
                    type="button"
                    onClick={() => {
                      if (filtersOpen) {
                        setFiltersOpen(false)
                        return
                      }
                      setSelectedLocation(null)
                      setFiltersOpen(true)
                    }}
                    className={`pointer-events-auto relative grid size-9 cursor-pointer place-items-center rounded-[var(--radius-md)] shadow-lg ring-1 ring-inset transition-colors ${
                      filtersOpen
                        ? 'bg-[var(--surface-hover)] text-[var(--accent-text)] ring-[var(--accent)]'
                        : 'bg-[var(--overlay-background)] text-[var(--text)] ring-[var(--border)]'
                    }`}
                    aria-label={t(filtersOpen ? 'filters.collapse' : 'filters.open')}
                    aria-pressed={filtersOpen}
                    title={t(filtersOpen ? 'filters.collapse' : 'filters.open')}
                  >
                    <SlidersHorizontal size={16} aria-hidden="true" />
                    <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[var(--accent)] text-[9px] font-bold text-[var(--accent-contrast)]">
                      {activeFilters.size}
                    </span>
                  </button>
                  <WorldSelector
                    seedName={seedName}
                    selectedWorldId={selectedWorldId}
                    worlds={worldSaves.worlds}
                    discovering={worldSaves.discovering}
                    readingDatabase={worldSaves.readingDatabase}
                    saveError={worldSaves.error}
                    showLocationProfile={!useSaveMarkers && !observedLocationsOnly}
                    locationProfile={locationProfile}
                    onLocationProfileChange={setLocationProfile}
                    onSelectSeed={selectSeed}
                    onRemoveSeed={(world) => {
                      if (selectedWorldId === world.id) selectSeed(world.seedName)
                      worldSaves.forgetSeed(world)
                    }}
                    onRefresh={worldSaves.refreshWorlds}
                    onOpen={() => { setFiltersOpen(false); worldSaves.refreshWorlds(false) }}
                    onSelectWorld={(world) => {
                      setSelectedLocation(null)
                      setSelectedWorldId(world.id)
                      setSeedName(world.seedName)
                      writePreferences({
                        ...readPreferences(),
                        worldSeed: world.seedName,
                        worldSaveId: world.id,
                      })
                    }}
                  />
                  <CharacterSelector key={selectedWorldUid ?? `seed:${seedName}`}
                    characters={characterPins.characters.map(entry => ({ id: entry.file.id, name: entry.playerName }))}
                    characterName={characterPins.characterName}
                    activeCharacterName={pinIdentity?.characterName || null}
                    selectedCharacterId={characterPins.selectedCharacterId}
                    loading={characterPins.loading}
                    unavailable={!showingLivePins && !characterPins.selectedCharacterId}
                    openOnMount={openCharacterPickerOnMap}
                    onOpened={() => setOpenCharacterPickerOnMap(false)}
                    onOpen={() => setSearchOpen(false)}
                    onSelect={id => {
                      characterPins.selectCharacter(id)
                      setSelectedLocation(null)
                      setSearchFocus(null)
                      setItemSourceSelection(null)
                      setOperationsMapSelection(null)
                      plannerSources.clear()
                    }}
                    onRefresh={characterPins.refresh}
                  />
                </div>
                {filtersOpen ? (
                  <div data-tour="filters" className="min-h-0 flex-1">
                    <FilterRail
                      exploration={exploration}
                      openMarkerCustomizationOnMount={openMarkerCustomizationOnMap}
                      onMarkerCustomizationOpened={() => setOpenMarkerCustomizationOnMap(false)}
                      customMarkerWorldKey={customMarkerWorldKey}
                      activeFilters={activeFilters}
                      selectedBiomes={selectedBiomes}
                      onSetBiomes={setSelectedBiomes}
                      counts={filterCounts}
                      foundCounts={foundCounts}
                      shown={shown}
                      resources={resourceIndex || predictServerResources || worldSaves.selectedWorld?.databasePath ? {
                        available: Boolean(resourceIndex) || predictServerResources,
                        loading: worldSaves.readingDatabase || (predictServerResources && seedResources.loading),
                        predictionError: predictServerResources && seedResources.error,
                        predicted: predictServerResources && resourceOptions.some((option) => option.predictedCount > 0),
                        options: resourceOptions.map((option) => ({
                          ...option,
                          active: activeResourceItems.includes(option.key),
                          color: resourceColorByKey.get(option.key) ?? null,
                        })),
                        onHover: setHighlightedResourceItem,
                        onToggle: (itemPrefab) => {
                          setHighlightedResourceItem(activeResourceItems.includes(itemPrefab) ? null : itemPrefab)
                          setActiveResourceItems((current) => toggleResourceSelection(current, itemPrefab))
                          setItemSourceSelection(null)
                          plannerSources.clear()
                          setOperationsMapSelection(null)
                        },
                        onSetAll: (active) => {
                          setHighlightedResourceItem(null)
                          setActiveResourceItems((current) => active
                            ? normalizeResourceSelection([...current.filter((item) => availableResourceKeys.has(item)), ...resourceOptions.map((option) => option.key)])
                            : [])
                          if (active) {
                            setItemSourceSelection(null)
                            plannerSources.clear()
                            setOperationsMapSelection(null)
                          }
                        },
                      } : undefined}
                      pins={{
                        types: [...PLAYER_VISIBLE_PIN_TYPES]
                          .filter((type) => (pinTypeCounts.get(type) ?? 0) > 0)
                          .map((type) => ({ key: type, count: pinTypeCounts.get(type) ?? 0, active: !hiddenPinTypes.includes(type) })),
                        onToggle: (key) => setHiddenPinTypes((current) => current.includes(key)
                          ? current.filter((entry) => entry !== key)
                          : [...current, key]),
                        onSetAll: (active) => setHiddenPinTypes(active ? [] : [...PLAYER_VISIBLE_PIN_TYPES]),
                        onShowOnly: (key) => setHiddenPinTypes((current) => {
                          const hiddenWhenOnly = [...PLAYER_VISIBLE_PIN_TYPES].filter((type) => type !== key)
                          const isOnly = current.length === hiddenWhenOnly.length
                            && hiddenWhenOnly.every((type) => current.includes(type))
                          return isOnly ? [...PLAYER_VISIBLE_PIN_TYPES] : hiddenWhenOnly
                        }),
                        onShowOnlyGroup: () => {
                          const isOnly = activeFilterKeys.length === 0
                            && hiddenPinTypes.length === 0
                            && showContainers
                            && showFriendContainers
                            && showStructures
                            && !showNearbyCreatures
                          setActiveFilterKeys([])
                          setHiddenPinTypes(isOnly ? [...PLAYER_VISIBLE_PIN_TYPES] : [])
                          setShowContainers(!isOnly)
                          setShowFriendContainers(!isOnly)
                          setShowStructures(!isOnly)
                          setShowNearbyCreatures(false)
                        },
                      }}
                      containers={{
                        status: containers.status,
                        count: ownContainerCount,
                        active: showContainers,
                        onToggle: () => setShowContainers(!showContainers),
                        onSet: setShowContainers,
                        onShowOnly: () => {
                          const isOnly = activeFilterKeys.length === 0
                            && hiddenPinTypes.length === PLAYER_VISIBLE_PIN_TYPES.size
                            && showContainers
                            && !showFriendContainers
                            && !showStructures
                            && !showNearbyCreatures
                          setActiveFilterKeys([])
                          setHiddenPinTypes([...PLAYER_VISIBLE_PIN_TYPES])
                          setShowContainers(!isOnly)
                          setShowFriendContainers(false)
                          setShowStructures(false)
                          setShowNearbyCreatures(false)
                        },
                        otherWorld: containers.containers.length > 0 && containersOnThisWorld.length === 0,
                      }}
                      friendContainers={{
                        count: friendContainerCount,
                        active: showFriendContainers,
                        onSet: setShowFriendContainers,
                        onShowOnly: () => {
                          const isOnly = showFriendContainers && !showContainers && !showStructures
                            && !showNearbyCreatures && activeFilterKeys.length === 0
                            && hiddenPinTypes.length === PLAYER_VISIBLE_PIN_TYPES.size
                          setActiveFilterKeys([])
                          setHiddenPinTypes([...PLAYER_VISIBLE_PIN_TYPES])
                          setShowContainers(false)
                          setShowStructures(false)
                          setShowNearbyCreatures(false)
                          setShowFriendContainers(!isOnly)
                        },
                      }}
                      mapLayers={[
                        {
                          key: 'structures',
                          kind: 'structures',
                          titleKey: 'map.structures.title',
                          hintKey: baseFallback.operations ? 'baseOperations.observedHint' : 'map.structures.hint',
                          statusKey: worldSaves.readingDatabase
                            ? 'map.structures.statusLoading'
                            : worldSaves.selectedWorld
                              ? 'map.structures.statusNone'
                              : 'map.structures.statusNoWorld',
                          count: structureClusters.length,
                          active: showStructures,
                          onSet: setShowStructures,
                          onShowOnly: () => {
                            const isOnly = activeFilterKeys.length === 0
                              && hiddenPinTypes.length === PLAYER_VISIBLE_PIN_TYPES.size
                              && !showContainers
                              && !showFriendContainers
                              && showStructures
                              && !showNearbyCreatures
                            setActiveFilterKeys([])
                            setHiddenPinTypes([...PLAYER_VISIBLE_PIN_TYPES])
                            setShowContainers(false)
                            setShowFriendContainers(false)
                            setShowStructures(!isOnly)
                            setShowNearbyCreatures(false)
                          },
                        },
                      ]}
                      crafting={{
                        entries: craftFilterEntries,
                        activePlanId: plannerSources.active ? plannerSources.planId : null,
                        onSelect: showCraftSources,
                      }}
                      onToggle={(key) => setActiveFilterKeys((current) => {
                        const next = new Set(current)
                        if (next.has(key)) next.delete(key)
                        else next.add(key)
                        return [...next]
                      })}
                      onSetMany={updateManyFilters}
                      onShowOnly={showOnlyFilters}
                      onClose={() => setFiltersOpen(false)}
                    />
                  </div>
                ) : null}
                {LOCAL_MAP_SPOILER_CONTROLS_ENABLED && canToggleSpoilers && !loading && !error ? (
                  <MapSpoilerControl
                    mode={spoilerMode}
                    characterName={savedCharacterPins.characterName ?? pinIdentity?.characterName ?? null}
                    hint={t(!showSpoilers && liveExploration.restartRequired ? 'map.spoilers.restartExploration'
                      : !showSpoilers && !exploration ? 'map.spoilers.noExploration' : `map.spoilers.mode_${spoilerMode}_hint`)}
                    onChange={(mode) => {
                      if (mode === spoilerMode) return
                      trackSpoilerModeChanged(spoilerMode, mode)
                      setSpoilerMode(mode)
                      setSelectedLocation(null)
                      setSearchFocus(null)
                      setItemSourceSelection(null)
                      setOperationsMapSelection(null)
                      plannerSources.clear()
                    }}
                  />
                ) : null}
              </div>

            </div>
          )}

          <AppToasts />
          <TrackerLocateModal
            visible={surface !== 'settings' && tracking.status === 'error' && tracking.error === 'valheim-not-found'}
            onLocated={tracking.retryInstall}
          />
          {inGame ? <InGameAutoOpenBanner /> : <OnboardingTour />}
          {premiumPlansOpen && <PremiumPlansPanel preview={premiumPreview} onClose={closePremiumPlans} />}
        </section>

        {adRailVisible ? (
          <div className="app-window-ad-column flex shrink-0 items-stretch border-l border-[var(--border)] bg-[var(--background)]">
            <OverwolfAdRail preview={premiumPreview} onRemoveAds={SUBSCRIPTIONS_ENABLED || premiumPreview ? () => setPremiumPlansOpen(true) : undefined} />
          </div>
        ) : null}
      </div>
    </main>
    </ItemSourceContext.Provider>
  )
}
