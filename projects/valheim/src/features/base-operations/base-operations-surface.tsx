import {
  Activity,
  Box,
  Check,
  ChevronDown,
  ChevronRight,
  CircleCheck,
  CirclePause,
  CookingPot,
  Droplets,
  Factory,
  FlaskConical,
  Flame,
  Gem,
  Hexagon,
  Link2,
  Link2Off,
  LoaderCircle,
  MapPin,
  MapPinned,
  PackageCheck,
  RefreshCw,
  Settings,
  Search,
  TriangleAlert,
  Warehouse,
  Wind,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn.ts'
import type { SavedPortal, ValheimWorldDatabase, ValheimWorldSave } from '../../types/world-save.ts'
import type { FallbackOperations } from '../../lib/live-tracking/base-fallback.ts'
import {
  buildPortalRoutes,
  clusterStationSummaries,
  cleanOperationLabel,
  summarizeStations,
  type OperationStatus,
  type PortalRoute,
  type StationCluster,
} from './operations-model.ts'
import { useProductionCatalog } from './production-catalog.ts'

type OperationsTab = 'portals' | 'production'
const OPERATIONS_TABS: OperationsTab[] = ['production', 'portals']
const ALL_STATION_TYPES = 'all'

export interface OperationMapPoint {
  x: number
  z: number
  label: string
}

export interface OperationMapTarget extends OperationMapPoint {
  related?: OperationMapPoint[]
}

interface BaseOperationsSurfaceProps {
  world: ValheimWorldSave | null
  database: ValheimWorldDatabase | null
  fallback?: FallbackOperations | null
  fallbackEnabled?: boolean
  discovering: boolean
  loading: boolean
  error: string | null
  onRefresh: () => void
  onOpenMap: () => void
  onLocate: (target: OperationMapTarget) => void
}

const PREVIEW_OPERATIONS = {
  portals: [
    { prefabName: 'portal_wood', x: 124, y: -88, height: 30, yaw: 35, creator: 'preview', tag: 'Home', author: '', connectionType: 1, connectionHash: 101 },
    { prefabName: 'portal_wood', x: -1840, y: 920, height: 24, yaw: 205, creator: 'preview', tag: 'Home', author: '', connectionType: 16, connectionHash: 101 },
    { prefabName: 'portal_stone', x: 130, y: -93, height: 30, yaw: 90, creator: 'preview', tag: 'Ashlands', author: '', connectionType: 1, connectionHash: 202 },
    { prefabName: 'portal_stone', x: 3480, y: -5220, height: 8, yaw: 270, creator: 'preview', tag: 'Ashlands', author: '', connectionType: 16, connectionHash: 202 },
    { prefabName: 'portal_wood', x: 512, y: 840, height: 42, yaw: 145, creator: 'preview', tag: 'Mountains', author: '', connectionType: null, connectionHash: null },
  ],
  stations: [
    { prefabName: 'smelter', x: 98, y: -110, height: 29, creator: 'preview', fuel: 0, queued: 5, level: 0, productProgress: 0, processedOutputPrefab: '', processedOutputAmount: 0, content: '', bakeTimer: 0, startTimeTicks: 0, lastTimeTicks: 0, queueItems: ['CopperOre'], slotStatuses: [], slotCookTimes: [] },
    { prefabName: 'blastfurnace', x: 105, y: -114, height: 29, creator: 'preview', fuel: 8, queued: 4, level: 0, productProgress: 0, processedOutputPrefab: '', processedOutputAmount: 0, content: '', bakeTimer: 4, startTimeTicks: 0, lastTimeTicks: 0, queueItems: ['BlackMetalScrap'], slotStatuses: [], slotCookTimes: [] },
    { prefabName: 'piece_beehive', x: 140, y: -72, height: 31, creator: 'preview', fuel: 0, queued: 0, level: 3, productProgress: 0.6, processedOutputPrefab: '', processedOutputAmount: 0, content: '', bakeTimer: 0, startTimeTicks: 0, lastTimeTicks: 0, queueItems: [], slotStatuses: [], slotCookTimes: [] },
    { prefabName: 'fermenter', x: 86, y: -95, height: 30, creator: 'preview', fuel: 0, queued: 0, level: 0, productProgress: 0, processedOutputPrefab: '', processedOutputAmount: 0, content: 'BarleyWineBase', bakeTimer: 0, startTimeTicks: 120, lastTimeTicks: 0, queueItems: [], slotStatuses: [], slotCookTimes: [] },
    { prefabName: 'charcoal_kiln', x: 92, y: -120, height: 29, creator: 'preview', fuel: 0, queued: 12, level: 0, productProgress: 0, processedOutputPrefab: '', processedOutputAmount: 0, content: '', bakeTimer: 0, startTimeTicks: 0, lastTimeTicks: 0, queueItems: ['Wood'], slotStatuses: [], slotCookTimes: [] },
    { prefabName: 'windmill', x: 170, y: -60, height: 33, creator: 'preview', fuel: 0, queued: 0, level: 0, productProgress: 0, processedOutputPrefab: 'BarleyFlour', processedOutputAmount: 8, content: '', bakeTimer: 0, startTimeTicks: 0, lastTimeTicks: 0, queueItems: [], slotStatuses: [], slotCookTimes: [] },
  ],
} satisfies ValheimWorldDatabase['baseOperations']

const STATION_NAMES: Record<string, string> = {
  blastfurnace: 'Blast furnace',
  charcoal_kiln: 'Charcoal kiln',
  eitrrefinery: 'Eitr refinery',
  fermenter: 'Fermenter',
  piece_beehive: 'Beehive',
  piece_cookingstation: 'Cooking station',
  piece_cookingstation_iron: 'Iron cooking station',
  piece_oven: 'Stone oven',
  piece_sapcollector: 'Sap extractor',
  piece_spinningwheel: 'Spinning wheel',
  smelter: 'Smelter',
  windmill: 'Windmill',
}

const stationName = (prefab: string) => STATION_NAMES[prefab.toLowerCase()] ?? cleanOperationLabel(prefab)

const STATION_PLURAL_NAMES: Record<string, string> = {
  blastfurnace: 'Blast furnaces',
  charcoal_kiln: 'Charcoal kilns',
  eitrrefinery: 'Eitr refineries',
  fermenter: 'Fermenters',
  piece_beehive: 'Beehives',
  piece_cookingstation: 'Cooking stations',
  piece_cookingstation_iron: 'Iron cooking stations',
  piece_oven: 'Stone ovens',
  piece_sapcollector: 'Sap extractors',
  piece_spinningwheel: 'Spinning wheels',
  smelter: 'Smelters',
  windmill: 'Windmills',
}

const stationPluralName = (prefab: string) => STATION_PLURAL_NAMES[prefab.toLowerCase()] ?? `${stationName(prefab)}s`

const STATION_ICONS: Record<string, LucideIcon> = {
  blastfurnace: Flame,
  charcoal_kiln: Flame,
  eitrrefinery: Gem,
  fermenter: FlaskConical,
  piece_beehive: Hexagon,
  piece_cookingstation: CookingPot,
  piece_cookingstation_iron: CookingPot,
  piece_oven: CookingPot,
  piece_sapcollector: Droplets,
  piece_spinningwheel: Settings,
  smelter: Flame,
  windmill: Wind,
}

const coordinate = (value: number) => Math.round(value).toLocaleString()
const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${Math.max(1, Math.ceil(seconds))}s`
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.ceil((seconds % 3600) / 60)
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function StatusLabel({ status, label }: { status: OperationStatus; label: string }) {
  const StatusIcon = status === 'attention'
    ? TriangleAlert
    : status === 'ready'
      ? PackageCheck
      : status === 'active' ? Activity : CirclePause
  return (
    <span className={cn(
      'inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold',
      status === 'attention' && 'text-[var(--danger-text)]',
      status === 'ready' && 'text-[var(--accent-text)]',
      status === 'active' && 'text-[var(--text)]',
      status === 'idle' && 'text-[var(--muted)]',
    )}>
      <StatusIcon size={13} aria-hidden="true" />
      {label}
    </span>
  )
}

function EmptySurface({ onOpenMap }: { onOpenMap: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center bg-[var(--background)] p-6">
      <section className="w-full max-w-md text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--accent-text)]">
          <Warehouse size={25} aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-bold text-[var(--text)]">{t('baseOperations.empty.title')}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[12px] leading-5 text-[var(--muted)]">
          {t('baseOperations.empty.description')}
        </p>
        <button
          type="button"
          onClick={onOpenMap}
          className="mt-5 inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[12px] font-bold text-[var(--accent-contrast)] hover:brightness-110"
        >
          <MapPinned size={14} aria-hidden="true" />
          {t('baseOperations.empty.action')}
        </button>
      </section>
    </div>
  )
}

function SnapshotUnavailable({
  worldName,
  error,
  onRefresh,
  onOpenMap,
  fallbackEnabled,
}: {
  worldName: string
  error: string | null
  onRefresh: () => void
  onOpenMap: () => void
  fallbackEnabled?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="grid h-full place-items-center bg-[var(--background)] p-6">
      <section className="w-full max-w-lg rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] p-6 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-[var(--radius-lg)] bg-[var(--danger-soft)] text-[var(--danger-text)]">
          <TriangleAlert size={22} aria-hidden="true" />
        </div>
        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--accent-text)]">{worldName}</p>
        <h1 className="mt-1 text-xl font-bold text-[var(--text)]">{t(fallbackEnabled ? 'baseOperations.observedWaiting' : 'baseOperations.error.title')}</h1>
        {error ? <p className="mx-auto mt-2 max-w-md break-words text-[12px] leading-5 text-[var(--danger-text)]">{error}</p> : null}
        <p className="mx-auto mt-2 max-w-md text-[12px] leading-5 text-[var(--muted)]">{t(fallbackEnabled ? 'baseOperations.observedWaitingHint' : 'baseOperations.error.hint')}</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-4 text-[12px] font-bold text-[var(--accent-contrast)] hover:brightness-110"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t('baseOperations.refresh')}
          </button>
          <button
            type="button"
            onClick={onOpenMap}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 text-[12px] font-bold text-[var(--text)] hover:bg-[var(--surface-hover)]"
          >
            <MapPinned size={14} aria-hidden="true" />
            {t('navigation.map')}
          </button>
        </div>
      </section>
    </div>
  )
}

function PortalLocation({
  portal,
  endpoint,
  name,
  other,
  onLocate,
}: {
  portal: SavedPortal
  endpoint: 'A' | 'B'
  name: string
  other?: { portal: SavedPortal; endpoint: 'A' | 'B' }
  onLocate: (target: OperationMapTarget) => void
}) {
  const { t } = useTranslation()
  const point = {
    x: portal.x,
    z: portal.y,
    label: t('baseOperations.portals.mapLocation', { endpoint, name }),
  }
  const related = other ? [{
    x: other.portal.x,
    z: other.portal.y,
    label: t('baseOperations.portals.mapLocation', { endpoint: other.endpoint, name }),
  }] : undefined
  const locateLabel = t(other ? 'baseOperations.locatePortalPair' : 'baseOperations.locatePortalLocation', {
    endpoint,
    name,
  })
  return (
    <button
      type="button"
      onClick={() => onLocate({ ...point, related })}
      aria-label={locateLabel}
      title={locateLabel}
      className="group flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left focus-visible:relative focus-visible:z-10"
    >
      <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-full)] bg-[var(--accent-soft)] text-[10px] font-extrabold text-[var(--accent-text)]">
        {endpoint}
      </span>
      <span className="min-w-0 flex-1">
        <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold text-[var(--text)]">
          <MapPin size={12} className="text-[var(--muted)] transition-colors group-hover:text-[var(--accent-text)] group-focus-visible:text-[var(--accent-text)]" aria-hidden="true" />
          {t('baseOperations.portals.location', { endpoint })}
        </span>
        <span className="mt-0.5 block whitespace-normal break-words text-[10.5px] leading-4 text-[var(--muted)]">X {coordinate(portal.x)} · Z {coordinate(portal.y)}</span>
      </span>
      <ChevronRight size={15} className="shrink-0 text-[var(--muted)] transition-colors group-hover:text-[var(--accent-text)] group-focus-visible:text-[var(--accent-text)]" aria-hidden="true" />
    </button>
  )
}

function PortalRouteRow({ route, onLocate }: { route: PortalRoute; onLocate: (target: OperationMapTarget) => void }) {
  const { t } = useTranslation()
  const first = route.endpoints[0]
  const second = route.endpoints[1]
  const name = first.tag || second?.tag || t('baseOperations.portals.unnamed')
  return (
    <article className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--background)] shadow-[0_16px_38px_rgba(0,0,0,0.22)]">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <h3 className="whitespace-normal break-words text-[13px] font-bold leading-4 tracking-[-0.01em] text-[var(--text)]">{name}</h3>
      </header>
      <div className="flex min-w-0 flex-col p-2">
        <PortalLocation portal={first} endpoint="A" name={name} other={second ? { portal: second, endpoint: 'B' } : undefined} onLocate={onLocate} />
        <div className="grid h-4 place-items-center text-[var(--muted)]">
          <Link2 size={12} aria-hidden="true" />
        </div>
        {second ? (
          <PortalLocation portal={second} endpoint="B" name={name} other={{ portal: first, endpoint: 'A' }} onLocate={onLocate} />
        ) : (
          <button type="button" disabled className="flex min-h-14 w-full items-center gap-2.5 rounded-[var(--radius-md)] border border-dashed border-[var(--border)] bg-[var(--background)] px-3 py-2 text-left text-[var(--muted)]">
            <span className="grid size-7 shrink-0 place-items-center rounded-[var(--radius-full)] bg-[var(--surface-raised)]"><Link2Off size={13} aria-hidden="true" /></span>
            <span>
              <span className="block text-[11.5px] font-bold text-[var(--text)]">{t('baseOperations.status.unlinked')}</span>
              <span className="mt-0.5 block text-[10.5px]">{t('baseOperations.portals.missingEndpoint')}</span>
            </span>
          </button>
        )}
      </div>
    </article>
  )
}

function StationCard({ cluster, icon, onLocate }: { cluster: StationCluster; icon?: string | null; onLocate: (target: OperationMapTarget) => void }) {
  const { t } = useTranslation()
  const summary = cluster.members[0]
  const { station, status, detail } = summary
  const grouped = cluster.members.length > 1
  const displayName = grouped ? stationPluralName(cluster.prefabName) : stationName(cluster.prefabName)
  const StationIcon = STATION_ICONS[station.prefabName.toLowerCase()] ?? Factory
  const [failedIcon, setFailedIcon] = useState<string | null>(null)
  const queueLabel = station.queueItems[0] ? cleanOperationLabel(station.queueItems[0]) : ''
  const center = cluster.members.reduce((point, member) => ({
    x: point.x + member.station.x / cluster.members.length,
    z: point.z + member.station.y / cluster.members.length,
  }), { x: 0, z: 0 })
  const clusterDiameter = Math.ceil(cluster.members.reduce((largest, member, index) => {
    const farthest = cluster.members.slice(index + 1).reduce((distance, other) => Math.max(
      distance,
      Math.hypot(member.station.x - other.station.x, member.station.y - other.station.y),
    ), 0)
    return Math.max(largest, farthest)
  }, 0))
  const matchingStatusCount = cluster.members.filter((member) => member.detail === detail).length
  const readyOutputAmount = cluster.members.reduce((total, member) => total + member.readyOutputAmount, 0)
  const burntOutputAmount = cluster.members.reduce((total, member) => total + member.burntOutputAmount, 0)
  const fuelMissing = cluster.members.reduce((total, member) => total + member.fuelMissing, 0)
  const queuedAmount = cluster.members.reduce((total, member) => total + member.station.queued, 0)
  const outputPrefabs = [...new Set(cluster.members.map((member) => member.readyOutputPrefab).filter(Boolean))]
  const fuelPrefabs = [...new Set(cluster.members.map((member) => member.fuelPrefab).filter(Boolean))]
  const outputName = outputPrefabs.length === 1 ? cleanOperationLabel(outputPrefabs[0]) : t('baseOperations.production.items')
  const fuelName = fuelPrefabs.length === 1 ? cleanOperationLabel(fuelPrefabs[0]) : t('baseOperations.production.fuelGeneric')
  const nextRemaining = Math.min(...cluster.members.map((member) => member.remainingSeconds ?? Infinity).filter(Number.isFinite))
  const aggregateStatus: OperationStatus = fuelMissing > 0
    ? 'attention'
    : readyOutputAmount > 0 || burntOutputAmount > 0 ? 'ready' : status
  const statusLabel = !grouped
    ? fuelMissing > 0
      ? t('baseOperations.status.needsFuel')
      : burntOutputAmount > 0
      ? t('baseOperations.production.burnt', { count: burntOutputAmount })
      : t(`baseOperations.status.${detail}`)
    : fuelMissing > 0
      ? t('baseOperations.production.addFuel', { count: fuelMissing, item: fuelName })
      : readyOutputAmount > 0
        ? t('baseOperations.production.outputReady', { count: readyOutputAmount, item: outputName })
        : burntOutputAmount > 0
          ? t('baseOperations.production.burnt', { count: burntOutputAmount })
        : Number.isFinite(nextRemaining)
          ? t('baseOperations.production.nextBatch', { time: formatDuration(nextRemaining) })
          : t(`baseOperations.production.groupStatus.${detail}`, { count: matchingStatusCount })
  const intelligenceLabel = grouped
    ? fuelMissing > 0
      ? t('baseOperations.production.clusterFuelMeta', { count: cluster.members.length, queued: queuedAmount, missing: fuelMissing, item: fuelName })
      : readyOutputAmount > 0
        ? t('baseOperations.production.clusterOutputMeta', { count: cluster.members.length, amount: readyOutputAmount, item: outputName })
        : Number.isFinite(nextRemaining)
          ? t('baseOperations.production.clusterTimeMeta', { count: cluster.members.length, time: formatDuration(nextRemaining) })
          : t('baseOperations.production.clusterMeta', { count: cluster.members.length, diameter: clusterDiameter })
    : fuelMissing > 0
      ? t('baseOperations.production.queueFuelMeta', { queued: queuedAmount || station.queueItems.length, missing: fuelMissing, item: fuelName })
      : readyOutputAmount > 0
        ? t('baseOperations.production.outputReady', { count: readyOutputAmount, item: outputName })
        : Number.isFinite(nextRemaining)
          ? t('baseOperations.production.batchTimeMeta', { time: formatDuration(nextRemaining) })
          : ''
  const locateLabel = grouped
    ? t('baseOperations.production.locateCluster', { count: cluster.members.length, name: displayName.toLowerCase() })
    : t('baseOperations.locate', { name: displayName })
  return (
    <article className="min-w-0">
      <button
        type="button"
        onClick={() => onLocate({
          x: grouped ? center.x : station.x,
          z: grouped ? center.z : station.y,
          label: grouped
            ? t('baseOperations.production.mapCluster', { count: cluster.members.length, name: displayName.toLowerCase() })
            : displayName,
        })}
        aria-label={locateLabel}
        title={locateLabel}
        className="group flex h-full min-h-[122px] w-full min-w-0 cursor-pointer flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-0 text-left shadow-[0_16px_38px_rgba(0,0,0,0.22)]"
      >
        <span className="flex w-full min-w-0 items-center gap-2.5 px-3 py-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-md)] bg-black/20 text-[var(--accent-text)]">
            {icon && failedIcon !== icon
              ? <img src={icon} alt="" draggable={false} loading="lazy" className="size-9 object-contain" onError={() => setFailedIcon(icon)} />
              : <StationIcon size={17} strokeWidth={1.8} aria-hidden="true" />}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-[-0.01em] text-[var(--text)]">{displayName}</span>
          <StatusLabel status={aggregateStatus} label={statusLabel} />
        </span>
        <span className="flex w-full flex-1 flex-col border-t border-[var(--border)] bg-[var(--background)] px-3 py-2">
          <span className="w-full min-w-0 whitespace-normal break-words text-[10.5px] font-semibold leading-4 text-[var(--muted)]">
            {intelligenceLabel || (station.queued > 0 ? t('baseOperations.production.queued', { count: station.queued }) : '')}
            {!intelligenceLabel && station.queued > 0 && queueLabel ? ' · ' : ''}
            {!intelligenceLabel && queueLabel ? <span className="text-[var(--text)]">{queueLabel}</span> : null}
            {!intelligenceLabel && (station.queued > 0 || queueLabel) && station.fuel > 0 ? ' · ' : ''}
            {!intelligenceLabel && station.fuel > 0 ? t('baseOperations.production.fuel', { count: Math.floor(station.fuel) }) : ''}
          </span>
          <span className="mt-auto flex w-full items-center justify-between pt-2 text-[10.5px] font-bold text-[var(--muted)] transition-colors group-hover:text-[var(--accent-text)] group-focus-visible:text-[var(--accent-text)]">
            <span className="inline-flex items-center gap-1.5"><MapPin size={12} aria-hidden="true" />{t(grouped ? 'baseOperations.production.showClusterOnMap' : 'baseOperations.showOnMap')}</span>
            <ChevronRight size={14} aria-hidden="true" />
          </span>
        </span>
      </button>
    </article>
  )
}

function ListSearch({ value, onChange, placeholder }: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const { t } = useTranslation()
  return (
    <label className="flex h-9 w-56 max-w-full items-center gap-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 transition-colors focus-within:border-[var(--accent)] @max-[620px]:w-full">
      <Search size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        name="base-operations-search"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text)] outline-none placeholder:text-[var(--muted)]"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="grid size-5 cursor-pointer place-items-center text-[var(--muted)] hover:text-[var(--text)]"
          aria-label={t('common.clear', { defaultValue: 'Clear search' })}
        >
          <X size={12} aria-hidden="true" />
        </button>
      ) : null}
    </label>
  )
}

function ProductionTypeFilter({
  value,
  options,
  onChange,
}: {
  value: string
  options: Array<{ prefabName: string; label: string; count: number }>
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const allOptions = [
    { prefabName: ALL_STATION_TYPES, label: t('baseOperations.production.allTypes'), count: null },
    ...options,
  ]
  const selectedIndex = Math.max(0, allOptions.findIndex((option) => option.prefabName === value))
  const selectedLabel = allOptions[selectedIndex]?.label ?? t('baseOperations.production.allTypes')

  useEffect(() => {
    if (!open) return
    optionRefs.current[activeIndex]?.focus()
  }, [activeIndex, open])

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    return () => document.removeEventListener('pointerdown', closeOnOutsideClick)
  }, [])

  const openMenu = (index = selectedIndex) => {
    setActiveIndex(index)
    setOpen(true)
  }
  const closeMenu = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }
  const choose = (prefabName: string) => {
    onChange(prefabName)
    closeMenu()
  }
  const moveFocus = (nextIndex: number) => {
    setActiveIndex(Math.max(0, Math.min(allOptions.length - 1, nextIndex)))
  }

  return (
    <div
      ref={rootRef}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
      className="relative min-w-40"
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={t('baseOperations.production.typeFilter')}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => open ? closeMenu() : openMenu()}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          openMenu(event.key === 'ArrowDown'
            ? Math.min(allOptions.length - 1, selectedIndex + 1)
            : Math.max(0, selectedIndex - 1))
        }}
        className={cn(
          'flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-left text-[13px] text-zinc-100 outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:border-[var(--accent)]',
          open && 'border-[var(--accent)]/60',
        )}
      >
        <span className="min-w-0 flex-1 truncate font-medium">{selectedLabel}</span>
        <ChevronDown size={14} className="shrink-0 text-zinc-500" aria-hidden="true" />
      </button>
      {open ? (
        <div
          role="listbox"
          aria-label={t('baseOperations.production.typeFilter')}
          className="operations-type-menu absolute right-0 top-[calc(100%+6px)] z-[1600] max-h-64 w-56 min-w-full overflow-x-hidden overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_20px_25px_-5px_rgba(0,0,0,0.5),0_8px_10px_-6px_rgba(0,0,0,0.5)] animate-[fade-in_0.3s_ease-out]"
        >
          {allOptions.map((option, index) => {
            const selectedOption = option.prefabName === value
            return (
              <div key={option.prefabName}>
                <button
                  ref={(element) => { optionRefs.current[index] = element }}
                  type="button"
                  role="option"
                  aria-selected={selectedOption}
                  tabIndex={activeIndex === index ? 0 : -1}
                  onClick={() => choose(option.prefabName)}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault()
                      moveFocus((index + 1) % allOptions.length)
                    } else if (event.key === 'ArrowUp') {
                      event.preventDefault()
                      moveFocus((index - 1 + allOptions.length) % allOptions.length)
                    } else if (event.key === 'Home') {
                      event.preventDefault()
                      moveFocus(0)
                    } else if (event.key === 'End') {
                      event.preventDefault()
                      moveFocus(allOptions.length - 1)
                    } else if (event.key === 'Escape') {
                      event.preventDefault()
                      closeMenu()
                    }
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-[13px] outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]',
                    selectedOption
                      ? 'text-zinc-50'
                      : 'text-zinc-300',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{option.label}</span>
                  {option.count !== null ? <span className="shrink-0 tabular-nums text-[11px] text-zinc-500">{option.count}</span> : null}
                  {selectedOption ? <Check size={13} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" /> : null}
                </button>
                {index === 0 ? <div className="my-1 h-px bg-[var(--border)]" aria-hidden="true" /> : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function BaseOperationsSurface({
  world,
  database,
  fallback,
  fallbackEnabled,
  discovering,
  loading,
  error,
  onRefresh,
  onOpenMap,
  onLocate,
}: BaseOperationsSurfaceProps) {
  const { t } = useTranslation()
  const productionCatalog = useProductionCatalog()
  const [tab, setTab] = useState<OperationsTab>('production')
  const [query, setQuery] = useState('')
  const [stationType, setStationType] = useState(ALL_STATION_TYPES)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const preview = import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === 'operations'
  const visibleWorld = preview ? { ...world, name: 'Ravenheim' } : world
  const observed = database ? null : fallback
  const baseOperations = preview ? PREVIEW_OPERATIONS : database?.baseOperations ?? observed?.baseOperations
  const portals = useMemo(() => baseOperations?.portals ?? [], [baseOperations])
  const stations = useMemo(() => baseOperations?.stations ?? [], [baseOperations])
  const portalRoutes = useMemo(() => buildPortalRoutes(portals), [portals])
  const worldTimeTicks = database?.resourceState.worldTimeTicks ?? 0
  const stationSummaries = useMemo(
    () => summarizeStations(stations, worldTimeTicks, productionCatalog),
    [stations, worldTimeTicks, productionCatalog],
  )
  const stationClusters = useMemo(() => clusterStationSummaries(stationSummaries), [stationSummaries])
  const stationTypeOptions = useMemo(() => {
    const counts = new Map<string, number>()
    stations.forEach((station) => {
      const prefabName = station.prefabName.toLowerCase()
      counts.set(prefabName, (counts.get(prefabName) ?? 0) + 1)
    })
    return [...counts.entries()]
      .map(([prefabName, count]) => ({
        prefabName,
        count,
        label: count === 1 ? stationName(prefabName) : stationPluralName(prefabName),
      }))
      .sort((first, second) => first.label.localeCompare(second.label))
  }, [stations])
  const effectiveStationType = stationTypeOptions.some((option) => option.prefabName === stationType)
    ? stationType
    : ALL_STATION_TYPES
  const unlinkedRoutes = portalRoutes.filter((route) => !route.connected)
  const needsFuelCount = stationSummaries.filter((summary) => summary.fuelMissing > 0).length
  const readyOutputCount = stationSummaries.reduce((total, summary) => (
    total + summary.readyOutputAmount + summary.burntOutputAmount
  ), 0)
  const actionCount = unlinkedRoutes.length + needsFuelCount + readyOutputCount
  const prioritySummary = [
    unlinkedRoutes.length > 0 ? t('baseOperations.hero.unlinkedSummary', { count: unlinkedRoutes.length }) : '',
    needsFuelCount > 0 ? t('baseOperations.hero.fuelSummary', { count: needsFuelCount }) : '',
    readyOutputCount > 0 ? t('baseOperations.hero.outputSummary', { count: readyOutputCount }) : '',
  ].filter(Boolean).join(' · ')
  const normalizedQuery = query.trim().toLowerCase()
  const visibleRoutes = portalRoutes.filter((route) => !normalizedQuery || route.endpoints.some((portal) =>
    portal.tag.toLowerCase().includes(normalizedQuery),
  ))
  const visibleStationClusters = stationClusters.filter((cluster) => !normalizedQuery
    || stationName(cluster.prefabName).toLowerCase().includes(normalizedQuery)
    || stationPluralName(cluster.prefabName).toLowerCase().includes(normalizedQuery)
    || cluster.members.some((summary) => summary.station.queueItems.some((item) => item.toLowerCase().includes(normalizedQuery)))
  ).filter((cluster) => effectiveStationType === ALL_STATION_TYPES
    || cluster.prefabName.toLowerCase() === effectiveStationType,
  )

  if ((discovering || loading) && !database && !observed) {
    return (
      <div className="grid h-full place-items-center bg-[var(--background)] text-[var(--muted)]">
        <div className="text-center">
          <LoaderCircle size={22} className="mx-auto animate-spin text-[var(--accent-text)]" aria-hidden="true" />
          <p className="mt-3 text-[12px] font-semibold" role="status" aria-live="polite">{t('baseOperations.loading')}</p>
        </div>
      </div>
    )
  }

  if (!visibleWorld) return <EmptySurface onOpenMap={onOpenMap} />
  if (!database && !observed && !preview) {
    return (
      <SnapshotUnavailable
        fallbackEnabled={fallbackEnabled}
        worldName={visibleWorld.name}
        error={error}
        onRefresh={onRefresh}
        onOpenMap={onOpenMap}
      />
    )
  }

  const hasOperations = portals.length > 0 || stations.length > 0

  return (
    <main className="h-full overflow-y-auto bg-[var(--background)] [container-name:operations] [container-type:inline-size]">
      <div className="mx-auto w-full max-w-[1180px] p-5 @max-[700px]:p-3">
        <header className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--accent-text)]">
              {t('baseOperations.eyebrow')}
            </p>
            <h1 className="mt-1 truncate text-[22px] font-bold tracking-[-0.025em] text-[var(--text)]">
              {t('baseOperations.title')}
            </h1>
            <p className="mt-1 max-w-[720px] text-[12px] leading-5 text-[var(--muted)]">
              {t(observed ? 'baseOperations.observedDescription' : 'baseOperations.description', { world: visibleWorld.name })}
            </p>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-2 px-1 text-[12px] font-semibold text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:cursor-not-allowed disabled:text-[var(--muted)]"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {t('baseOperations.refresh')}
          </button>
        </header>

        {observed ? (
          <p role="status" className="mt-4 rounded-[var(--radius-md)] border border-[var(--border)] p-3 text-[12px] text-[var(--muted)]">
            {t('baseOperations.observedHint')} {' '}
            {t('baseOperations.observedUpdated', { time: new Date(observed.updatedAt).toLocaleTimeString() })}
            {observed.truncated ? ` ${t('baseOperations.observedLimit')}` : ''}
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="mt-5 flex items-start gap-3 rounded-[var(--radius-md)] border border-[var(--danger)]/55 bg-[var(--danger-soft)] p-3 text-[var(--danger-text)]">
            <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[12px] font-bold">{t('baseOperations.error.title')}</p>
              <p className="mt-1 break-words text-[11px] leading-4">{error}</p>
              <p className="mt-1 text-[11px] leading-4">{t('baseOperations.error.hint')}</p>
            </div>
          </div>
        ) : null}

        <section className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-[0_16px_38px_rgba(0,0,0,0.18)]">
          <div className="flex min-w-0 items-start gap-3 px-4 py-3.5">
            <div className={cn('mt-0.5 shrink-0', actionCount > 0 ? 'text-[var(--warning-text)]' : 'text-[var(--accent-text)]')}>
              {!hasOperations
                ? <Warehouse size={17} aria-hidden="true" />
                : actionCount > 0
                  ? <TriangleAlert size={17} aria-hidden="true" />
                  : <CircleCheck size={17} aria-hidden="true" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-[14px] font-bold text-[var(--text)]">
                {!hasOperations
                  ? t('baseOperations.hero.empty')
                  : actionCount > 0
                    ? t('baseOperations.hero.attention')
                    : t('baseOperations.hero.clear')}
              </h2>
              <p className="mt-1 text-[11.5px] leading-5 text-[var(--muted)]">
                {!hasOperations
                  ? t('baseOperations.hero.emptyHint')
                  : actionCount > 0 ? prioritySummary : t('baseOperations.hero.clearHint')}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 border-t border-[var(--border)] bg-[var(--background)] @max-[620px]:grid-cols-1">
            <button
              type="button"
              disabled={unlinkedRoutes.length === 0}
              onClick={() => { setTab('portals'); setQuery('') }}
              className="group flex min-h-16 cursor-pointer items-center gap-3 border-r border-[var(--border)] px-4 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent @max-[620px]:border-b @max-[620px]:border-r-0"
            >
              <Link2Off size={16} className="shrink-0 text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-bold tabular-nums text-[var(--text)]">{unlinkedRoutes.length}</span>
                <span className="block truncate text-[10.5px] font-semibold text-[var(--muted)]">{t('baseOperations.hero.unlinked')}</span>
              </span>
              {unlinkedRoutes.length > 0 ? <ChevronRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" /> : null}
            </button>
            <button
              type="button"
              disabled={needsFuelCount === 0}
              onClick={() => { setTab('production'); setQuery(''); setStationType(ALL_STATION_TYPES) }}
              className="group flex min-h-16 cursor-pointer items-center gap-3 border-r border-[var(--border)] px-4 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent @max-[620px]:border-b @max-[620px]:border-r-0"
            >
              <Flame size={16} className="shrink-0 text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-bold tabular-nums text-[var(--text)]">{needsFuelCount}</span>
                <span className="block truncate text-[10.5px] font-semibold text-[var(--muted)]">{t('baseOperations.hero.needsFuel')}</span>
              </span>
              {needsFuelCount > 0 ? <ChevronRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" /> : null}
            </button>
            <button
              type="button"
              disabled={readyOutputCount === 0}
              onClick={() => { setTab('production'); setQuery(''); setStationType(ALL_STATION_TYPES) }}
              className="group flex min-h-16 cursor-pointer items-center gap-3 px-4 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-default disabled:opacity-55 disabled:hover:bg-transparent"
            >
              <PackageCheck size={16} className="shrink-0 text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[18px] font-bold tabular-nums text-[var(--text)]">{readyOutputCount}</span>
                <span className="block truncate text-[10.5px] font-semibold text-[var(--muted)]">{t('baseOperations.hero.readyOutput')}</span>
              </span>
              {readyOutputCount > 0 ? <ChevronRight size={14} className="text-[var(--muted)] group-hover:text-[var(--accent-text)]" aria-hidden="true" /> : null}
            </button>
          </div>
        </section>

        <div className="mt-5 flex items-center justify-between gap-4 border-b border-[var(--border)] @max-[620px]:flex-col @max-[620px]:items-stretch @max-[620px]:gap-2">
          <div role="tablist" aria-label={t('baseOperations.tabs.label')} className="flex items-center gap-1">
            {OPERATIONS_TABS.map((entry, index) => (
              <button
                key={entry}
                ref={(element) => { tabRefs.current[index] = element }}
                id={`operations-tab-${entry}`}
                type="button"
                role="tab"
                aria-selected={tab === entry}
                aria-controls={`operations-panel-${entry}`}
                tabIndex={tab === entry ? 0 : -1}
                onClick={() => { setTab(entry); setQuery('') }}
                onKeyDown={(event) => {
                  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'Home' && event.key !== 'End') return
                  event.preventDefault()
                  const nextIndex = event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? OPERATIONS_TABS.length - 1
                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + OPERATIONS_TABS.length) % OPERATIONS_TABS.length
                  const nextTab = OPERATIONS_TABS[nextIndex]
                  setTab(nextTab)
                  setQuery('')
                  tabRefs.current[nextIndex]?.focus()
                }}
                className={cn(
                  'relative h-10 cursor-pointer px-3 text-[12px] font-bold transition-colors',
                  tab === entry ? 'text-[var(--text)]' : 'text-[var(--muted)] hover:text-[var(--text)]',
                )}
              >
                {t(`baseOperations.tabs.${entry}`)}
                <span className="ml-1.5 text-[10px] tabular-nums text-[var(--muted)]">{entry === 'portals' ? portals.length : stations.length}</span>
                {tab === entry ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-[var(--accent)]" aria-hidden="true" /> : null}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 pb-1 @max-[620px]:grid @max-[620px]:grid-cols-[minmax(0,1fr)_auto]">
            <ListSearch
              value={query}
              onChange={setQuery}
              placeholder={t(tab === 'portals' ? 'baseOperations.portals.search' : 'baseOperations.production.search')}
            />
            {tab === 'production' ? (
              <ProductionTypeFilter
                value={effectiveStationType}
                options={stationTypeOptions}
                onChange={setStationType}
              />
            ) : null}
          </div>
        </div>

        {tab === 'portals' ? (
          <section
            id="operations-panel-portals"
            role="tabpanel"
            aria-labelledby="operations-tab-portals"
            tabIndex={0}
            className="mt-4 grid grid-cols-3 gap-3 outline-none @max-[760px]:grid-cols-2 @max-[520px]:grid-cols-1"
          >
            {visibleRoutes.length > 0 ? visibleRoutes.map((route) => <PortalRouteRow key={route.id} route={route} onLocate={onLocate} />) : (
              <p className="px-5 py-16 text-center text-[12px] text-[var(--muted)]">{t('baseOperations.portals.empty')}</p>
            )}
          </section>
        ) : null}

        {tab === 'production' ? (
          <section
            id="operations-panel-production"
            role="tabpanel"
            aria-labelledby="operations-tab-production"
            tabIndex={0}
            className="mt-4 grid grid-cols-3 gap-3 outline-none @max-[620px]:grid-cols-1"
          >
            {visibleStationClusters.length > 0 ? visibleStationClusters.map((cluster) => (
              <StationCard key={cluster.id} cluster={cluster} icon={productionCatalog[cluster.prefabName.toLowerCase()]?.icon} onLocate={onLocate} />
            )) : (
              <div className="px-5 py-16 text-center">
                <Box size={20} className="mx-auto text-[var(--muted)]" aria-hidden="true" />
                <p className="mt-3 text-[12px] text-[var(--muted)]">{t('baseOperations.production.empty')}</p>
              </div>
            )}
          </section>
        ) : null}
      </div>
    </main>
  )
}
