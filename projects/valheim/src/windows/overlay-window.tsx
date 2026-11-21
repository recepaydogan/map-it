import { Keyboard, MousePointer2, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PlacementRulesMap } from '../components/placement-rules-map'
import { CLOSEST_ZOOM } from '../components/interactive-map-viewport'
import { useGameData } from '../hooks/use-game-data'
import { useHotkeyRebind } from '../hooks/use-hotkey-rebind'
import { useSeedWorld } from '../hooks/use-seed-world'
import { useWorldSaves } from '../hooks/use-world-saves'
import { createSaveLocationMarkers } from '../lib/valheim/save-location-markers'
import { exploredLocationMarkers, locationsFromSaveOrObservations, mapLocationVisibility } from '../lib/valheim/map-location-source'
import { useLivePosition } from '../hooks/use-live-position'
import { useLocationGenerationProfile } from '../hooks/use-location-generation-profile.ts'
import { useClientLocations } from '../hooks/use-client-locations.ts'
import { useCharacterPins } from '../hooks/use-character-pins.ts'
import { createClientLocationMarkers, mergeClientPins } from '../lib/live-tracking/client-locations.ts'
import { useNearbyCreatures } from '../hooks/use-nearby-creatures.ts'
import { useNearbyCreatureCatalog } from '../hooks/use-nearby-creature-catalog.ts'
import { useLocalizationTable } from '../hooks/use-localization-table'
import { dragCurrentWindow, hideWindow } from '../overwolf-utils/window-manager'
import { ALL_LOCATION_FILTER_KEYS, locationMatchesFilters } from '../lib/location-filters'
import { followMapMirror, type MapMirrorState } from '../lib/map-mirror'
import { useMapFilterStore } from '../store/map-filter-store'
import { LOCAL_MAP_SPOILER_CONTROLS_ENABLED } from '../lib/map-features'
import { useLocalExploration } from '../hooks/use-local-exploration'
import type { ExplorationRestriction } from '../lib/valheim/explored-map'
import { ALL_BIOME_KEYS, filterMarkersByBiomes } from '../lib/valheim/marker-biome-filter'
import { readPreferences } from '../store/preferences'
import { isOverwolf } from '../utils/overwolf'
import { cleanCreatureLabel, normalizeCreaturePrefab } from '../lib/live-tracking/creature-catalog.ts'
import { PLAYER_VISIBLE_PIN_TYPES, type MapPinType } from '../lib/valheim/character-save-format.ts'
import { formatHotkeyBinding } from '../lib/hotkey-bindings'
import { capturePageview } from '../lib/analytics/analytics'
import { blockMapOverlayAutoLaunchForSession } from '../overwolf-utils/map-overlay-session'

/** Default (and first-open) size of the mini-map: a square of this side. */
const DEFAULT_SIDE = 360
/** Gap from the game's bottom-right corner on first placement. */
const CORNER_MARGIN = 20
const PLACED_KEY = 'valheim-companion:overlay:placed-v4'
const PREVIOUS_PLACED_KEY = 'valheim-companion:overlay:placed-v3'
const HINT_SEEN_KEY = 'valheim-companion:overlay:cursor-hint-shown'
/** The cursor hint auto-shows on the first few opens, then only lives in the header. */
const HINT_AUTO_SHOWS = 5
const HINT_VISIBLE_MS = 7_000

/**
 * The interaction-mode reminder is shown inside the window each time it
 * becomes visible (so it can never fall outside the game like a separate
 * toast could), fading after a few seconds, for the first HINT_AUTO_SHOWS opens.
 */
function useCursorHint() {
  const [visible, setVisible] = useState(false)
  const [openRevision, setOpenRevision] = useState(0)
  const show = useCallback(() => {
    // This is also the overlay-open signal. It must keep firing after the
    // teaching hint has reached its display limit.
    setOpenRevision((current) => current + 1)
    const shown = Number(window.localStorage.getItem(HINT_SEEN_KEY) ?? '0')
    if (shown >= HINT_AUTO_SHOWS) return
    window.localStorage.setItem(HINT_SEEN_KEY, String(shown + 1))
    setVisible(true)
  }, [])
  useEffect(() => {
    const timer = window.setTimeout(show, 400)
    const onVisibility = () => { if (document.visibilityState === 'visible') show() }
    document.addEventListener('visibilitychange', onVisibility)
    let stateListener: ((event: overwolf.windows.WindowStateChangedEvent) => void) | null = null
    if (isOverwolf()) {
      stateListener = (event) => {
        if (event.window_name === 'overlay' && (event.window_state_ex === 'normal' || event.window_state === 'normal')) show()
      }
      overwolf.windows.onStateChanged.addListener(stateListener)
    }
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
      if (stateListener) overwolf.windows.onStateChanged.removeListener(stateListener)
    }
  }, [show])
  useEffect(() => {
    if (!visible) return
    const timer = window.setTimeout(() => setVisible(false), HINT_VISIBLE_MS)
    return () => window.clearTimeout(timer)
  }, [visible])
  return { visible, openRevision, dismiss: () => setVisible(false) }
}

/**
 * Place new windows bottom-right once the game dimensions are available.
 * Migrate a previously "placed" window only if it is still at Overwolf's
 * centered default; otherwise preserve the user's chosen position and size.
 */
function usePlaceOverlayWindow() {
  useEffect(() => {
    if (!isOverwolf() || window.localStorage.getItem(PLACED_KEY)) return
    let disposed = false
    let inFlight = false
    const tryPlace = () => {
      if (inFlight) return
      inFlight = true
      overwolf.games.getRunningGameInfo((game) => {
        if (disposed) return
        const logicalWidth = game?.logicalWidth || game?.width
        const logicalHeight = game?.logicalHeight || game?.height
        if (!game?.isRunning || !logicalWidth || !logicalHeight) { inFlight = false; return }
        overwolf.windows.getCurrentWindow((result) => {
          if (disposed) return
          if (!result.success) { inFlight = false; return }
          const current = result.window
          const wasPlaced = window.localStorage.getItem(PREVIOUS_PLACED_KEY)
          const centered = Math.abs(current.left - (logicalWidth - current.width) / 2) < 80
            && Math.abs(current.top - (logicalHeight - current.height) / 2) < 80
          if (wasPlaced && !centered) {
            window.localStorage.setItem(PLACED_KEY, '1')
            inFlight = false
            return
          }
          overwolf.windows.changeSize({ window_id: current.id, width: DEFAULT_SIDE, height: DEFAULT_SIDE, auto_dpi_resize: true }, (sized) => {
            if (disposed) return
            if (!sized.success) { inFlight = false; return }
            overwolf.windows.changePosition(
              current.id,
              Math.max(0, logicalWidth - DEFAULT_SIDE - CORNER_MARGIN),
              Math.max(0, logicalHeight - DEFAULT_SIDE - CORNER_MARGIN),
              (moved) => {
                if (!disposed && moved.success) window.localStorage.setItem(PLACED_KEY, '1')
                inFlight = false
              },
            )
          })
        })
      })
    }
    tryPlace()
    const timer = window.setInterval(() => {
      if (window.localStorage.getItem(PLACED_KEY)) {
        window.clearInterval(timer)
        return
      }
      tryPlace()
    }, 500)
    return () => { disposed = true; window.clearInterval(timer) }
  }, [])
}

type DragEdge = 'Left' | 'Right' | 'Top' | 'Bottom' | 'TopLeft' | 'TopRight' | 'BottomLeft' | 'BottomRight'

const RESIZE_EDGES: Array<{ edge: DragEdge; className: string }> = [
  { edge: 'Top', className: 'inset-x-2 top-0 h-1.5 cursor-ns-resize' },
  { edge: 'Bottom', className: 'inset-x-2 bottom-0 h-1.5 cursor-ns-resize' },
  { edge: 'Left', className: 'inset-y-2 left-0 w-1.5 cursor-ew-resize' },
  { edge: 'Right', className: 'inset-y-2 right-0 w-1.5 cursor-ew-resize' },
  { edge: 'TopLeft', className: 'left-0 top-0 size-3 cursor-nwse-resize' },
  { edge: 'TopRight', className: 'right-0 top-0 size-3 cursor-nesw-resize' },
  { edge: 'BottomLeft', className: 'bottom-0 left-0 size-3 cursor-nesw-resize' },
  { edge: 'BottomRight', className: 'bottom-0 right-0 size-3 cursor-nwse-resize' },
]

/** Transparent Overwolf windows have no native frame: edges resize via dragResize. */
const startResize = (edge: DragEdge) => {
  if (!isOverwolf()) return
  overwolf.windows.getCurrentWindow((result) => {
    if (result.success) overwolf.windows.dragResize(result.window.id, edge as overwolf.windows.enums.WindowDragEdge)
  })
}

/**
 * The in-game mini-map: the world map with the player marker, and only the
 * "centre on me" / "follow me" buttons. Opens as a small square bottom-right;
 * resizable to any shape after that.
 * A slim header slides in on hover with the toggle hotkey and a hide button;
 * the rest of the window is the map.
 */
export function OverlayWindow() {
  const { t } = useTranslation()
  useEffect(() => {
    capturePageview('/in-game/map')
  }, [])
  const hideForSession = () => {
    blockMapOverlayAutoLaunchForSession()
    void hideWindow('overlay')
  }

  const { locations, loading, error } = useGameData()
  // First choice: mirror exactly what the desktop map shows (world, marker
  // source, filters, search). It arrives over a BroadcastChannel as soon as
  // the desktop window is up and on every change after that.
  const [mirror, setMirror] = useState<MapMirrorState | null>(null)
  useEffect(() => followMapMirror(setMirror, () => setMirror(null)), [])

  // Fallback while no desktop window answers: rebuild the same view here from
  // the shared preferences (world + save) and the shared filter store.
  const [ownSeedName, setOwnSeedName] = useState(() => readPreferences().worldSeed)
  const [selectedWorldId, setSelectedWorldId] = useState(() => readPreferences().worldSaveId)
  const [locationProfile] = useLocationGenerationProfile(selectedWorldId ?? `seed:${ownSeedName}`)
  const worldSaves = useWorldSaves(mirror ? null : selectedWorldId)
  const useSaveMarkers = selectedWorldId !== null && (
    worldSaves.selectedWorld === null || worldSaves.selectedWorld.databasePath !== null
  )
  const savedMarkers = useMemo(
    () => createSaveLocationMarkers(worldSaves.database?.locations ?? [], locations),
    [locations, worldSaves.database],
  )
  const seedName = mirror?.seedName ?? ownSeedName
  const tracking = useLivePosition(false)
  const clientLocations = useClientLocations(worldSaves.selectedWorld, tracking.status === 'tracking' ? tracking.position : null, !mirror)
  const customMarkerWorldUid = worldSaves.selectedWorld?.uid || clientLocations.world?.worldUid
  const customMarkerWorldKey = mirror?.customMarkerWorldKey ?? (customMarkerWorldUid
    ? `world:${customMarkerWorldUid}`
    : selectedWorldId ? `save:${selectedWorldId}` : `seed:${seedName}`)
  const spoilerMode = useMapFilterStore((state) => LOCAL_MAP_SPOILER_CONTROLS_ENABLED ? state.spoilerMode : 'full')
  const showSpoilers = spoilerMode === 'full'
  const ownVisibility = mapLocationVisibility(worldSaves.selectedWorld, clientLocations.snapshot?.isServer, showSpoilers)
  const observedLocationsOnly = mirror ? Boolean(mirror.observedLocationsOnly)
    : ownVisibility.observedOnly
  const ownPins = useCharacterPins(mirror ? null : worldSaves.selectedWorld?.uid || clientLocations.world?.worldUid || null,
    clientLocations.snapshot?.characterName ?? null, 0, null, !mirror && ownVisibility.canToggleSpoilers && !showSpoilers)
  const hideUnexploredLocations = ownVisibility.canToggleSpoilers && !showSpoilers
  const showUnexploredTerrain = mirror ? Boolean(mirror.showUnexploredTerrain) : ownVisibility.canToggleSpoilers && spoilerMode === 'terrain'
  const liveExploration = useLocalExploration(!mirror && hideUnexploredLocations, worldSaves.selectedWorld ? {
    uid: worldSaves.selectedWorld.uid, name: worldSaves.selectedWorld.name, seedName: worldSaves.selectedWorld.seedName,
    characterId: clientLocations.snapshot?.characterName ? ownPins.characterPlayerId : null,
    characterName: clientLocations.snapshot?.characterName ?? (tracking.status === 'tracking' ? null : ownPins.characterName),
    manualCharacter: false,
  } : null, tracking.status !== 'tracking' || clientLocations.snapshot?.isServer === true)
  const exploration: ExplorationRestriction = mirror ? mirror.exploration
    : hideUnexploredLocations ? liveExploration.exploration ?? (tracking.status === 'tracking' && !clientLocations.snapshot?.characterName
      ? null : ownPins.exploration) : undefined
  const seedWorld = useSeedWorld(ownSeedName, locations, !mirror && !useSaveMarkers && !observedLocationsOnly, locationProfile)
  const observedMarkers = useMemo(() => createClientLocationMarkers(clientLocations.observations, locations), [clientLocations.observations, locations])
  const saveAndObservedMarkers = useMemo(() => locationsFromSaveOrObservations(savedMarkers, observedMarkers), [savedMarkers, observedMarkers])
  const mapMarkers = useMemo(() => {
    if (mirror) return mirror.markers
    if (hideUnexploredLocations) return exploredLocationMarkers(
      useSaveMarkers ? saveAndObservedMarkers : observedMarkers, exploration ?? null,
    )
    return observedLocationsOnly ? observedMarkers : useSaveMarkers ? saveAndObservedMarkers : seedWorld.markers
  }, [mirror, hideUnexploredLocations, useSaveMarkers, saveAndObservedMarkers, observedMarkers,
    exploration, observedLocationsOnly, seedWorld.markers])
  const localization = useLocalizationTable()
  const { bindings, status: hotkeyStatus } = useHotkeyRebind()
  const hotkey = hotkeyStatus === 'loading'
    ? t('common.loading')
    : bindings.toggle_overlay
      ? formatHotkeyBinding(bindings.toggle_overlay)
      : t('overlay.hotkeyUnassigned')
  // The mini-map mirrors the desktop map: same world and the same location
  // filters. Both are persisted per app, and a change made in the other window
  // arrives here through the storage event.
  const activeFilterKeys = useMapFilterStore((state) => state.activeFilterKeys)
  const selectedBiomes = useMapFilterStore((state) => state.selectedBiomes)
  const setActiveFilterKeys = useMapFilterStore((state) => state.setActiveFilterKeys)
  const setSelectedBiomes = useMapFilterStore((state) => state.setSelectedBiomes)
  const observedFiltersInitializedFor = useRef<{ worldId: string | null; initialized: boolean }>({ worldId: null, initialized: false })
  useEffect(() => {
    if (observedFiltersInitializedFor.current.worldId !== selectedWorldId) {
      observedFiltersInitializedFor.current = { worldId: selectedWorldId, initialized: false }
    }
    if (mirror || worldSaves.selectedWorld?.databasePath !== null || clientLocations.snapshot?.isServer !== true
      || observedMarkers.length === 0 || observedFiltersInitializedFor.current.initialized) return
    observedFiltersInitializedFor.current.initialized = true
    setActiveFilterKeys([...ALL_LOCATION_FILTER_KEYS])
    setSelectedBiomes([...ALL_BIOME_KEYS])
  }, [clientLocations.snapshot?.isServer, mirror, observedLocationsOnly, observedMarkers, selectedWorldId,
    setActiveFilterKeys, setSelectedBiomes, worldSaves.selectedWorld?.databasePath])
  const hiddenPinTypes = useMapFilterStore((state) => state.hiddenPinTypes)
  const showStructures = useMapFilterStore((state) => state.showStructures)
  const showNearbyCreatures = useMapFilterStore((state) => state.showNearbyCreatures)
  const nearbyCreatures = useNearbyCreatures(!mirror && showNearbyCreatures)
  const nearbyCreatureCatalog = useNearbyCreatureCatalog()
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'valheim-companion:map-filters') void useMapFilterStore.persist.rehydrate()
      if (event.key === 'valheim-companion:preferences') {
        const preferences = readPreferences()
        setOwnSeedName(preferences.worldSeed)
        setSelectedWorldId(preferences.worldSaveId)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  const visibleLocationIds = useMemo(() => {
    if (mirror) return new Set(mirror.visibleLocationIds)
    const activeFilters = new Set(activeFilterKeys)
    return new Set(locations
      .filter((location) => location.enabled && locationMatchesFilters(location, activeFilters))
      .map((location) => location.id))
  }, [activeFilterKeys, locations, mirror])
  const displayMarkers = useMemo(() => mirror ? mapMarkers : filterMarkersByBiomes(mapMarkers, seedName, selectedBiomes),
    [mapMarkers, mirror, seedName, selectedBiomes])
  const creaturesOnThisWorld = useMemo(() => {
    const selectedUid = mirror?.worldUid ?? worldSaves.selectedWorld?.uid ?? null
    if (selectedUid && nearbyCreatures.worldUid && selectedUid !== nearbyCreatures.worldUid) return []
    return nearbyCreatures.creatures
  }, [mirror?.worldUid, nearbyCreatures.creatures, nearbyCreatures.worldUid, worldSaves.selectedWorld?.uid])
  const ambientNearbyCreatureSet = useMemo(
    () => new Set(nearbyCreatureCatalog.map((entry) => normalizeCreaturePrefab(entry.prefab))),
    [nearbyCreatureCatalog],
  )
  const visibleNearbyCreatures = useMemo(
    () => creaturesOnThisWorld.filter((creature) =>
      ambientNearbyCreatureSet.has(normalizeCreaturePrefab(creature.prefab))),
    [ambientNearbyCreatureSet, creaturesOnThisWorld],
  )
  const fallbackVisiblePinTypes = useMemo(() => new Set<MapPinType>(
    [...PLAYER_VISIBLE_PIN_TYPES].filter((type) => !hiddenPinTypes.includes(type)),
  ), [hiddenPinTypes])
  const mirroredVisiblePinTypes = useMemo(
    () => new Set<MapPinType>(mirror?.visiblePinTypes ?? []),
    [mirror?.visiblePinTypes],
  )
  const overlayContainers = useMemo(() => {
    if (!mirror || mirror.containers.length === 0) return undefined
    return {
      list: mirror.containers,
      live: mirror.containersLive,
      containerName: (token: string, prefab: string) =>
        (token ? localization?.[token] ?? localization?.[token.replace(/^\$/, '')] : null)
        ?? prefab
        ?? 'Chest',
      itemFor: () => null,
    }
  }, [localization, mirror])
  usePlaceOverlayWindow()
  const cursorHint = useCursorHint()

  return (
    <main className="group/overlay relative h-screen w-screen overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--overlay-background)] shadow-2xl">
      <div className="absolute inset-0">
        {loading ? (
          <div className="grid h-full place-items-center text-sm text-[var(--muted)]">{t('common.loading')}</div>
        ) : error ? (
          <div className="grid h-full place-items-center p-6 text-center text-sm text-[var(--muted)]">{t('map.loadError')}</div>
        ) : (
          <PlacementRulesMap
            exploration={exploration}
            showUnexploredTerrain={showUnexploredTerrain}
            variant="overlay"
            filtersOpen={false}
            selected={null}
            onSelect={() => {}}
            onClearSelection={() => {}}
            locations={locations}
            visibleLocationIds={visibleLocationIds}
            seedName={seedName}
            customMarkerWorldKey={customMarkerWorldKey}
            generatedMarkers={displayMarkers}
            generating={seedWorld.generating || worldSaves.readingDatabase}
            loadingWorldSave={false}
            generationProgress={seedWorld.progress}
            generationError={seedWorld.error}
            playerPosition={tracking.position}
            followPlayerByDefault
            closestPlayerZoomSignal={cursorHint.openRevision}
            cameraKey="overlay-map"
            initialZoom={CLOSEST_ZOOM}
            playerPins={mirror?.playerPins ?? mergeClientPins(ownPins.pins, clientLocations.snapshot,
              ownPins.characterName)}
            visiblePinTypes={mirror ? mirroredVisiblePinTypes : fallbackVisiblePinTypes}
            translatePinToken={(token) => localization?.[token] ?? localization?.[token.replace(/^\$/, '')] ?? null}
            containers={overlayContainers}
            structurePaths={mirror
              ? mirror.structurePaths
              : showStructures ? worldSaves.database?.structurePaths : undefined}
            nearbyCreatures={mirror
              ? mirror.nearbyCreatures
              : showNearbyCreatures ? visibleNearbyCreatures : undefined}
            translateCreatureToken={(token) =>
              cleanCreatureLabel(
                localization?.[token] ?? localization?.[token.replace(/^\$/, '')] ?? '',
              ) || null}
          />
        )}
      </div>
      {cursorHint.visible ? (
        <button
          type="button"
          onClick={cursorHint.dismiss}
          className="absolute inset-x-0 top-0 z-40 flex h-7 cursor-pointer items-center justify-center gap-1.5 border-b border-[var(--accent)]/40 bg-[var(--overlay-background)]/95 px-2 text-[11px] text-[var(--text)] animate-[fade-in_200ms_ease-out]"
          aria-label={t('overlay.cursorHintDismiss')}
        >
          <MousePointer2 size={12} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
          <span className="truncate">{t('overlay.cursorHint')}</span>
        </button>
      ) : null}
      {RESIZE_EDGES.map(({ edge, className }) => (
        <div key={edge} className={`absolute z-[60] ${className}`} onMouseDown={() => startResize(edge)} aria-hidden="true" />
      ))}
      {/* Hover header: hotkey on the left, drag anywhere, hide on the right. */}
      <header
        className="absolute inset-x-0 top-0 z-50 flex h-7 -translate-y-full items-center border-b border-[var(--border)]/70 bg-[var(--overlay-background)]/95 transition-transform duration-150 group-hover/overlay:translate-y-0 focus-within:translate-y-0"
      >
        <button
          type="button"
          className="flex h-full min-w-0 flex-1 cursor-move select-none items-center gap-1.5 px-2 text-left"
          onMouseDown={dragCurrentWindow}
          aria-label={t('overlay.drag')}
        >
          <span className="flex min-w-0 items-center gap-1 truncate text-[10.5px] text-[var(--muted)]" title={`${t('overlay.hotkeyHint')} ${hotkey} · ${t('overlay.cursorShort')}`}>
            <Keyboard size={12} className="shrink-0" aria-hidden="true" />
            <kbd className="rounded-[4px] border border-[var(--border-strong)] bg-black/30 px-1 py-px font-mono text-[10px] font-semibold text-[var(--text)]">{hotkey}</kbd>
            <span className="mx-0.5 text-[var(--border-strong)]">·</span>
            <MousePointer2 size={12} className="shrink-0" aria-hidden="true" />
            <span>{t('overlay.cursorShort')}</span>
          </span>
        </button>
        <button
          type="button"
          onClick={hideForSession}
          className="grid h-full w-8 cursor-pointer place-items-center text-[var(--muted)] transition-colors hover:bg-[var(--danger)] hover:text-white"
          aria-label={t('overlay.hide')}
          title={t('overlay.hide')}
        >
          <X size={13} aria-hidden="true" />
        </button>
      </header>
    </main>
  )
}
