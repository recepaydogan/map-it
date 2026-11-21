import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import {
  LOCATION_MARKER_STYLES,
  getLocationMarkerCategory,
  getLocationMarkerVisual,
  type LocationMarkerStyle,
  type LocationMarkerVisual,
  type MarkerCategory,
} from '../lib/location-marker-style'
import { LocationMarkerVisual as MarkerVisual } from './location-marker-visual'
import { NearbyMarkerLabels, type NearbyLabelCandidate } from './nearby-marker-labels'
import { formatLocationName, locationNameLabelKey } from '../lib/location-presentation'
import { markerBackgroundColor, markerScale, useMarkerSizes } from '../lib/map-marker-sizes'
import { mapMarkerZoomScale } from '../lib/map-marker-zoom'
import {
  groupNearbyMarkers,
  layoutMarkerFan,
  type MarkerLayoutGroup,
} from '../lib/marker-layout'
import type { GeneratedLocationMarker } from '../lib/valheim/location-generator'
import type { LocationRecord } from '../types/game-data'
import { useMarkerProgress } from '../hooks/use-marker-progress'
import { locationProgressId } from '../lib/marker-progress'
import { MarkerProgressBadges } from './marker-progress-badges'

interface SeedLocationLayerProps {
  progressWorldKey: string
  markers: GeneratedLocationMarker[]
  locations: LocationRecord[]
  visibleLocationIds: ReadonlySet<string>
  zoom: number
  mapSize: number
  panX: number
  panY: number
  viewportHeight: number
  viewportWidth: number
  leftInset: number
  selectedMarkerId?: string
  /** The overlay mini-map turns hover cards off: too many markers, too little room. */
  showTooltips?: boolean
  /** Hover card shows only the marker's name (the overlay mini-map). */
  compactTooltips?: boolean
  /** Markers near the player carry their name (the overlay mini-map). */
  nearbyLabels?: boolean
  onRequestZoom: (x: number, y: number, zoom: number) => void
  onOpenFan: () => void
  onSelect: (location: LocationRecord, marker: GeneratedLocationMarker) => void
}

interface MarkerCandidate {
  id: string
  marker: GeneratedLocationMarker
  location: LocationRecord
  category: MarkerCategory
  x: number
  y: number
}

const MARKER_CATEGORY_LABEL_KEYS: Record<MarkerCategory, string> = {
  'type:bosses': 'filters.bosses',
  'type:dungeons': 'filters.dungeons',
  'type:traders': 'filters.traders',
  'type:camps': 'filters.camps',
  'type:settlements': 'filters.settlements',
  'type:structures': 'filters.structures',
  'type:ruins': 'filters.ruins',
  'type:lore': 'filters.lore',
  'type:natural': 'filters.natural',
}

interface MarkerButtonProps {
  found?: boolean
  favorite?: boolean
  ariaLabel: string
  markerId?: string
  clusterCount?: number
  disabled?: boolean
  name: string
  secondary?: string
  selected: boolean
  persistSelectedTooltip: boolean
  style: LocationMarkerStyle
  backgroundColor?: string
  /** Overrides the category visual for a single, identified location. */
  visual?: LocationMarkerVisual
  x: number
  y: number
  zoom: number
  sizeScale: number
  showTooltip: boolean
  onClick: () => void
}

interface FanState {
  anchorId: string
  viewKey: string
}

const WORLD_DIAMETER = 21_000
const isStartingLocation = (candidate: MarkerCandidate) => candidate.location.prefabName === 'StartTemple'
const CLUSTERING_DISABLED_AT_ZOOM = 4
const CLUSTER_RADIUS_PX = 48
const FAN_TRIGGER_RADIUS_PX = 14
const FAN_SCRIM_MARGIN_PX = 28
const VIEWPORT_CULL_MARGIN_PX = 80
const VIEWPORT_CONTROL_INSET_PX = 56

const categoryLabelKey = (category: MarkerCategory) => MARKER_CATEGORY_LABEL_KEYS[category]

function MarkerButton({
  found = false,
  favorite = false,
  ariaLabel,
  markerId,
  clusterCount,
  disabled = false,
  name,
  secondary,
  selected,
  persistSelectedTooltip,
  style,
  backgroundColor,
  visual,
  x,
  y,
  zoom,
  sizeScale,
  showTooltip,
  onClick,
}: MarkerButtonProps) {
  const clustered = (clusterCount ?? 0) > 1

  return (
    <div
      className={cn('absolute z-[var(--marker-z)] hover:z-[110] focus-within:z-[110]', selected && 'z-[100]')}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, '--marker-z': style.priority } as CSSProperties}
    >
      <button
        type="button"
        className={cn(
          'group pointer-events-auto relative grid cursor-pointer place-items-center text-white transition-[border-color,filter,box-shadow] hover:z-20 focus-visible:z-20 focus-visible:outline-none',
          clustered
            ? 'rounded-[var(--radius-full)] border-2 border-white/55 shadow-[0_3px_12px_rgba(0,0,0,0.76)] hover:border-white/90 focus-visible:border-white/90'
            : 'rounded-[var(--radius-full)] border-2 border-white/55 shadow-[0_3px_10px_rgba(0,0,0,0.68)] hover:border-white/90 focus-visible:border-white/90',
          selected && 'z-20 border-white/90',
          disabled && 'pointer-events-none opacity-35',
        )}
        style={{
          backgroundColor: backgroundColor ?? style.background,
          transform: `translate(-50%, -50%) scale(${1 / zoom})`,
          width: (clustered ? 40 : 32) * sizeScale,
          height: (clustered ? 40 : 32) * sizeScale,
        }}
        onClick={onClick}
        tabIndex={disabled ? -1 : undefined}
        aria-label={ariaLabel}
        data-marker-id={markerId}
        data-marker-found={found || undefined}
        data-marker-favorite={favorite || undefined}
        data-map-selected-marker={persistSelectedTooltip ? 'generated' : undefined}
      >
        {clustered ? (
          <>
            <MarkerVisual
              visual={visual ?? style.visual}
              size={29 * sizeScale}
              className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
            />
            <span className="absolute left-1/2 grid -translate-x-1/2 place-items-center rounded-[var(--radius-full)] bg-white/90 px-1 font-black leading-none tabular-nums text-black shadow-md"
              style={{ bottom: -6 * sizeScale, height: 16 * sizeScale, minWidth: 20 * sizeScale, fontSize: 9 * sizeScale }}>
              {clusterCount}
            </span>
          </>
        ) : (
          <MarkerVisual
            visual={visual ?? style.visual}
            size={24 * sizeScale}
            className="text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
          />
        )}
        <MarkerProgressBadges found={found} favorite={favorite} />
        {showTooltip ? <span data-map-selected-tooltip={persistSelectedTooltip ? 'generated' : undefined} className={cn('pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-30 min-w-max max-w-56 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-left shadow-2xl', persistSelectedTooltip ? 'block' : 'hidden group-hover:block group-focus-visible:block')}>
          <span className="block text-[11px] font-bold leading-tight text-[var(--text)]">{name}</span>
          {secondary && !persistSelectedTooltip ? (
            <span className="mt-1 block text-[10px] font-medium text-[var(--muted)]">{secondary}</span>
          ) : null}
        </span> : null}
      </button>
    </div>
  )
}

export function SeedLocationLayer({
  progressWorldKey,
  markers,
  locations,
  visibleLocationIds,
  zoom,
  mapSize,
  panX,
  panY,
  viewportHeight,
  viewportWidth,
  leftInset,
  selectedMarkerId,
  onRequestZoom,
  onOpenFan,
  onSelect,
  showTooltips = true,
  compactTooltips = false,
  nearbyLabels = false,
}: SeedLocationLayerProps) {
  const { t } = useTranslation()
  const { found, favorites } = useMarkerProgress(progressWorldKey)
  const markerSizes = useMarkerSizes()
  const zoomScale = mapMarkerZoomScale(zoom)
  const sizeFor = useCallback(
    (category: MarkerCategory) => markerScale(category, markerSizes) * zoomScale,
    [markerSizes, zoomScale],
  )
  const [fanState, setFanState] = useState<FanState | null>(null)
  const locationById = useMemo(
    () => new Map(locations.map((location) => [location.id, location])),
    [locations],
  )
  const candidates = useMemo(() => {
    const result: MarkerCandidate[] = []
    for (const marker of markers) {
      const location = locationById.get(marker.locationId)
      if (!location) continue
      // The sacrificial stones are the world's navigation anchor, even with filters off.
      if (location.prefabName !== 'StartTemple' && !visibleLocationIds.has(marker.locationId)) continue
      const x = (marker.x + WORLD_DIAMETER / 2) / WORLD_DIAMETER
      const y = 0.5 - marker.y / WORLD_DIAMETER
      if (x < 0 || x > 1 || y < 0 || y > 1) continue
      result.push({
        id: marker.id,
        marker,
        location,
        category: getLocationMarkerCategory(location),
        x,
        y,
      })
    }
    return result
  }, [locationById, markers, visibleLocationIds])
  const clustering = zoom < CLUSTERING_DISABLED_AT_ZOOM
  // The real rendered size: the mini-map is well under 320px, and a padded
  // value put markers at the wrong screen spot so nearby ones were culled.
  const effectiveMapSize = Math.max(1, mapSize)
  const layoutCandidates = useMemo(() => candidates.filter((candidate) => {
    const screenX = viewportWidth / 2 + panX + (candidate.x - 0.5) * effectiveMapSize * zoom
    const screenY = viewportHeight / 2 + panY + (candidate.y - 0.5) * effectiveMapSize * zoom
    return screenX >= -VIEWPORT_CULL_MARGIN_PX &&
      screenX <= viewportWidth + VIEWPORT_CULL_MARGIN_PX &&
      screenY >= -VIEWPORT_CULL_MARGIN_PX &&
      screenY <= viewportHeight + VIEWPORT_CULL_MARGIN_PX
  }), [candidates, effectiveMapSize, panX, panY, viewportHeight, viewportWidth, zoom])
  const displayGroups = useMemo<MarkerLayoutGroup<MarkerCandidate>[]>(() => {
    if (!clustering) {
      return candidates.map((candidate) => ({
        category: candidate.category,
        members: [candidate],
        x: candidate.x,
        y: candidate.y,
      }))
    }
    const ordinary = candidates.filter((candidate) => !isStartingLocation(candidate))
    const groups = (Object.keys(LOCATION_MARKER_STYLES) as MarkerCategory[]).flatMap((category) =>
      groupNearbyMarkers(ordinary.filter((candidate) => candidate.category === category),
        CLUSTER_RADIUS_PX * sizeFor(category) / (effectiveMapSize * zoom)))
    // Keep the start icon at its actual position and draw it above nearby clusters.
    return [...groups, ...candidates.filter(isStartingLocation).map((candidate) => ({
      category: candidate.category,
      members: [candidate],
      x: candidate.x,
      y: candidate.y,
    }))]
  }, [candidates, clustering, effectiveMapSize, sizeFor, zoom])
  const visibleDisplayGroups = useMemo(() => displayGroups.filter((group) => {
    const screenX = viewportWidth / 2 + panX + (group.x - 0.5) * effectiveMapSize * zoom
    const screenY = viewportHeight / 2 + panY + (group.y - 0.5) * effectiveMapSize * zoom
    return screenX >= -VIEWPORT_CULL_MARGIN_PX &&
      screenX <= viewportWidth + VIEWPORT_CULL_MARGIN_PX &&
      screenY >= -VIEWPORT_CULL_MARGIN_PX &&
      screenY <= viewportHeight + VIEWPORT_CULL_MARGIN_PX
  }), [displayGroups, effectiveMapSize, panX, panY, viewportHeight, viewportWidth, zoom])
  const labelCandidates = useMemo<NearbyLabelCandidate[]>(() => {
    if (!nearbyLabels || clustering) return []
    return visibleDisplayGroups
      .filter((group) => group.members.length === 1)
      .map((group) => {
        const candidate = group.members[0]
        return {
          id: candidate.id,
          x: group.x,
          y: group.y,
          worldX: candidate.marker.x,
          worldZ: candidate.marker.y,
          sizeScale: sizeFor(candidate.category),
          name: t(locationNameLabelKey(candidate.location.prefabName), {
            defaultValue: formatLocationName(candidate.location.prefabName),
          }),
        }
      })
  }, [clustering, nearbyLabels, sizeFor, t, visibleDisplayGroups])
  const viewKey = `${zoom}:${panX}:${panY}`
  const activeFanState = !clustering && fanState?.viewKey === viewKey ? fanState : null
  const fan = useMemo(() => {
    if (!activeFanState) return null
    const anchor = layoutCandidates.find((candidate) => candidate.id === activeFanState.anchorId)
    if (!anchor) return null
    const members = layoutCandidates
      .filter((candidate) => (
        Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y) * effectiveMapSize * zoom
        <= FAN_TRIGGER_RADIUS_PX * Math.max(sizeFor(candidate.category), sizeFor(anchor.category))
      ))
      .sort((first, second) => (
        first.category.localeCompare(second.category) ||
        first.location.prefabName.localeCompare(second.location.prefabName) ||
        first.id.localeCompare(second.id)
      ))
    if (members.length < 2) return null
    const layout = layoutMarkerFan(members.length)
    const fanScale = Math.max(...members.map((member) => sizeFor(member.category)))
    layout.offsets = layout.offsets.map((offset) => ({ x: offset.x * fanScale, y: offset.y * fanScale }))
    layout.outerRadius *= fanScale
    const webRadius = layout.outerRadius + FAN_SCRIM_MARGIN_PX
    const anchorScreenX = viewportWidth / 2 + panX + (anchor.x - 0.5) * effectiveMapSize * zoom
    const anchorScreenY = viewportHeight / 2 + panY + (anchor.y - 0.5) * effectiveMapSize * zoom
    const minimumX = leftInset + webRadius + 8
    const maximumX = viewportWidth - VIEWPORT_CONTROL_INSET_PX - webRadius - 8
    const minimumY = webRadius + 8
    const maximumY = viewportHeight - VIEWPORT_CONTROL_INSET_PX - webRadius - 8
    const centerScreenX = Math.min(Math.max(anchorScreenX, minimumX), Math.max(minimumX, maximumX))
    const centerScreenY = Math.min(Math.max(anchorScreenY, minimumY), Math.max(minimumY, maximumY))
    return {
      anchor,
      members,
      layout,
      center: {
        x: anchor.x + (centerScreenX - anchorScreenX) / (effectiveMapSize * zoom),
        y: anchor.y + (centerScreenY - anchorScreenY) / (effectiveMapSize * zoom),
      },
    }
  }, [
    activeFanState,
    effectiveMapSize,
    layoutCandidates,
    sizeFor,
    leftInset,
    panX,
    panY,
    viewportHeight,
    viewportWidth,
    zoom,
  ])

  const selectCandidate = (candidate: MarkerCandidate) => {
    if (!clustering) {
      const stackSize = layoutCandidates.reduce((count, other) => (
        Math.hypot(other.x - candidate.x, other.y - candidate.y) * effectiveMapSize * zoom
          <= FAN_TRIGGER_RADIUS_PX * Math.max(sizeFor(candidate.category), sizeFor(other.category))
          ? count + 1
          : count
      ), 0)
      if (stackSize > 1) {
        onOpenFan()
        setFanState((current) => (
          current?.anchorId === candidate.id && current.viewKey === viewKey
            ? null
            : { anchorId: candidate.id, viewKey }
        ))
        return
      }
    }
    setFanState(null)
    onSelect(candidate.location, candidate.marker)
  }

  return (
    <div className="pointer-events-none absolute inset-0" aria-label={t('map.generatedMarkerLayer')}>
      <div className="absolute inset-0">
        {visibleDisplayGroups.map((group) => {
          const representative = group.members[0]
          const count = group.members.length
          const clustered = count > 1
          const markerStyle = LOCATION_MARKER_STYLES[representative.category]
          const categoryName = t(categoryLabelKey(representative.category))
          const locationName = t(locationNameLabelKey(representative.location.prefabName), {
            defaultValue: formatLocationName(representative.location.prefabName),
          })
          const name = clustered ? categoryName : locationName
          const secondary = clustered ? t('map.clusterSummary', { count }) : undefined
          const selected = group.members.some((member) => member.marker.id === selectedMarkerId)
          return (
            <MarkerButton
              key={clustered
                ? `cluster:${representative.category}:${representative.id}`
                : representative.id}
              ariaLabel={clustered
                ? t('map.clusterMarker', { category: categoryName, count })
                : t('map.openMarker', { name })}
              markerId={clustered ? undefined : representative.marker.id}
              found={!clustered && found.has(locationProgressId(representative.marker))}
              favorite={!clustered && favorites.has(locationProgressId(representative.marker))}
              clusterCount={clustered ? count : undefined}
              disabled={Boolean(fan)}
              name={name}
              secondary={compactTooltips ? undefined : secondary}
              selected={selected}
              persistSelectedTooltip={selected && !clustered && !fan}
              style={markerStyle}
              backgroundColor={markerBackgroundColor(representative.category, markerSizes)}
              visual={clustered ? undefined : getLocationMarkerVisual(representative.location)}
              x={group.x}
              y={group.y}
              zoom={zoom}
              sizeScale={sizeFor(representative.category)}
              showTooltip={showTooltips}
              onClick={() => {
                if (clustered) {
                  onRequestZoom(group.x, group.y, CLUSTERING_DISABLED_AT_ZOOM)
                  return
                }
                selectCandidate(representative)
              }}
            />
          )
        })}
      </div>

      {labelCandidates.length > 0 && !fan ? (
        <NearbyMarkerLabels
          candidates={labelCandidates}
          zoom={zoom}
          mapSize={effectiveMapSize}
          panX={panX}
          panY={panY}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
        />
      ) : null}

      {fan ? (
        <>
          <button
            type="button"
            className="pointer-events-auto absolute inset-0 z-[140] cursor-default bg-transparent"
            onClick={() => setFanState(null)}
            aria-label={t('map.closeMarkerFan')}
          />
          <div
            className="pointer-events-none absolute z-[141] -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-full)] border bg-[var(--overlay-background)]/80 shadow-xl"
            style={{
              borderColor: 'var(--accent-text)',
              borderWidth: `${0.75 / zoom}px`,
              height: `${(fan.layout.outerRadius + FAN_SCRIM_MARGIN_PX) * 2 / zoom}px`,
              left: `${fan.center.x * 100}%`,
              top: `${fan.center.y * 100}%`,
              width: `${(fan.layout.outerRadius + FAN_SCRIM_MARGIN_PX) * 2 / zoom}px`,
            }}
          />
          <svg className="absolute inset-0 z-[142] size-full overflow-visible" aria-hidden="true">
            {fan.members.map((member, index) => {
              const offset = fan.layout.offsets[index]
              const x = fan.center.x + offset.x / (effectiveMapSize * zoom)
              const y = fan.center.y + offset.y / (effectiveMapSize * zoom)
              return (
                <line
                  key={member.id}
                  x1={`${fan.center.x * 100}%`}
                  y1={`${fan.center.y * 100}%`}
                  x2={`${x * 100}%`}
                  y2={`${y * 100}%`}
                  stroke="var(--accent-text)"
                  strokeLinecap="round"
                  strokeOpacity="0.52"
                  strokeWidth="0.75"
                  vectorEffect="non-scaling-stroke"
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 z-[143]">
            {fan.members.map((member, index) => {
              const offset = fan.layout.offsets[index]
              const x = fan.center.x + offset.x / (effectiveMapSize * zoom)
              const y = fan.center.y + offset.y / (effectiveMapSize * zoom)
              const locationName = t(locationNameLabelKey(member.location.prefabName), {
                defaultValue: formatLocationName(member.location.prefabName),
              })
              const name = locationName
              return (
                <MarkerButton
                  key={`fan:${member.id}`}
                  found={found.has(locationProgressId(member.marker))}
                  favorite={favorites.has(locationProgressId(member.marker))}
                  ariaLabel={t('map.openMarker', { name })}
                  name={name}
                  selected={member.marker.id === selectedMarkerId}
                  persistSelectedTooltip={false}
                  style={LOCATION_MARKER_STYLES[member.category]}
                  backgroundColor={markerBackgroundColor(member.category, markerSizes)}
                  visual={getLocationMarkerVisual(member.location)}
                  x={x}
                  y={y}
                  zoom={zoom}
                  sizeScale={sizeFor(member.category)}
                  showTooltip={showTooltips}
                  onClick={() => {
                    setFanState(null)
                    onSelect(member.location, member.marker)
                  }}
                />
              )
            })}
          </div>
        </>
      ) : null}
    </div>
  )
}
