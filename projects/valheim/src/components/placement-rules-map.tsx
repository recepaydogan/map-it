import { LoaderCircle, LocateFixed, MapPinPlus, Navigation } from 'lucide-react'
import { CLOSEST_ZOOM, MAP_SIZE_PX } from './interactive-map-viewport'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocationRecord } from '../types/game-data'
import { LocationDetailPanel } from './location-detail-panel'
import { ContainerDetailPanel } from './container-detail-panel'
import { SeedBiomeMap } from './seed-biome-map'
import { SeedLocationLayer } from './seed-location-layer'
import type { GeneratedLocationMarker } from '../lib/valheim/location-generator'
import { InteractiveMapViewport } from './interactive-map-viewport'
import { formatLocationName, locationNameLabelKey } from '../lib/location-presentation'
import type { PlayerPosition } from '../lib/live-tracking/tracking-installer'
import { PlayerPositionMarker } from './player-position-marker'
import { smoothedPlayerPosition } from '../lib/live-tracking/smoothed-position'
import { livePositionFeed } from '../lib/live-tracking/live-position-feed'
import { getDesktopMapFollow, setDesktopMapFollow, subscribeDesktopMapFollow } from '../lib/live-tracking/desktop-map-follow'
import { cn } from '../lib/cn'
import { ResourceNodePoints } from './resource-node-points'
import { ResourceAreaLayer, type ResourceAreaMaterial } from './resource-area-layer'
import { PlayerPinLayer } from './player-pin-layer'
import { ContainerLayer, type ContainerItemPresentation } from './container-layer'
import type { RememberedContainer } from '../lib/live-tracking/container-types'
import type { CharacterMapPin, MapPinType } from '../lib/valheim/character-save-format'
import type { PlannerMapSourcePoint } from '../store/planner-map-source-store'
import type { NearbyCreature } from '../lib/live-tracking/creature-types.ts'
import { StructureLayer } from './structure-layer.tsx'
import { NearbyCreatureLayer } from './nearby-creature-layer.tsx'
import { MapControlTooltip } from './map-marker-tooltip'
import { CustomMarkerLayer } from './custom-marker-layer'
import { CustomMarkerDetail } from './custom-marker-detail'
import { CustomMarkerDialog } from './custom-marker-dialog'
import { useCustomMarkerStore } from '../store/custom-marker-store'
import { useCustomMarkerUi } from '../store/custom-marker-ui'
import { selectionLandingOffset } from '../lib/map-selection-navigation'
import { filterExploredPoints, isMapPointVisible, type ExplorationRestriction } from '../lib/valheim/explored-map'
import { explorationMaskImage } from '../lib/valheim/exploration-mask'
import { PersonalExplorationGuide } from './personal-exploration-guide'
import type { SmallExploration } from '../lib/valheim/personal-exploration-intro'
import { useMarkerProgress } from '../hooks/use-marker-progress'
import { isProgressMarkerVisible, locationProgressId } from '../lib/marker-progress'

interface PlacementRulesMapProps {
  exploration?: ExplorationRestriction
  showUnexploredTerrain?: boolean
  explorationContext?: string
  filtersOpen: boolean
  selected: {
    location: LocationRecord
    marker: GeneratedLocationMarker | null
  } | null
  onSelect: (location: LocationRecord, marker: GeneratedLocationMarker) => void
  onSelectContainer?: (container: RememberedContainer) => void
  onClearSelection: () => void
  locations: LocationRecord[]
  visibleLocationIds: ReadonlySet<string>
  seedName: string
  customMarkerWorldKey?: string
  onStartCustomMarkerPlacement?: () => void
  generatedMarkers: GeneratedLocationMarker[]
  generating: boolean
  loadingWorldSave: boolean
  generationProgress: null | { completed: number; total: number; prefabName: string }
  generationError: string | null
  playerPosition?: PlayerPosition | null
  /** Exact resource-node positions from a selected material or planner source. */
  resourcePoints?: PlannerMapSourcePoint[]
  /** Save-backed source areas for the selected materials. */
  resourceAreas?: readonly ResourceAreaMaterial[]
  highlightedResourceKey?: string | null
  /** One-shot camera travel target (planner "Go" navigation). */
  focusTarget?: PlannerMapSourcePoint | null
  /** Keeps pan and zoom across map visits; the full map also saves them on disk. */
  cameraKey?: string
  initialZoom?: number
  /** Camera follows the player marker until the user pans; default per window. */
  followPlayerByDefault?: boolean
  desktopFollow?: boolean
  /** Changes whenever an overlay is shown and must reopen at the closest zoom. */
  closestPlayerZoomSignal?: number
  /**
   * `overlay`: the in-game mini-map — compact +/- plus centre/follow controls,
   * with compact loading feedback. Everything else stays interactive.
   */
  variant?: 'full' | 'overlay'
  /** Node prefab → catalog kind, for resource point icons. */
  nodeKindFor?: (nodePrefab: string) => string | undefined
  /** The player's own pins from the character save. */
  playerPins?: CharacterMapPin[]
  visiblePinTypes?: ReadonlySet<MapPinType>
  translatePinToken?: (token: string) => string | null
  /** The player's tracked chests, drawn with their contents on hover/click. */
  containers?: {
    list: readonly RememberedContainer[]
    live: boolean
    containerName: (token: string, prefab: string) => string
    itemFor: (prefab: string) => ContainerItemPresentation | null
    highlightId?: string | null
    /** Opens this chest's detail panel when planner navigation lands on it. */
    openId?: string | null
  }
  /** Save-backed, top-down geometry of player-placed building pieces. */
  structurePaths?: readonly string[]
  /** Live creatures inside the tracker's bounded scan radius. */
  nearbyCreatures?: readonly NearbyCreature[]
  translateCreatureToken?: (token: string) => string | null
}

const MAP_PANEL_TOP_OFFSET = 52
const MAP_PANEL_LEFT_OFFSET = 8
const FILTER_RAIL_PANEL_LEFT_OFFSET = 320
/** Clearance between the selected pin's tooltip and its open detail panel. */
const MARKER_PANEL_GAP = 72
const WORLD_DIAMETER = 21_000
const FOG_TEXTURE = `url("data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".55" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#n)" opacity=".04"/></svg>')}")`

const toMapPoint = (x: number, z: number) => ({
  x: x / WORLD_DIAMETER + 0.5,
  y: 0.5 - z / WORLD_DIAMETER,
})

type MapSelectionFocus = {
  kind: 'generated' | 'custom'
  id: string
  x: number
  y: number
  lastLanding?: { x: number; y: number }
}

/**
 * Camera follow: while enabled, re-centres every frame on the smoothed marker
 * position so the camera glides with the marker rather than stepping with the
 * raw samples. Zoom stays whatever the user chose.
 */
function FollowPlayerCamera({ centerOn }: { centerOn: (x: number, y: number) => void }) {
  useEffect(() => {
    // Driven by the sample feed, not animation frames: Overwolf throttles
    // frames for a window behind the game, samples keep arriving regardless.
    const follow = (x: number, z: number) => {
      const point = toMapPoint(x, z)
      centerOn(point.x, point.y)
    }
    if (smoothedPlayerPosition.valid) follow(smoothedPlayerPosition.x, smoothedPlayerPosition.z)
    return livePositionFeed.subscribe((sample) => { if (sample) follow(sample.x, sample.z) })
  }, [centerOn])
  return null
}

export function PlacementRulesMap({
  exploration,
  showUnexploredTerrain = false,
  explorationContext,
  filtersOpen,
  selected: requestedSelection,
  onSelect,
  onSelectContainer,
  onClearSelection,
  locations,
  visibleLocationIds,
  seedName,
  customMarkerWorldKey,
  onStartCustomMarkerPlacement,
  generatedMarkers: allGeneratedMarkers,
  generating,
  loadingWorldSave,
  generationProgress,
  generationError,
  playerPosition,
  resourcePoints: allResourcePoints,
  resourceAreas: allResourceAreas,
  highlightedResourceKey,
  focusTarget: requestedFocusTarget,
  cameraKey,
  initialZoom,
  followPlayerByDefault = false,
  desktopFollow = false,
  closestPlayerZoomSignal,
  variant = 'full',
  nodeKindFor,
  playerPins: allPlayerPins,
  visiblePinTypes,
  translatePinToken,
  containers: allContainers,
  structurePaths,
  nearbyCreatures: allNearbyCreatures,
  translateCreatureToken,
}: PlacementRulesMapProps) {
  const { t } = useTranslation()
  const progressWorldKey = customMarkerWorldKey ?? `seed:${seedName}`
  const { found, favorites, hideFound, hideFavorites } = useMarkerProgress(progressWorldKey)
  const layerMask = useMemo(() => exploration ? explorationMaskImage(exploration) : undefined, [exploration])
  const layerMaskStyle = useMemo<CSSProperties>(() => ({
    visibility: exploration === null ? 'hidden' : undefined,
    maskImage: layerMask, WebkitMaskImage: layerMask,
    maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
  }), [exploration, layerMask])
  const introContext = variant === 'full' && !showUnexploredTerrain && exploration !== undefined ? explorationContext : undefined
  const personalCameraKey = introContext ? `${cameraKey ?? 'map'}:personal:${introContext}` : cameraKey
  const [interactedContext, setInteractedContext] = useState<string | null>(null)
  const markCameraInteraction = useCallback(() => { if (introContext) setInteractedContext(introContext) }, [introContext])
  const generatedMarkers = useMemo(() => allGeneratedMarkers.filter(marker => isMapPointVisible(exploration, marker.x, marker.y)
    && isProgressMarkerVisible(locationProgressId(marker), found, favorites, hideFound, hideFavorites)),
  [allGeneratedMarkers, exploration, found, favorites, hideFound, hideFavorites])
  const playerPins = useMemo(() => allPlayerPins && filterExploredPoints(allPlayerPins, exploration), [allPlayerPins, exploration])
  const resourcePoints = useMemo(() => allResourcePoints && filterExploredPoints(allResourcePoints, exploration), [allResourcePoints, exploration])
  const resourceAreas = useMemo(() => exploration === undefined ? allResourceAreas
    : allResourceAreas?.map(material => ({ ...material, points: filterExploredPoints(material.points, exploration) })), [allResourceAreas, exploration])
  const nearbyCreatures = useMemo(() => allNearbyCreatures && filterExploredPoints(allNearbyCreatures, exploration), [allNearbyCreatures, exploration])
  const containers = useMemo(() => allContainers && { ...allContainers, list: filterExploredPoints(allContainers.list, exploration) }, [allContainers, exploration])
  const selected = requestedSelection && (exploration === undefined || (requestedSelection.marker
    && isMapPointVisible(exploration, requestedSelection.marker.x, requestedSelection.marker.y))) ? requestedSelection : null
  const focusTarget = requestedFocusTarget && isMapPointVisible(exploration, requestedFocusTarget.x, requestedFocusTarget.z) ? requestedFocusTarget : null
  const allCustomMarkers = useCustomMarkerStore((state) => state.markers)
  const hiddenCustomCategories = useCustomMarkerStore((state) => state.hiddenCategories)
  const addCustomMarker = useCustomMarkerStore((state) => state.add)
  const removeCustomMarker = useCustomMarkerStore((state) => state.remove)
  const moveCustomMarker = useCustomMarkerStore((state) => state.move)
  const customMarkers = useMemo(() => allCustomMarkers.filter((marker) => marker.worldKey === customMarkerWorldKey
    && isMapPointVisible(exploration, marker.x, marker.z)), [allCustomMarkers, customMarkerWorldKey, exploration])
  const visibleCustomMarkers = useMemo(() => customMarkers.filter(marker => !hiddenCustomCategories.includes(marker.category)
    && isProgressMarkerVisible(marker.id, found, favorites, hideFound, hideFavorites)),
  [customMarkers, hiddenCustomCategories, found, favorites, hideFound, hideFavorites])
  const placingMarker = useCustomMarkerUi((state) => state.placing)
  const setPlacingMarker = useCustomMarkerUi((state) => state.setPlacing)
  const pendingCustomMarker = useCustomMarkerUi((state) => state.pending)
  const beginCustomMarkerPlacement = useCustomMarkerUi((state) => state.beginPlacement)
  const selectedCustomId = useCustomMarkerUi((state) => state.selectedId)
  const setSelectedCustomId = useCustomMarkerUi((state) => state.select)
  const [creatingCustomMarker, setCreatingCustomMarker] = useState(false)
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null)
  const selectedCustom = customMarkers.find((marker) => marker.id === selectedCustomId) ?? null
  const editingCustom = customMarkers.find((marker) => marker.id === editingCustomId) ?? null
  const mapRootRef = useRef<HTMLDivElement>(null)
  const focusMarkerRef = useRef<((x: number, y: number, offsetX?: number, offsetY?: number) => void) | null>(null)
  const mapSelectionFocusRef = useRef<MapSelectionFocus | null>(null)
  const [selectionPanelLayoutVersion, setSelectionPanelLayoutVersion] = useState(0)

  // The panel and persistent marker label mount in the same selection render.
  // Read their actual rectangles before paint and leave the camera alone when
  // both remain visible, matching the map-click behavior in WoW Forever Map.
  useLayoutEffect(() => {
    const focus = mapSelectionFocusRef.current
    if (!focus || (focus.kind === 'generated' ? selected?.marker?.id !== focus.id : selectedCustomId !== focus.id)) return
    const root = mapRootRef.current
    const viewport = root?.querySelector<HTMLElement>('[data-map-viewport]')
    const panel = root?.querySelector<HTMLElement>(`[data-map-selection-panel="${focus.kind}"]`)
    const marker = root?.querySelector<HTMLElement>(`[data-map-selected-marker="${focus.kind}"]`)
    const tooltip = root?.querySelector<HTMLElement>(`[data-map-selected-tooltip="${focus.kind}"]`)
    if (!viewport || !panel || !marker) return
    const landing = selectionLandingOffset(
      viewport.getBoundingClientRect(), panel.getBoundingClientRect(),
      marker.getBoundingClientRect(), tooltip?.getBoundingClientRect() ?? null,
      MARKER_PANEL_GAP,
    )
    if (!landing) return
    if (focus.lastLanding && Math.abs(focus.lastLanding.x - landing.x) < 1 && Math.abs(focus.lastLanding.y - landing.y) < 1) return
    focus.lastLanding = landing
    focusMarkerRef.current?.(focus.x, focus.y, landing.x, landing.y)
  }, [filtersOpen, selected, selectedCustomId, selectionPanelLayoutVersion])

  useEffect(() => {
    const focus = mapSelectionFocusRef.current
    if (!focus || (focus.kind === 'generated' ? selected?.marker?.id !== focus.id : selectedCustomId !== focus.id)) return
    const panel = mapRootRef.current?.querySelector<HTMLElement>(`[data-map-selection-panel="${focus.kind}"]`)
    if (!panel) return
    const observer = new ResizeObserver(() => setSelectionPanelLayoutVersion((version) => version + 1))
    observer.observe(panel)
    return () => observer.disconnect()
  }, [filtersOpen, selected, selectedCustomId])
  useEffect(() => {
    if (!placingMarker) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      setPlacingMarker(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [placingMarker, setPlacingMarker])
  useEffect(() => {
    const timer = window.setTimeout(() => { setCreatingCustomMarker(false); setEditingCustomId(null); setSelectedCustomId(null); setPlacingMarker(false) }, 0)
    return () => window.clearTimeout(timer)
  }, [customMarkerWorldKey, setPlacingMarker, setSelectedCustomId])
  const [terrainState, setTerrainState] = useState<{ seedName: string; status: 'rendering' | 'ready' | 'error' } | null>(null)
  const renderingTerrain = terrainState?.seedName !== seedName || terrainState.status === 'rendering'
  const terrainError = terrainState?.seedName === seedName && terrainState.status === 'error'
  const [selectedContainer, setSelectedContainer] = useState<RememberedContainer | null>(null)
  const [localFollowPlayer, setLocalFollowPlayer] = useState(followPlayerByDefault)
  const desktopMapFollow = useSyncExternalStore(subscribeDesktopMapFollow, getDesktopMapFollow)
  const followPlayer = desktopFollow ? desktopMapFollow : localFollowPlayer
  const setFollowPlayer = useCallback((enabled: boolean) => {
    if (desktopFollow) setDesktopMapFollow(enabled)
    else setLocalFollowPlayer(enabled)
  }, [desktopFollow])
  const firstLivePositionHandled = useRef(false)
  const focusPointRef = useRef<((x: number, y: number, zoom: number) => void) | null>(null)
  const currentZoomRef = useRef(1)
  const focusInitialExploration = useCallback((summary: SmallExploration) => {
    const bounds = mapRootRef.current?.getBoundingClientRect()
    if (!focusPointRef.current || !bounds?.width || !bounds.height) return false
    const availableWidth = Math.max(160, bounds.width - (filtersOpen ? 320 : 0) - 64)
    const availableHeight = Math.max(160, bounds.height - 180)
    const span = Math.max(summary.width, summary.height, 250) * 1.6
    const zoom = Math.min(CLOSEST_ZOOM, Math.max(4, Math.min(availableWidth, availableHeight) * WORLD_DIAMETER / (MAP_SIZE_PX * span)))
    const point = toMapPoint(summary.x, summary.z)
    const offset = filtersOpen ? Math.min(160, Math.max(0, (bounds.width - 240) / 2)) : 0
    focusPointRef.current(point.x - offset / (MAP_SIZE_PX * zoom), point.y, zoom)
    return true
  }, [filtersOpen])
  const handledFocusTarget = useRef('')
  const stopFollowing = useCallback(() => setFollowPlayer(false), [setFollowPlayer])
  // Both buttons snap to the closest zoom on the player: the freshest sample
  // wins over the once-a-second React copy so the jump lands where they are.
  const jumpToPlayer = useCallback((zoom: number = CLOSEST_ZOOM) => {
    const live = livePositionFeed.latest ?? playerPosition
    if (!live) return
    const point = toMapPoint(live.x, live.z)
    focusPointRef.current?.(point.x, point.y, zoom)
  }, [playerPosition])
  // The minimap confirms its opening follow state on the first sample.
  useEffect(() => {
    if (!followPlayerByDefault || !playerPosition || firstLivePositionHandled.current) return
    firstLivePositionHandled.current = true
    const timer = window.setTimeout(() => setFollowPlayer(true), 0)
    return () => window.clearTimeout(timer)
  }, [followPlayerByDefault, playerPosition, setFollowPlayer])
  // A map that starts in follow mode (the overlay) opens zoomed onto the player.
  const initialJumpDone = useRef(!followPlayerByDefault)
  useEffect(() => {
    if (initialJumpDone.current || !playerPosition) return
    initialJumpDone.current = true
    jumpToPlayer()
  }, [jumpToPlayer, playerPosition])
  const handledClosestZoomSignal = useRef<number | null>(null)
  useEffect(() => {
    if (
      closestPlayerZoomSignal === undefined
      || handledClosestZoomSignal.current === closestPlayerZoomSignal
      || !playerPosition
    ) return
    handledClosestZoomSignal.current = closestPlayerZoomSignal
    const timer = window.setTimeout(() => {
      setFollowPlayer(true)
      jumpToPlayer(CLOSEST_ZOOM)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [closestPlayerZoomSignal, jumpToPlayer, playerPosition, setFollowPlayer])

  // When a location is selected, dismiss any open container panel
  useEffect(() => {
    if (!selected) return
    const timer = window.setTimeout(() => { setSelectedContainer(null); setSelectedCustomId(null) }, 0)
    return () => window.clearTimeout(timer)
  }, [selected, setSelectedCustomId])

  // Keep selected container in sync with fresh snapshot
  useEffect(() => {
    if (!selectedContainer || !containers) return
    const fresh = containers.list.find((entry) => entry.id === selectedContainer.id)
    if (fresh === selectedContainer) return
    const timer = window.setTimeout(() => setSelectedContainer(fresh ?? null), 0)
    return () => window.clearTimeout(timer)
  }, [containers, selectedContainer])

  // "Find in your chests" should behave like clicking the destination marker,
  // not merely ring it. Keep the request one-shot while allowing a later visit
  // to the same chest after planner source mode has been cleared.
  const handledContainerOpenId = useRef<string | null>(null)
  const pendingContainerOpenId = useRef<string | null>(null)
  const requestedContainerOpenId = containers?.openId ?? null
  useEffect(() => {
    if (!requestedContainerOpenId) {
      handledContainerOpenId.current = null
      pendingContainerOpenId.current = null
      return
    }
    if (
      !containers
      || handledContainerOpenId.current === requestedContainerOpenId
      || pendingContainerOpenId.current === requestedContainerOpenId
    ) return
    const target = containers.list.find((entry) => entry.id === requestedContainerOpenId)
    if (!target) return
    pendingContainerOpenId.current = requestedContainerOpenId
    const timer = window.setTimeout(() => {
      pendingContainerOpenId.current = null
      handledContainerOpenId.current = requestedContainerOpenId
      onClearSelection()
      setSelectedContainer(target)
      onSelectContainer?.(target)
    }, 0)
    return () => {
      window.clearTimeout(timer)
      if (pendingContainerOpenId.current === requestedContainerOpenId) {
        pendingContainerOpenId.current = null
      }
    }
  }, [containers, onClearSelection, onSelectContainer, requestedContainerOpenId])

  // Planner "Go" navigation takes the camera elsewhere: stop following.
  const focusKey = focusTarget ? focusTarget.focusId ?? `${focusTarget.x}:${focusTarget.z}` : ''
  useEffect(() => {
    if (!focusKey) return
    const timer = window.setTimeout(() => setFollowPlayer(false), 0)
    return () => window.clearTimeout(timer)
  }, [focusKey, setFollowPlayer])

  const visibleGeneratedMarkers = useMemo(
    () => generatedMarkers.filter((marker) => visibleLocationIds.has(marker.locationId)).length,
    [generatedMarkers, visibleLocationIds],
  )

  const generationLocationName = useMemo(() => {
    if (!generationProgress) return ''
    return t(locationNameLabelKey(generationProgress.prefabName), {
      defaultValue: formatLocationName(generationProgress.prefabName),
    })
  }, [generationProgress, t])

  return (
    <div ref={mapRootRef} className="relative h-full min-h-0 overflow-hidden bg-[var(--map-background)] [container-type:size]">
      <div className="absolute inset-0 bg-[#020507] bg-cover bg-center" style={{ backgroundImage: 'url(/game-data/map-textures/space.png)' }} aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_32%,rgba(0,0,0,0.22)_68%,rgba(0,0,0,0.72)_100%)]" aria-hidden="true" />
      <InteractiveMapViewport
        key={variant === 'full' ? `${personalCameraKey ?? 'map'}:seed:${seedName}` : personalCameraKey}
        className={cn('absolute inset-0 overflow-hidden', placingMarker && customMarkerWorldKey && 'cursor-crosshair')}
        onMapClickCapture={(event) => {
          if (!placingMarker || !customMarkerWorldKey || !pendingCustomMarker) return
          if ((event.target as Element).closest('button')) return
          const circle = event.currentTarget.querySelector('[data-map-circle]')
          const bounds = circle?.getBoundingClientRect()
          if (!bounds) return
          const x = (event.clientX - bounds.left) / bounds.width
          const y = (event.clientY - bounds.top) / bounds.height
          if ((x - 0.5) ** 2 + (y - 0.5) ** 2 > 0.25) return
          if (!isMapPointVisible(exploration, (x - 0.5) * WORLD_DIAMETER, (0.5 - y) * WORLD_DIAMETER)) return
          event.stopPropagation()
          event.preventDefault()
          setFollowPlayer(false)
          onClearSelection()
          setSelectedContainer(null)
          const id = addCustomMarker({ ...pendingCustomMarker, worldKey: customMarkerWorldKey, x: (x - 0.5) * WORLD_DIAMETER, z: (0.5 - y) * WORLD_DIAMETER })
          setSelectedCustomId(id)
          setPlacingMarker(false)
        }}
        cameraKey={variant === 'full' && personalCameraKey ? `${personalCameraKey}:seed:${seedName}` : personalCameraKey}
        persistCamera={variant === 'full'}
        initialZoom={initialZoom}
        onUserInteraction={stopFollowing}
        onManualCameraChange={markCameraInteraction}
        onViewportChange={(point, zoom) => {
          focusPointRef.current = point
          currentZoomRef.current = zoom
          if (focusTarget && handledFocusTarget.current !== focusKey) {
            handledFocusTarget.current = focusKey
            point(
              focusTarget.x / WORLD_DIAMETER + 0.5,
              0.5 - focusTarget.z / WORLD_DIAMETER,
              focusTarget.focusZoom ?? 26,
            )
          }
        }}
        zoomControls={variant === 'overlay' ? 'compact' : 'full'}
        extraControls={<>
          {variant === 'full' && customMarkerWorldKey ? (
            <div className="rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--overlay-background)] p-1">
              <button
                type="button"
                onClick={() => {
                  if (placingMarker) setPlacingMarker(false)
                  else {
                    onClearSelection()
                    onStartCustomMarkerPlacement?.()
                    setSelectedContainer(null)
                    setSelectedCustomId(null)
                    setCreatingCustomMarker(true)
                  }
                }}
                aria-pressed={placingMarker}
                aria-label={t(placingMarker ? 'customMarkers.cancelPlacing' : 'customMarkers.addAction')}
                title={t(placingMarker ? 'customMarkers.cancelPlacing' : 'customMarkers.addAction')}
                className={cn('grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)]', placingMarker ? 'bg-[var(--surface-hover)] text-[var(--accent-text)]' : 'text-[var(--text)] hover:bg-[var(--surface-hover)]')}
              ><MapPinPlus size={16} aria-hidden="true" /></button>
            </div>
          ) : null}
          {playerPosition ? (
          <div className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--overlay-background)] p-1">
            <button
              type="button"
              onClick={() => { markCameraInteraction(); jumpToPlayer() }}
              className="group/control relative grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--text)] hover:bg-[var(--surface-hover)]"
              aria-label={t('map.controls.centerOnMe')}
              title={variant === 'overlay' ? undefined : t('map.controls.centerOnMe')}
            >
              <LocateFixed size={16} aria-hidden="true" />
              {variant === 'overlay' ? <MapControlTooltip label={t('map.controls.centerOnMe')} /> : null}
            </button>
            <button
              type="button"
              onClick={() => {
                markCameraInteraction()
                if (followPlayer) { setFollowPlayer(false); return }
                jumpToPlayer()
                setFollowPlayer(true)
              }}
              className={cn(
                'group/control relative grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] transition-colors',
                followPlayer
                  ? 'bg-[var(--surface-hover)] text-[var(--accent-text)] shadow-[0_0_0_1px_var(--accent)]'
                  : 'text-[var(--text)] hover:bg-[var(--surface-hover)]',
              )}
              aria-pressed={followPlayer}
              aria-label={t(followPlayer ? 'map.controls.stopFollowing' : 'map.controls.followMe')}
              title={variant === 'overlay' ? undefined : t(followPlayer ? 'map.controls.stopFollowing' : 'map.controls.followMe')}
            >
              <Navigation size={16} fill={followPlayer ? 'currentColor' : 'none'} aria-hidden="true" />
              {followPlayer ? <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)]" aria-hidden="true" /> : null}
              {variant === 'overlay' ? (
                <MapControlTooltip label={t(followPlayer ? 'map.controls.stopFollowing' : 'map.controls.followMe')} />
              ) : null}
            </button>
          </div>
          ) : null}
        </>}
      >
        {(view) => (
          <div data-map-circle ref={() => { focusMarkerRef.current = view.focusMarker }} style={{ width: MAP_SIZE_PX, height: MAP_SIZE_PX }} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-full)] shadow-[0_0_0_1px_rgba(214,192,133,0.34),0_0_34px_rgba(56,96,112,0.34),0_28px_90px_rgba(0,0,0,0.75)]">
            {exploration !== undefined && !showUnexploredTerrain ? <div data-exploration-fog
              className="pointer-events-none absolute inset-0 rounded-full bg-[var(--map-unexplored)]"
              style={{ backgroundImage: `radial-gradient(ellipse at 40% 35%, rgba(131,151,163,0.04), transparent 68%), ${FOG_TEXTURE}` }} /> : null}
            <div data-exploration-terrain className="absolute inset-0" style={showUnexploredTerrain ? undefined : layerMaskStyle}>
            <div className="absolute inset-0 overflow-hidden rounded-[var(--radius-full)] bg-[var(--map-water)] shadow-[inset_0_0_95px_rgba(0,0,0,0.64)]">
              <SeedBiomeMap
                key={seedName}
                seedName={seedName}
                onRenderStateChange={setTerrainState}
                zoom={view.zoom}
                panX={view.panX}
                panY={view.panY}
                mapSize={view.mapSize}
                viewportWidth={view.viewportWidth}
                viewportHeight={view.viewportHeight}
              />
              <div className="pointer-events-none absolute inset-0 rounded-[var(--radius-full)] bg-[radial-gradient(circle_at_43%_39%,rgba(255,255,255,0.06),transparent_31%,transparent_68%,rgba(0,0,0,0.42)_100%)]" />
            </div>
            </div>
            <div data-exploration-layers className="absolute inset-0" style={layerMaskStyle}>
            {resourceAreas && resourceAreas.length > 0 ? (
              <ResourceAreaLayer
                materials={resourceAreas}
                highlightedKey={highlightedResourceKey ?? null}
                zoom={view.zoom}
              />
            ) : null}
            {structurePaths?.some(Boolean) ? <StructureLayer paths={structurePaths} zoom={view.zoom} /> : null}
            </div>
            {/* Point layers are filtered before clustering/hit testing. Keep
                known icons and their labels readable at the edge of the fog. */}
            {generatedMarkers.length > 0 ? (
              <SeedLocationLayer
                progressWorldKey={progressWorldKey}
                markers={generatedMarkers}
                locations={locations}
                visibleLocationIds={visibleLocationIds}
                zoom={view.zoom}
                mapSize={view.mapSize}
                panX={view.panX}
                panY={view.panY}
                viewportHeight={view.viewportHeight}
                viewportWidth={view.viewportWidth}
                leftInset={filtersOpen ? 320 : 0}
                selectedMarkerId={selected?.marker?.id}
                onRequestZoom={(x, y, zoom) => {
                  setFollowPlayer(false)
                  view.focusPoint(x, y, zoom)
                }}
                compactTooltips={variant === 'overlay'}
                nearbyLabels={variant === 'overlay'}
                onOpenFan={() => {
                  onClearSelection()
                  setSelectedContainer(null)
                }}
                onSelect={(location, marker) => {
                  setFollowPlayer(false)
                  setSelectedContainer(null)
                  setSelectedCustomId(null)
                  const point = toMapPoint(marker.x, marker.y)
                  mapSelectionFocusRef.current = { kind: 'generated', id: marker.id, x: point.x, y: point.y }
                  onSelect(location, marker)
                }}
              />
            ) : null}
            {playerPins && playerPins.length > 0 && visiblePinTypes ? (
              <PlayerPinLayer
                pins={playerPins}
                zoom={view.zoom}
                visibleTypes={visiblePinTypes}
                translatePinToken={translatePinToken ?? (() => null)}
              />
            ) : null}
            {customMarkerWorldKey ? <CustomMarkerLayer worldKey={progressWorldKey} markers={visibleCustomMarkers} zoom={view.zoom} selectedId={selectedCustomId} onMove={(id, x, z) => { if (isMapPointVisible(exploration, x, z)) moveCustomMarker(id, x, z) }} onSelect={(marker) => {
              setFollowPlayer(false)
              setSelectedContainer(null)
              onClearSelection()
              const point = toMapPoint(marker.x, marker.z)
              mapSelectionFocusRef.current = { kind: 'custom', id: marker.id, x: point.x, y: point.y }
              setSelectedCustomId(marker.id)
            }} /> : null}
            {containers && containers.list.length > 0 ? (
              <ContainerLayer
                containers={containers.list}
                zoom={view.zoom}
                mapSize={view.mapSize}
                live={containers.live}
                containerName={containers.containerName}
                itemFor={containers.itemFor}
                highlightId={containers.highlightId}
                selectedId={selectedContainer?.id}
                onSelectContainer={(container) => {
                  setSelectedCustomId(null)
                  if (selectedContainer?.id === container.id) {
                    setSelectedContainer(null)
                    return
                  }
                  onClearSelection()
                  setSelectedContainer(container)
                  onSelectContainer?.(container)
                }}
                onOpenGroup={() => {
                  setSelectedCustomId(null)
                  onClearSelection()
                  setSelectedContainer(null)
                }}
                onFocus={(x, y) => view.focusPoint(x, y, Math.max(view.zoom, 20))}
                onZoomTo={(x, y, zoom) => view.focusPoint(x, y, zoom)}
              />
            ) : null}
            {nearbyCreatures && nearbyCreatures.length > 0 ? (
              <NearbyCreatureLayer
                creatures={nearbyCreatures}
                zoom={view.zoom}
                mapSize={view.mapSize}
                translateToken={translateCreatureToken ?? (() => null)}
                onFocus={view.focusPoint}
              />
            ) : null}
            {resourcePoints && resourcePoints.length > 0 ? (
              <ResourceNodePoints
                points={resourcePoints}
                zoom={view.zoom}
                mapSize={view.mapSize}
                panX={view.panX}
                panY={view.panY}
                viewportWidth={view.viewportWidth}
                viewportHeight={view.viewportHeight}
                nodeKindFor={nodeKindFor}
                onFocus={(x, y) => view.focusPoint(x, y, Math.max(view.zoom, 26))}
              />
            ) : null}
            {playerPosition && isMapPointVisible(exploration, playerPosition.x, playerPosition.z)
              ? <PlayerPositionMarker position={playerPosition} zoom={view.zoom} /> : null}
            {playerPosition && followPlayer ? <FollowPlayerCamera centerOn={view.centerOn} /> : null}
          </div>
        )}
      </InteractiveMapViewport>
      {introContext ? <PersonalExplorationGuide key={introContext} context={introContext}
        cameraStorageKey={personalCameraKey ? `${personalCameraKey}:seed:${seedName}` : undefined}
        exploration={exploration ?? null} filtersOpen={filtersOpen}
        interacted={interactedContext === introContext || Boolean(requestedFocusTarget || requestedSelection)}
        onFocus={focusInitialExploration} /> : null}
      {(renderingTerrain || terrainError || generationError || generationProgress || generating || loadingWorldSave) ? (
        <div role="status" aria-live="polite" aria-atomic="true" className="pointer-events-none absolute left-1/2 top-12 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--overlay-background)] px-3 py-2 text-center text-xs font-semibold text-[var(--text)] shadow-lg backdrop-blur-xl">
          {(renderingTerrain || loadingWorldSave || generating) && !terrainError && !generationError ? <LoaderCircle size={15} className="shrink-0 animate-spin motion-reduce:animate-none text-[var(--accent-text)]" aria-hidden="true" /> : null}
          <span>{terrainError
            ? t('map.terrainRenderError')
            : renderingTerrain
            ? t('map.renderingWorld')
            : generationError
            ? t('map.generationError')
            : loadingWorldSave
              ? t('map.loadingWorldSave')
              : generationProgress
              ? t('map.generationProgressWithMarkers', {
                  ...generationProgress,
                  count: visibleGeneratedMarkers,
                  prefabName: generationLocationName,
                })
              : t('map.preparingGeneration')}</span>
        </div>
      ) : null}
      {selected ? (
        <LocationDetailPanel
          progressWorldKey={progressWorldKey}
          key={selected.marker?.id ?? selected.location.id}
          location={selected.location}
          marker={selected.marker}
          leftOffset={filtersOpen ? FILTER_RAIL_PANEL_LEFT_OFFSET : MAP_PANEL_LEFT_OFFSET}
          topOffset={MAP_PANEL_TOP_OFFSET}
          onClose={onClearSelection}
        />
      ) : null}
      {selectedContainer && containers?.list.some(container => container.id === selectedContainer.id) ? (
        <ContainerDetailPanel
          key={selectedContainer.id}
          container={selectedContainer}
          live={containers.live}
          containerName={containers.containerName}
          itemFor={containers.itemFor}
          leftOffset={filtersOpen ? FILTER_RAIL_PANEL_LEFT_OFFSET : MAP_PANEL_LEFT_OFFSET}
          topOffset={MAP_PANEL_TOP_OFFSET}
          onClose={() => setSelectedContainer(null)}
        />
      ) : null}
      {selectedCustom ? <CustomMarkerDetail
        marker={selectedCustom}
        leftOffset={filtersOpen ? FILTER_RAIL_PANEL_LEFT_OFFSET : MAP_PANEL_LEFT_OFFSET}
        topOffset={MAP_PANEL_TOP_OFFSET}
        onClose={() => setSelectedCustomId(null)}
        onEdit={() => setEditingCustomId(selectedCustom.id)}
        onDelete={() => { removeCustomMarker(selectedCustom.id); setSelectedCustomId(null) }}
        onCenter={() => { const point = toMapPoint(selectedCustom.x, selectedCustom.z); focusPointRef.current?.(point.x, point.y, currentZoomRef.current) }}
      /> : null}
      {customMarkerWorldKey && (creatingCustomMarker || editingCustom) ? <CustomMarkerDialog
        key={editingCustom?.id ?? 'new'}
        editing={editingCustom}
        onClose={() => { setCreatingCustomMarker(false); setEditingCustomId(null) }}
        onCreate={beginCustomMarkerPlacement}
        onSaved={(id) => setSelectedCustomId(id)}
      /> : null}
    </div>
  )
}
