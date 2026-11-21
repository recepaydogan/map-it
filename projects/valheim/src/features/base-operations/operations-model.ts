import type { SavedPortal, SavedProductionStation } from '../../types/world-save.ts'
import type { ProductionStationCatalog } from './production-catalog.ts'

export type OperationStatus = 'attention' | 'ready' | 'active' | 'idle'

export interface PortalRoute {
  id: string
  endpoints: SavedPortal[]
  connected: boolean
}

export interface StationSummary {
  station: SavedProductionStation
  status: OperationStatus
  detail: 'needsFuel' | 'collectOutput' | 'processing' | 'fermenting' | 'idle'
  readyOutputAmount: number
  readyOutputPrefab: string
  burntOutputAmount: number
  fuelMissing: number
  fuelPrefab: string
  remainingSeconds: number | null
}

export interface StationCluster {
  id: string
  prefabName: string
  members: StationSummary[]
}

const FUELLED_PREFABS = new Set(['smelter', 'blastfurnace', 'eitrrefinery', 'piece_oven'])
export const STATION_CLUSTER_DISTANCE = 25
const FERMENTATION_DURATION_TICKS = 2_400 * 10_000_000
const GAME_TICKS_PER_SECOND = 10_000_000
const PASSIVE_OUTPUTS: Record<string, string> = {
  piece_beehive: 'Honey',
  piece_sapcollector: 'Sap',
}
const PORTAL_EXIT_DISTANCE = 1
const COMPASS_DIRECTIONS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const

export interface PortalExit {
  x: number
  z: number
  heading: number
  direction: typeof COMPASS_DIRECTIONS[number]
}

const normalizeHeading = (degrees: number) => ((degrees % 360) + 360) % 360

/** Mirrors TeleportWorld: arrive one metre in front of the destination portal. */
export function portalExit(portal: SavedPortal): PortalExit {
  const heading = normalizeHeading(Number.isFinite(portal.yaw) ? portal.yaw : 0)
  const radians = heading * Math.PI / 180
  return {
    x: portal.x + Math.sin(radians) * PORTAL_EXIT_DISTANCE,
    z: portal.y + Math.cos(radians) * PORTAL_EXIT_DISTANCE,
    heading,
    direction: COMPASS_DIRECTIONS[Math.round(heading / 45) % COMPASS_DIRECTIONS.length],
  }
}

export function cleanOperationLabel(value: string): string {
  return value
    .replace(/^\$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
    .trim()
}

export function buildPortalRoutes(portals: readonly SavedPortal[]): PortalRoute[] {
  const connected = new Map<number | string, SavedPortal[]>()
  const unlinked: PortalRoute[] = []

  portals.forEach((portal, index) => {
    const key = portal.connectionKey ?? (portal.connectionType === null ? null : portal.connectionHash)
    if (key === null) {
      unlinked.push({ id: `unlinked-${index}`, endpoints: [portal], connected: false })
      return
    }
    const group = connected.get(key) ?? []
    group.push(portal)
    connected.set(key, group)
  })

  const routes = [...connected.entries()].map(([hash, endpoints]) => ({
    id: `connection-${hash}`,
    endpoints,
    connected: endpoints.length === 2,
  }))

  return [...routes, ...unlinked].sort((first, second) => {
    if (first.connected !== second.connected) return first.connected ? 1 : -1
    const firstName = first.endpoints[0]?.tag ?? ''
    const secondName = second.endpoints[0]?.tag ?? ''
    return firstName.localeCompare(secondName)
  })
}

export function summarizeStation(
  station: SavedProductionStation,
  worldTimeTicks = 0,
  catalog: ProductionStationCatalog = {},
): StationSummary {
  const prefab = station.prefabName.toLowerCase()
  const definition = catalog[prefab]
  const conversion = definition?.conversions.find((candidate) =>
    candidate.inputPrefab.toLowerCase() === station.content.toLowerCase())
  const passiveOutputPrefab = PASSIVE_OUTPUTS[prefab] ?? ''
  const passiveOutputAmount = passiveOutputPrefab ? Math.max(0, Math.floor(station.level)) : 0
  const readySlotIndices = (station.slotStatuses ?? []).flatMap((slotStatus, index) => slotStatus === 1 ? [index] : [])
  const burntOutputAmount = (station.slotStatuses ?? []).filter((slotStatus) => slotStatus === 2).length
  const readySlotItems = readySlotIndices.map((index) => station.queueItems[index] ?? '').filter(Boolean)
  const cookingOutputPrefab = readySlotItems.length > 0 && readySlotItems.every((item) => item === readySlotItems[0])
    ? readySlotItems[0]
    : ''
  const fermentationDurationTicks = (definition?.fermentationSeconds ?? 0) > 0
    ? definition.fermentationSeconds * GAME_TICKS_PER_SECOND
    : FERMENTATION_DURATION_TICKS
  const fermentationElapsedTicks = station.startTimeTicks > 0
    ? Math.max(0, worldTimeTicks - station.startTimeTicks)
    : 0
  const fermentationReady = prefab === 'fermenter'
    && Boolean(station.content)
    && station.startTimeTicks > 0
    && fermentationElapsedTicks >= fermentationDurationTicks
  const remainingSeconds = prefab === 'fermenter' && station.content && station.startTimeTicks > 0
    ? Math.max(0, Math.ceil((fermentationDurationTicks - fermentationElapsedTicks) / GAME_TICKS_PER_SECOND))
    : null
  const readyOutputAmount = station.processedOutputAmount > 0
    ? Math.floor(station.processedOutputAmount)
    : passiveOutputAmount > 0
      ? passiveOutputAmount
      : fermentationReady
        ? conversion?.outputAmount ?? 1
        : readySlotIndices.length
  const readyOutputPrefab = station.processedOutputAmount > 0
    ? station.processedOutputPrefab
    : passiveOutputAmount > 0
      ? passiveOutputPrefab
      : fermentationReady
        ? conversion?.outputPrefab ?? ''
        : cookingOutputPrefab
  const fuelOnly = definition?.conversions.some((entry) => entry.fuelOnly) ?? false
  const hasQueuedWork = station.queued > 0 || station.queueItems.length > 0 || (fuelOnly && station.fuel > 0)
  const progressProducts = definition?.secondsPerProduct
    ? Math.min(1, Math.max(0, station.bakeTimer / definition.secondsPerProduct))
    : 0
  const fuelRequired = definition?.fuelPerProduct && station.queued > 0
    ? Math.max(0, (station.queued - progressProducts) * definition.fuelPerProduct)
    : 0
  const fuelMissing = fuelRequired > 0
    ? Math.max(0, Math.ceil(fuelRequired - station.fuel))
    : (FUELLED_PREFABS.has(prefab) || Boolean(definition?.fuelPrefab)) && hasQueuedWork && station.fuel <= 0 ? 1 : 0
  const fuelPrefab = definition?.fuelPrefab ?? ''
  const base = { station, readyOutputAmount, readyOutputPrefab, burntOutputAmount, fuelMissing, fuelPrefab, remainingSeconds }
  if (readyOutputAmount > 0 || burntOutputAmount > 0) {
    return { ...base, status: 'ready', detail: 'collectOutput' }
  }
  if (fuelMissing > 0) {
    return { ...base, status: 'attention', detail: 'needsFuel' }
  }
  if (hasQueuedWork) {
    return { ...base, status: 'active', detail: 'processing' }
  }
  if (station.content) return { ...base, status: 'active', detail: 'fermenting' }
  return { ...base, status: 'idle', detail: 'idle' }
}

export function summarizeStations(
  stations: readonly SavedProductionStation[],
  worldTimeTicks = 0,
  catalog: ProductionStationCatalog = {},
): StationSummary[] {
  const rank: Record<OperationStatus, number> = { attention: 0, ready: 1, active: 2, idle: 3 }
  return stations
    .map((station) => summarizeStation(station, station.observedWorldTimeTicks ?? worldTimeTicks, catalog))
    .sort((first, second) =>
      rank[first.status] - rank[second.status]
      || first.station.prefabName.localeCompare(second.station.prefabName),
    )
}

/**
 * Nearby stations of the same type are one user-facing operation. Requiring
 * every member to remain within the threshold prevents long chains of nearby
 * pieces from turning an entire base into one oversized cluster.
 */
export function clusterStationSummaries(
  summaries: readonly StationSummary[],
  maxDistance = STATION_CLUSTER_DISTANCE,
): StationCluster[] {
  const maxDistanceSquared = maxDistance * maxDistance
  const clusters: StationSummary[][] = []

  summaries.forEach((summary) => {
    const station = summary.station
    const cluster = clusters.find((members) =>
      members[0]?.station.prefabName.toLowerCase() === station.prefabName.toLowerCase()
      && members.every((member) => {
        const x = member.station.x - station.x
        const y = member.station.y - station.y
        return x * x + y * y <= maxDistanceSquared
      }))
    if (cluster) cluster.push(summary)
    else clusters.push([summary])
  })

  return clusters.map((members) => {
    const firstMember = members[0]
    const prefabName = firstMember.station.prefabName
    const anchor = [...members]
      .sort((first, second) => first.station.x - second.station.x || first.station.y - second.station.y)[0]
      .station
    return {
      id: `${prefabName.toLowerCase()}:${anchor.x}:${anchor.y}:${members.length}`,
      prefabName,
      members,
    }
  })
}
