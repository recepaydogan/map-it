import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Archive, Lock, X, ZoomIn } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { clusterMapPoints, type MapPointCluster } from '../lib/container-clustering'
import { markerBackgroundColor, markerScale, useMarkerSizes } from '../lib/map-marker-sizes'
import { mapMarkerZoomScale } from '../lib/map-marker-zoom'
import type { RememberedContainer } from '../lib/live-tracking/container-types'

const WORLD_DIAMETER = 21_000
const MAX_RENDERED = 400
const PREVIEW_ROWS = 6
/** Chests closer than this on screen merge into one group marker. */
const CLUSTER_RADIUS_PX = 22

/** What the layer needs to know about an item to show it in a chest. */
export interface ContainerItemPresentation {
  name: string
  icon: string | null
}

interface ContainerLayerProps {
  containers: readonly RememberedContainer[]
  zoom: number
  /** Rendered map diameter in CSS px at zoom 1; needed to judge screen distance. */
  mapSize: number
  /** Whether the snapshot is fresh; remembered-only chests are marked as such. */
  live: boolean
  /** Chest display name for a `$piece_chest_wood` token; falls back to the prefab. */
  containerName: (token: string, prefab: string) => string
  itemFor: (prefab: string) => ContainerItemPresentation | null
  /** A chest the planner is currently pointing at (rings it). */
  highlightId?: string | null
  selectedId?: string | null
  onSelectContainer?: (container: RememberedContainer) => void
  /** A group list is opening: any other open panel should go. */
  onOpenGroup?: () => void
  onFocus?: (x: number, y: number) => void
  /** Zooms the camera so a group's chests spread apart. */
  onZoomTo?: (x: number, y: number, zoom: number) => void
}

type ContainerGroup = MapPointCluster<RememberedContainer>

/**
 * Screen-space grouping at the current zoom. Transitively touching markers
 * stay in one cluster, so dense or vertically stacked chest layouts cannot
 * dissolve into several badges that still overlap each other.
 */
function groupContainers(containers: readonly RememberedContainer[], worldPerPx: number): ContainerGroup[] {
  return clusterMapPoints(containers, CLUSTER_RADIUS_PX * worldPerPx)
}

const toLeftTop = (x: number, z: number) => ({
  left: (x / WORLD_DIAMETER + 0.5) * 100,
  top: (0.5 - z / WORLD_DIAMETER) * 100,
})

/**
 * The player's chests, reported by the tracker mod, drawn on the world map.
 * Chests that would overlap on screen collapse into one numbered group;
 * clicking a group lists its chests so any one of them can be opened.
 * Hover previews the fullest stacks; a click opens the chest details panel.
 */
export function ContainerLayer({
  containers,
  zoom,
  mapSize,
  live,
  containerName,
  itemFor,
  highlightId,
  selectedId,
  onSelectContainer,
  onOpenGroup,
  onFocus,
  onZoomTo,
}: ContainerLayerProps) {
  const { t } = useTranslation()
  const markerSizes = useMarkerSizes()
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null)
  const sizeScale = markerScale('chests', markerSizes) * mapMarkerZoomScale(zoom)
  const markerColor = markerBackgroundColor('chests', markerSizes)
  const size = 18 * sizeScale
  const worldPerPx = WORLD_DIAMETER / Math.max(1, mapSize * zoom)
  const groups = useMemo(
    () => groupContainers(containers.slice(0, MAX_RENDERED), worldPerPx * sizeScale),
    [containers, sizeScale, worldPerPx],
  )
  // A regroup (zoom change) that dissolves the open group also closes its list.
  const openGroup = groups.find((group) => group.key === openGroupKey && group.members.length > 1) ?? null
  // Any press outside the open group (map, another marker, a panel) or Escape closes its list.
  useEffect(() => {
    if (!openGroup) return
    const key = openGroup.key
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (target?.closest?.('[data-container-group]')?.getAttribute('data-container-group') === key) return
      setOpenGroupKey((current) => (current === key ? null : current))
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroupKey((current) => (current === key ? null : current))
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openGroup])
  return (
    <>
      {groups.map((group) => {
        const { left, top } = toLeftTop(group.x, group.z)
        if (group.members.length > 1) {
          const open = openGroup?.key === group.key
          const hovered = hoveredKey === group.key && !open
          const holdsSelected = selectedId != null && group.members.some((member) => member.id === selectedId)
          const holdsHighlight = highlightId != null && group.members.some((member) => member.id === highlightId)
          const badge = (18 + 6 + Math.min(10, group.members.length / 10)) * sizeScale
          return (
            <div
              key={group.key}
              data-container-group={group.key}
              className={cn('absolute', open ? 'z-[130]' : hovered || holdsHighlight ? 'z-[110]' : holdsSelected ? 'z-[100]' : 'z-[70]')}
              style={{
                left: `${left}%`,
                top: `${top}%`,
                transform: `translate(-50%, -50%) scale(${1 / zoom})`,
                transformOrigin: 'center',
              }}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-label={t('map.containers.groupTitle', { count: group.members.length })}
                onClick={() => {
                  const opening = openGroupKey !== group.key
                  if (opening) onOpenGroup?.()
                  setOpenGroupKey(opening ? group.key : null)
                }}
                onMouseEnter={() => setHoveredKey(group.key)}
                onMouseLeave={() => setHoveredKey((current) => (current === group.key ? null : current))}
                onFocus={() => setHoveredKey(group.key)}
                onBlur={() => setHoveredKey((current) => (current === group.key ? null : current))}
                className={cn(
                  'grid cursor-pointer place-items-center rounded-full border-2 border-amber-100/90 bg-amber-300/95 text-[10px] font-bold tabular-nums text-amber-950 shadow-[0_0_0_4px_rgba(251,191,36,0.28),0_0_10px_rgba(251,191,36,0.7)] transition-all',
                  !live && 'saturate-[0.55]',
                  (holdsSelected || holdsHighlight) && 'ring-2 ring-white ring-offset-2 ring-offset-black/60',
                )}
                style={{ width: badge, height: badge, backgroundColor: markerColor }}
              >
                {group.members.length}
              </button>
              {hovered || open ? (
                <GroupCard
                  group={group}
                  live={live}
                  containerName={containerName}
                  itemFor={itemFor}
                  selectedId={selectedId}
                  pinned={open}
                  onClose={() => setOpenGroupKey(null)}
                  onPick={(container) => {
                    setOpenGroupKey(null)
                    onSelectContainer?.(container)
                    const point = toLeftTop(container.x, container.z)
                    onFocus?.(point.left / 100, point.top / 100)
                  }}
                  onZoomIn={onZoomTo ? () => {
                    setOpenGroupKey(null)
                    onZoomTo(left / 100, top / 100, zoom * 3)
                  } : undefined}
                />
              ) : null}
            </div>
          )
        }
        const container = group.members[0]
        const isSelected = selectedId === container.id
        const hovered = hoveredKey === container.id && !isSelected
        const highlighted = highlightId === container.id
        const empty = container.items.length === 0
        return (
          <div
            key={container.id}
            className={cn('absolute', hovered ? 'z-[110]' : isSelected ? 'z-[100]' : highlighted ? 'z-[110]' : 'z-[70]')}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              transform: `translate(-50%, -50%) scale(${1 / zoom})`,
              transformOrigin: 'center',
            }}
          >
            <button
              type="button"
              aria-label={containerName(container.name, container.prefab)}
              aria-expanded={isSelected}
              onClick={() => {
                onSelectContainer?.(container)
                onFocus?.(left / 100, top / 100)
              }}
              onMouseEnter={() => setHoveredKey(container.id)}
              onMouseLeave={() => setHoveredKey((current) => (current === container.id ? null : current))}
              onFocus={() => setHoveredKey(container.id)}
              onBlur={() => setHoveredKey((current) => (current === container.id ? null : current))}
              className={cn(
                'grid cursor-pointer place-items-center rounded-full border transition-all',
                container.owner === 'own'
                  ? 'border-amber-100/90 bg-amber-300 text-amber-950 shadow-[0_0_8px_rgba(251,191,36,0.75)]'
                  : 'border-sky-100/90 bg-sky-400 text-sky-950 shadow-[0_0_8px_rgba(56,189,248,0.75)]',
                empty && 'opacity-60',
                !live && 'saturate-[0.55]',
                (highlighted || isSelected) && 'ring-2 ring-white ring-offset-2 ring-offset-black/60 scale-110',
              )}
              style={{ width: size, height: size, backgroundColor: markerColor }}
            >
              <Archive size={size * 0.62} strokeWidth={2.5} aria-hidden="true" />
            </button>
            {hovered ? (
              <ContainerCard
                container={container}
                live={live}
                containerName={containerName}
                itemFor={itemFor}
                pinned={false}
                onClose={() => {}}
              />
            ) : null}
          </div>
        )
      })}
    </>
  )
}

/** Summary of items across chests: total amount and how many chests hold each. */
function topItemsOf(members: readonly RememberedContainer[], limit: number) {
  const totals = new Map<string, { prefab: string; amount: number; chests: number }>()
  for (const container of members) {
    const seen = new Set<string>()
    for (const item of container.items) {
      const key = item.prefab.toLowerCase()
      const row = totals.get(key) ?? { prefab: item.prefab, amount: 0, chests: 0 }
      row.amount += item.amount
      if (!seen.has(key)) { row.chests += 1; seen.add(key) }
      totals.set(key, row)
    }
  }
  return [...totals.values()].sort((a, b) => b.amount - a.amount).slice(0, limit)
}

/**
 * The card for a group of chests: hover shows what the group holds overall;
 * pinned (clicked) it lists every chest so one can be opened, plus a zoom-in
 * shortcut for when the player would rather see them spread out.
 */
function GroupCard({
  group,
  live,
  containerName,
  itemFor,
  selectedId,
  pinned,
  onClose,
  onPick,
  onZoomIn,
}: {
  group: ContainerGroup
  live: boolean
  containerName: (token: string, prefab: string) => string
  itemFor: (prefab: string) => ContainerItemPresentation | null
  selectedId?: string | null
  pinned: boolean
  onClose: () => void
  onPick: (container: RememberedContainer) => void
  onZoomIn?: () => void
}) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const totalItems = useMemo(
    () => group.members.reduce((sum, member) => sum + member.items.reduce((inner, item) => inner + item.amount, 0), 0),
    [group.members],
  )
  const topItems = useMemo(() => topItemsOf(group.members, 4), [group.members])
  const normalized = query.trim().toLowerCase()
  const rows = useMemo(() => group.members
    .map((container) => {
      const name = containerName(container.name, container.prefab)
      const stacks = topItemsOf([container], 3).map((row) => ({ ...row, item: itemFor(row.prefab) }))
      const matches = !normalized
        || name.toLowerCase().includes(normalized)
        || container.items.some((item) => (itemFor(item.prefab)?.name ?? item.prefab).toLowerCase().includes(normalized))
      return { container, name, stacks, matches }
    })
    .filter((row) => row.matches), [containerName, group.members, itemFor, normalized])
  // Above the marker by default; below it when the map's top edge is too close
  // (the card would be clipped), measured against the nearest map viewport.
  const cardRef = useRef<HTMLDivElement>(null)
  const [below, setBelow] = useState(false)
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card) return
    const viewport = card.closest('[data-map-viewport]') ?? card.closest('main')
    const anchor = card.parentElement?.getBoundingClientRect()
    const bounds = viewport?.getBoundingClientRect()
    if (!anchor || !bounds) return
    const height = card.getBoundingClientRect().height
    setBelow(anchor.top - bounds.top < height + 24)
  }, [pinned, rows.length])
  return (
    <div
      ref={cardRef}
      role={pinned ? 'dialog' : 'tooltip'}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      className={cn(
        'absolute left-1/2 z-10 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] text-left text-xs text-[var(--text)] shadow-xl',
        below ? 'top-full mt-3' : 'bottom-full mb-3',
        pinned ? 'w-72 cursor-default' : 'pointer-events-none w-60',
      )}
    >
      <div className="flex items-start gap-2 border-b border-[var(--border)]/60 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12px] font-semibold">{t('map.containers.groupTitle', { count: group.members.length })}</p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
            {t('map.containers.groupItems', { count: totalItems })}
            {!live ? ` · ${t('map.containers.remembered')}` : ''}
          </p>
        </div>
        {pinned && onZoomIn ? (
          <button
            type="button"
            onClick={onZoomIn}
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]"
            aria-label={t('map.containers.zoomIn')}
            title={t('map.containers.zoomIn')}
          >
            <ZoomIn size={13} aria-hidden="true" />
          </button>
        ) : null}
        {pinned ? (
          <button
            type="button"
            onClick={onClose}
            className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]"
            aria-label={t('map.containers.close')}
          >
            <X size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {!pinned ? (
        <>
          {topItems.length > 0 ? (
            <ul className="flex flex-col py-1">
              {topItems.map((row) => {
                const item = itemFor(row.prefab)
                return (
                  <li key={row.prefab} className="flex items-center gap-2 px-2.5 py-0.5">
                    {item?.icon
                      ? <img src={item.icon} alt="" className="size-5 shrink-0 object-contain" />
                      : <span className="size-5 shrink-0 rounded-[3px] bg-white/8" aria-hidden="true" />}
                    <span className="min-w-0 flex-1 truncate text-[11.5px]">{item?.name ?? row.prefab}</span>
                    <span className="text-[11px] font-semibold tabular-nums text-[var(--accent-text)]">×{row.amount.toLocaleString(i18n.language)}</span>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-2.5 py-2 text-[11px] text-[var(--muted)]">{t('map.containers.empty')}</p>
          )}
          <p className="border-t border-[var(--border)]/60 px-2.5 py-1 text-[10px] text-[var(--muted)]">{t('map.containers.groupClickHint')}</p>
        </>
      ) : (
        <>
          <div className="px-2 pt-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('map.containers.groupSearch')}
              className="w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-2 py-1 text-[11px] text-[var(--text)] outline-none placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
            />
          </div>
          <ul data-map-scroll className="flex max-h-72 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5">
            {rows.length === 0 ? (
              <li className="px-2 py-2 text-[11px] text-[var(--muted)]">{t('map.containers.groupNoMatch')}</li>
            ) : rows.map(({ container, name, stacks }) => (
              <li key={container.id}>
                <button
                  type="button"
                  onClick={() => onPick(container)}
                  className={cn(
                    'flex w-full cursor-pointer items-start gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left hover:bg-white/8',
                    selectedId === container.id && 'bg-[var(--accent)]/15 ring-1 ring-[var(--accent)]/50',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border',
                    container.owner === 'own' ? 'border-amber-100/80 bg-amber-300 text-amber-950' : 'border-sky-100/80 bg-sky-400 text-sky-950',
                  )}>
                    <Archive size={11} strokeWidth={2.5} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1">
                      {container.private ? <Lock size={10} className="shrink-0 text-[var(--muted)]" aria-hidden="true" /> : null}
                      <span className="truncate text-[11.5px] font-semibold">{name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-[var(--muted)]">
                      {stacks.length === 0
                        ? t('map.containers.empty')
                        : stacks.map((row) => `${row.amount}× ${row.item?.name ?? row.prefab}`).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
                    {t('map.containers.itemCount', { count: container.items.reduce((sum, item) => sum + item.amount, 0) })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      <div className={cn(
        'absolute left-1/2 size-2 -translate-x-1/2 rotate-45 border-[var(--border-strong)] bg-[var(--surface)]',
        below ? 'top-0 -translate-y-1/2 border-l border-t' : 'top-full -translate-y-1/2 border-r border-b',
      )} />
    </div>
  )
}

function ContainerCard({
  container,
  live,
  containerName,
  itemFor,
  pinned,
  onClose,
}: {
  container: RememberedContainer
  live: boolean
  containerName: (token: string, prefab: string) => string
  itemFor: (prefab: string) => ContainerItemPresentation | null
  pinned: boolean
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  // Merge stacks of the same item so the list reads as an inventory, not slots.
  const rows = useMemo(() => {
    const merged = new Map<string, { prefab: string; amount: number }>()
    for (const item of container.items) {
      const key = item.prefab.toLowerCase()
      const row = merged.get(key)
      if (row) row.amount += item.amount
      else merged.set(key, { prefab: item.prefab, amount: item.amount })
    }
    return [...merged.values()].sort((a, b) => b.amount - a.amount)
  }, [container.items])
  const shown = pinned ? rows : rows.slice(0, PREVIEW_ROWS)
  const hiddenCount = rows.length - shown.length
  const title = containerName(container.name, container.prefab)
  const stateLabel = !live
    ? t('map.containers.remembered')
    : container.loaded
      ? t('map.containers.live')
      : t('map.containers.lastSeen')
  return (
    <div
      role={pinned ? 'dialog' : 'tooltip'}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      className={cn(
        'absolute bottom-full left-1/2 z-10 mb-2.5 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] text-left text-xs text-[var(--text)] shadow-xl',
        pinned ? 'w-64 cursor-default select-text' : 'pointer-events-none w-56',
      )}
    >
      <div className="flex items-start gap-2 border-b border-[var(--border)]/60 px-2.5 py-2">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 truncate text-[12px] font-semibold">
            {container.private ? <Lock size={11} className="shrink-0 text-[var(--muted)]" aria-hidden="true" /> : null}
            <span className="truncate">{title}</span>
          </p>
          <p className="mt-0.5 truncate text-[10px] text-[var(--muted)]">
            {container.owner === 'own'
              ? t('map.containers.yours')
              : t('map.containers.builtBy', { name: container.creator || t('map.containers.someone') })}
            {' · '}{stateLabel}
          </p>
        </div>
        {pinned ? (
          <button
            type="button"
            onClick={onClose}
            className="grid size-5 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] hover:bg-white/10 hover:text-[var(--text)]"
            aria-label={t('map.containers.close')}
          >
            <X size={12} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="px-2.5 py-2 text-[11px] text-[var(--muted)]">{t('map.containers.empty')}</p>
      ) : (
        <ul className={cn('flex flex-col py-1', pinned && 'max-h-64 overflow-y-auto')}>
          {shown.map((row) => {
            const item = itemFor(row.prefab)
            return (
              <li key={row.prefab} className="flex items-center gap-2 px-2.5 py-0.5">
                {item?.icon
                  ? <img src={item.icon} alt="" className="size-5 shrink-0 object-contain" />
                  : <span className="size-5 shrink-0 rounded-[3px] bg-white/8" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate text-[11.5px]">{item?.name ?? row.prefab}</span>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--accent-text)]">
                  ×{row.amount.toLocaleString(i18n.language)}
                </span>
              </li>
            )
          })}
          {hiddenCount > 0 ? (
            <li className="px-2.5 pt-1 text-[10px] text-[var(--muted)]">{t('map.containers.more', { count: hiddenCount })}</li>
          ) : null}
        </ul>
      )}
      {!pinned ? (
        <p className="border-t border-[var(--border)]/60 px-2.5 py-1 text-[10px] text-[var(--muted)]">{t('map.containers.clickHint')}</p>
      ) : null}
      <div className="absolute left-1/2 top-full size-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-r border-b border-[var(--border-strong)] bg-[var(--surface)]" />
    </div>
  )
}
