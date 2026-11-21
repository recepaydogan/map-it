import { readMapTile, writeMapTile } from './map-tile-cache'

export interface MapTileRequest {
  key: string
  seedName: string
  resolution: number
  bounds: { left: number; top: number; right: number; bottom: number }
  /**
   * Prefetch rather than something on screen: yields its worker slot to visible
   * tiles and survives the viewport pruning below, so panning does not abandon
   * the fallback tile set halfway through.
   */
  background?: boolean
  /** The whole-world fallback remains needed when the viewport changes. */
  base?: boolean
}

interface QueueEntry extends MapTileRequest {
  resolve: (blob: Blob) => void
  reject: (error: Error) => void
}

/** Thrown when the viewport moves on before a queued tile starts rendering. */
export class TileSkipped extends Error {
  constructor(key: string) {
    super(`Map tile ${key} left the viewport before it was rendered.`)
    this.name = 'TileSkipped'
  }
}

/** Leaves the main thread and one core to the rest of the app. */
const WORKER_COUNT = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 2))
const MEMORY_CACHE_LIMIT = 256
const memoryCache = new Map<string, Blob>()
const pending = new Map<string, Promise<Blob>>()
const queue: QueueEntry[] = []
const workers = Array.from({ length: WORKER_COUNT }, () => ({
  worker: new Worker(new URL('../../workers/minimap-tile.worker.ts', import.meta.url), { type: 'module' }),
  busy: false,
}))
let requestId = 0
let visiblePriorities: ReadonlyMap<string, number> | null = null

const remember = (key: string, blob: Blob) => {
  memoryCache.delete(key)
  memoryCache.set(key, blob)
  if (memoryCache.size > MEMORY_CACHE_LIMIT) memoryCache.delete(memoryCache.keys().next().value ?? '')
}

/**
 * Drops queued tiles the viewport no longer wants. Without this, panning at a
 * deep detail level keeps every worker busy rendering ground the player has
 * already scrolled past, and the tiles now on screen wait behind them. Tiles
 * already handed to a worker run to completion — they are cheap to finish and
 * worth caching.
 */
export const setVisibleTiles = (priorities: ReadonlyMap<string, number>) => {
  visiblePriorities = priorities
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const entry = queue[index]
    if (entry.base || entry.background || priorities.has(entry.key)) continue
    queue.splice(index, 1)
    entry.reject(new TileSkipped(entry.key))
  }
  pump()
}

/** Re-evaluate against the latest camera, including already queued requests. */
const priorityOf = (entry: MapTileRequest) => entry.base ? -1
  : visiblePriorities?.get(entry.key) ?? (entry.background ? 3_000 : 2_000)

const takeNext = () => {
  if (queue.length === 0) return undefined
  let best = 0
  for (let index = 1; index < queue.length; index += 1) {
    if (priorityOf(queue[index]) < priorityOf(queue[best])) best = index
  }
  return queue.splice(best, 1)[0]
}

const pump = () => {
  for (const slot of workers) {
    if (slot.busy) continue
    const entry = takeNext()
    if (!entry) return
    slot.busy = true
    const id = ++requestId
    const onMessage = (event: MessageEvent<{ id: number; blob?: Blob; error?: string }>) => {
      if (event.data.id !== id) return
      slot.worker.removeEventListener('message', onMessage)
      slot.busy = false
      if (event.data.blob) entry.resolve(event.data.blob)
      else entry.reject(new Error(event.data.error ?? 'Tile rendering failed.'))
      pump()
    }
    slot.worker.addEventListener('message', onMessage)
    slot.worker.postMessage({ id, seedName: entry.seedName, resolution: entry.resolution, bounds: entry.bounds })
  }
}

const renderTile = (request: MapTileRequest) => new Promise<Blob>((resolve, reject) => {
  // IndexedDB may finish after the camera moved. Do not reintroduce a tile
  // that the latest viewport already removed from the queue.
  if (!request.base && !request.background && visiblePriorities && !visiblePriorities.has(request.key)) {
    reject(new TileSkipped(request.key))
    return
  }
  queue.push({ ...request, resolve, reject })
  pump()
})

export function loadMapTile(request: MapTileRequest): Promise<Blob> {
  const memory = memoryCache.get(request.key)
  if (memory) return Promise.resolve(memory)
  const existing = pending.get(request.key)
  if (existing) return existing
  const task = readMapTile(request.key)
    .then(async (stored) => {
      const blob = stored ?? await renderTile(request)
      remember(request.key, blob)
      if (!stored) void writeMapTile(request.key, blob)
      return blob
    })
    .finally(() => pending.delete(request.key))
  pending.set(request.key, task)
  return task
}
