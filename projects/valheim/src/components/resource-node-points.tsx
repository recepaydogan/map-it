import { useMemo, useState } from 'react'
import { Archive, Axe, MapPin, Package, Pickaxe, Sprout } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { nodeDisplayName, actionForNodeKind } from '../features/crafting-planner/source-context'
import { MapMarkerTooltip } from './map-marker-tooltip'
import { selectVisibleResourcePoints } from './resource-point-layout'
import { markerBackgroundColor, markerScale, useMarkerSizes } from '../lib/map-marker-sizes'
import { mapMarkerZoomScale } from '../lib/map-marker-zoom'
import type { PlannerMapSourcePoint } from '../store/planner-map-source-store'

const WORLD_DIAMETER = 21_000

const iconByAction = {
  pick: Sprout,
  mine: Pickaxe,
  chop: Axe,
  break: Package,
  loot: Archive,
} as const

const toneByStatus = {
  present: 'border-emerald-100/90 bg-emerald-400 text-emerald-950 shadow-[0_0_10px_rgba(52,211,153,0.9)]',
  container: 'border-sky-100/90 bg-sky-400 text-sky-950 shadow-[0_0_10px_rgba(56,189,248,0.9)]',
  partial: 'border-amber-100/90 bg-amber-400 text-amber-950 shadow-[0_0_10px_rgba(251,191,36,0.9)]',
  respawning: 'border-zinc-200/70 bg-zinc-500 text-zinc-100 shadow-[0_0_8px_rgba(113,113,122,0.8)]',
  operation: 'border-[var(--accent-text)] bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_0_10px_var(--accent-glow)]',
} as const

/**
 * Exact positions of standing resource nodes confirmed by the world save.
 * Each point carries its node kind
 * (icon) and loot status (tint) so the map says what to do there.
 */
export function ResourceNodePoints({
  points,
  zoom,
  mapSize,
  panX,
  panY,
  viewportWidth,
  viewportHeight,
  nodeKindFor,
  onFocus,
}: {
  points: PlannerMapSourcePoint[]
  zoom: number
  mapSize: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
  /** Node prefab → catalog kind (pickable, mine-rock, tree, …). */
  nodeKindFor?: (nodePrefab: string) => string | undefined
  onFocus?: (x: number, y: number) => void
}) {
  const { t } = useTranslation()
  const markerSizes = useMarkerSizes()
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const sizeScale = markerScale('resources', markerSizes) * mapMarkerZoomScale(zoom)
  const markerColor = markerBackgroundColor('resources', markerSizes)
  const size = 18 * sizeScale
  const visiblePoints = useMemo(() => selectVisibleResourcePoints(points, {
    zoom,
    mapSize,
    panX,
    panY,
    viewportWidth,
    viewportHeight,
  }), [mapSize, panX, panY, points, viewportHeight, viewportWidth, zoom])
  const operationPoints = visiblePoints.filter((point) => point.kind === 'operation')
  const operationPlacement = (point: PlannerMapSourcePoint) => {
    const other = operationPoints.find((candidate) => candidate !== point)
    if (!other) return 'top' as const
    const deltaX = point.x - other.x
    const deltaZ = point.z - other.z
    if (Math.abs(deltaX) >= Math.abs(deltaZ)) return deltaX < 0 ? 'left' as const : 'right' as const
    return deltaZ > 0 ? 'top' as const : 'bottom' as const
  }
  return (
    <>
      {operationPoints.length === 2 ? (
        <svg className="pointer-events-none absolute inset-0 z-[5] size-full overflow-visible" aria-hidden="true">
          <line
            x1={`${(operationPoints[0].x / WORLD_DIAMETER + 0.5) * 100}%`}
            y1={`${(0.5 - operationPoints[0].z / WORLD_DIAMETER) * 100}%`}
            x2={`${(operationPoints[1].x / WORLD_DIAMETER + 0.5) * 100}%`}
            y2={`${(0.5 - operationPoints[1].z / WORLD_DIAMETER) * 100}%`}
            stroke="var(--accent-text)"
            strokeWidth="1.5"
            strokeDasharray="6 5"
            vectorEffect="non-scaling-stroke"
            opacity="0.7"
          />
        </svg>
      ) : null}
      {visiblePoints.map((point) => {
        const kind = point.kind ?? (point.nodePrefab ? nodeKindFor?.(point.nodePrefab) : undefined)
        const action = kind ? actionForNodeKind(kind) : 'pick'
        const operation = kind === 'operation'
        const Icon = operation ? MapPin : iconByAction[action as keyof typeof iconByAction] ?? Sprout
        const status = point.status ?? 'present'
        const tone = toneByStatus[operation ? 'operation' : action === 'loot' ? 'container' : status]
        const label = point.label ?? (point.nodePrefab
          ? nodeDisplayName(point.nodePrefab)
          : t(`planner.mapMode.status.${status}`))
        const left = (point.x / WORLD_DIAMETER + 0.5) * 100
        const top = (0.5 - point.z / WORLD_DIAMETER) * 100
        const key = point.focusId ?? point.containerId ?? `${point.nodePrefab ?? point.kind ?? ''}:${point.x}:${point.z}`
        const hovered = hoveredKey === key
        const markerSize = operation ? 24 * sizeScale : size
        return (
          <button
            key={key}
            type="button"
            aria-label={label}
            onClick={() => onFocus?.(left / 100, top / 100)}
            onMouseEnter={() => setHoveredKey(key)}
            onMouseLeave={() => setHoveredKey((current) => (current === key ? null : current))}
            onFocus={() => setHoveredKey(key)}
            onBlur={() => setHoveredKey((current) => (current === key ? null : current))}
            className={cn(
              'absolute grid cursor-pointer place-items-center rounded-full border',
              hovered ? 'z-[110]' : 'z-[10]',
              tone,
            )}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: markerSize,
              height: markerSize,
              backgroundColor: markerColor,
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
            }}
          >
            <Icon
              size={markerSize * 0.62}
              strokeWidth={2.5}
              aria-hidden="true"
            />
            <MapMarkerTooltip
              label={label}
              visible={operation || hovered}
              placement={operation ? operationPlacement(point) : 'top'}
            />
          </button>
        )
      })}
    </>
  )
}
