import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { pruneMapTiles } from '../lib/valheim/map-tile-cache'
import { loadMapTile, setVisibleTiles, TileSkipped } from '../lib/valheim/map-tile-renderer'

interface SeedBiomeMapProps {
  seedName: string
  onRenderStateChange: (state: { seedName: string; status: 'rendering' | 'ready' | 'error' }) => void
  zoom: number
  panX: number
  panY: number
  mapSize: number
  viewportWidth: number
  viewportHeight: number
}

const BASE_RESOLUTION = 1_024
const TILE_RESOLUTION = 256
/**
 * Grid counts per detail level: level N covers the whole map with
 * count × TILE_RESOLUTION texels. Only the first level is prefetched; deeper
 * levels are rendered on demand for the handful of tiles actually on screen, so
 * the cost of a level stays flat no matter how far the player zooms in.
 */
const TILE_LEVELS = [16, 32, 64, 128] as const
const NATIVE_TILE_COUNT = TILE_LEVELS[0]
/** How far a tile texel may be stretched on screen before the next level in. */
const MAGNIFICATION_BUDGET = 2
const TILE_OVERSCAN = 1
/** Safety net for very large viewports; the level below covers whatever is cut. */
const MAX_TILES_PER_LAYER = 32
const DETAIL_DEBOUNCE_MS = 60
const DETAIL_MAX_WAIT_MS = 120
const TILE_CACHE_VERSION = 7
const VERSION_PREFIX = `v${TILE_CACHE_VERSION}:`

const tileKey = (seedName: string, count: number, column: number, row: number) =>
  `${VERSION_PREFIX}${seedName}:${count}:${column}:${row}:${TILE_RESOLUTION}`

/**
 * Retina panels double the texels behind every CSS pixel, but honouring that in
 * full would pick a level too deep to keep filled while panning, so the nudge is
 * capped well short of it.
 */
const pixelDensity = () => Math.min(1.5, (typeof window === 'undefined' ? 1 : window.devicePixelRatio) || 1)

const levelForView = (zoom: number, mapSize: number) => {
  const onScreen = mapSize * zoom * pixelDensity()
  return TILE_LEVELS.find((count) => onScreen / count <= TILE_RESOLUTION * MAGNIFICATION_BUDGET)
    ?? TILE_LEVELS[TILE_LEVELS.length - 1]
}

const drawTile = async (context: CanvasRenderingContext2D, blob: Blob, isCancelled = () => false) => {
  const bitmap = await createImageBitmap(blob)
  if (isCancelled()) {
    bitmap.close()
    return
  }
  context.clearRect(0, 0, context.canvas.width, context.canvas.height)
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
}

function SeedBiomeTile({ seedName, count, column, row }: { seedName: string; count: number; column: number; row: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    let cancelled = false
    let retryTimer: number | undefined
    const request = async () => {
      if (cancelled) return
      try {
        const blob = await loadMapTile({
          key: tileKey(seedName, count, column, row),
          resolution: TILE_RESOLUTION,
          seedName,
          bounds: {
            left: column / count,
            top: row / count,
            right: (column + 1) / count,
            bottom: (row + 1) / count,
          },
        })
        if (!cancelled) await drawTile(context, blob, () => cancelled)
      } catch (error: unknown) {
        if (cancelled) return
        if (error instanceof TileSkipped) {
          // A still-mounted tile can inherit an old pending request that was
          // pruned as the camera crossed a boundary. It must not stay blank.
          retryTimer = window.setTimeout(() => void request(), 50)
          return
        }
        console.error('[Seed biome map] Failed to load a detail tile', error)
      }
    }
    void request()
    return () => { cancelled = true; window.clearTimeout(retryTimer) }

  }, [column, count, row, seedName])

  return <canvas ref={canvasRef} width={TILE_RESOLUTION} height={TILE_RESOLUTION} className="absolute h-auto w-auto" style={{ left: `${column / count * 100}%`, top: `${row / count * 100}%`, width: `${100 / count}%`, height: `${100 / count}%` }} aria-hidden="true" />
}

function SeedBiomeMapComponent({ seedName, onRenderStateChange, zoom, panX, panY, mapSize, viewportWidth, viewportHeight }: SeedBiomeMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [detailView, setDetailView] = useState({ zoom, panX, panY, mapSize, viewportWidth, viewportHeight })

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) {
      onRenderStateChange({ seedName, status: 'error' })
      return
    }
    let cancelled = false
    onRenderStateChange({ seedName, status: 'rendering' })
    const key = `${VERSION_PREFIX}${seedName}:base:${BASE_RESOLUTION}`
    void loadMapTile({
      key,
      seedName,
      resolution: BASE_RESOLUTION,
      base: true,
      bounds: { left: 0, top: 0, right: 1, bottom: 1 },
    }).then(async (blob) => {
      if (cancelled) return
      await drawTile(context, blob, () => cancelled)
      if (!cancelled) onRenderStateChange({ seedName, status: 'ready' })
    }).catch((error: unknown) => {
      if (cancelled) return
      console.error('[Seed biome map] Failed to load the base map', error)
      onRenderStateChange({ seedName, status: 'error' })
    })
    return () => { cancelled = true }
  }, [seedName, onRenderStateChange])

  // Where the camera is looking, in map fractions; the warm-up reads it live so
  // the tiles under the player render first, not the world centre's.
  const viewCenter = useRef({ x: 0.5, y: 0.5 })
  useEffect(() => {
    if (mapSize <= 1) return
    viewCenter.current = { x: 0.5 - panX / (mapSize * zoom), y: 0.5 - panY / (mapSize * zoom) }
  }, [mapSize, panX, panY, zoom])

  useEffect(() => {
    let cancelled = false
    const warmTileSet = async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 2_000))
      const remaining = Array.from({ length: NATIVE_TILE_COUNT * NATIVE_TILE_COUNT }, (_, index) => ({
        column: index % NATIVE_TILE_COUNT,
        row: Math.floor(index / NATIVE_TILE_COUNT),
      }))
      while (remaining.length > 0) {
        if (cancelled) return
        // Nearest to the current view each time: a following camera keeps moving.
        const centerColumn = viewCenter.current.x * NATIVE_TILE_COUNT - 0.5
        const centerRow = viewCenter.current.y * NATIVE_TILE_COUNT - 0.5
        let best = 0
        let bestDistance = Infinity
        for (let index = 0; index < remaining.length; index += 1) {
          const distance = Math.hypot(remaining[index].column - centerColumn, remaining[index].row - centerRow)
          if (distance < bestDistance) { bestDistance = distance; best = index }
        }
        const [tile] = remaining.splice(best, 1)
        await loadMapTile({
          key: tileKey(seedName, NATIVE_TILE_COUNT, tile.column, tile.row),
          seedName,
          background: true,
          resolution: TILE_RESOLUTION,
          bounds: {
            left: tile.column / NATIVE_TILE_COUNT,
            top: tile.row / NATIVE_TILE_COUNT,
            right: (tile.column + 1) / NATIVE_TILE_COUNT,
            bottom: (tile.row + 1) / NATIVE_TILE_COUNT,
          },
        })
        await new Promise((resolve) => window.setTimeout(resolve, 25))
      }
      if (!cancelled) await pruneMapTiles(VERSION_PREFIX, seedName)
    }
    void warmTileSet().catch((error: unknown) => console.error('[Seed biome map] Failed to prepare the native tile set', error))
    return () => { cancelled = true }
  }, [seedName])

  // Detail tiles follow the camera with a short debounce, but never wait longer
  // than DETAIL_MAX_WAIT_MS: a camera that follows the player never stops
  // moving, and without the ceiling it would sit on the soft base map forever.
  const lastDetailAt = useRef(0)
  useEffect(() => {
    const now = performance.now()
    const wait = Math.max(0, Math.min(DETAIL_DEBOUNCE_MS, lastDetailAt.current + DETAIL_MAX_WAIT_MS - now))
    const timer = window.setTimeout(() => {
      lastDetailAt.current = performance.now()
      setDetailView({ zoom, panX, panY, mapSize, viewportWidth, viewportHeight })
    }, wait)
    return () => window.clearTimeout(timer)
  }, [mapSize, panX, panY, viewportHeight, viewportWidth, zoom])

  const tiles = useMemo(() => {
    const { zoom: detailZoom, panX: detailPanX, panY: detailPanY, mapSize: detailMapSize, viewportWidth: detailWidth, viewportHeight: detailHeight } = detailView
    if (detailZoom < 4 || detailMapSize <= 1) return []
    const active = levelForView(detailZoom, detailMapSize)
    // The prefetched first level stays under the active one, so a pan or a level
    // change falls back to a slightly soft tile rather than the 1024px base map.
    const levels = active === NATIVE_TILE_COUNT ? [active] : [NATIVE_TILE_COUNT, active]
    const left = 0.5 + (-detailWidth / 2 - detailPanX) / (detailMapSize * detailZoom)
    const right = 0.5 + (detailWidth / 2 - detailPanX) / (detailMapSize * detailZoom)
    const top = 0.5 + (-detailHeight / 2 - detailPanY) / (detailMapSize * detailZoom)
    const bottom = 0.5 + (detailHeight / 2 - detailPanY) / (detailMapSize * detailZoom)
    return levels.flatMap((count) => {
      const overscan = count === active && detailZoom >= 8 ? TILE_OVERSCAN : 0
      const firstColumn = Math.max(0, Math.floor(left * count) - overscan)
      const lastColumn = Math.min(count - 1, Math.floor(right * count) + overscan)
      const firstRow = Math.max(0, Math.floor(top * count) - overscan)
      const lastRow = Math.min(count - 1, Math.floor(bottom * count) + overscan)
      const visible = []
      for (let row = firstRow; row <= lastRow; row += 1) {
        for (let column = firstColumn; column <= lastColumn; column += 1) {
          const onScreen = column / count < right && (column + 1) / count > left
            && row / count < bottom && (row + 1) / count > top
          const distance = Math.hypot(column + 0.5 - (left + right) * 0.5 * count,
            row + 0.5 - (top + bottom) * 0.5 * count)
          // Actual detail pixels first, then the coarse fallback, then overscan.
          const priority = (onScreen ? count === active ? 0 : 1_000 : 2_000) + distance
          visible.push({ column, row, count, priority })
        }
      }
      const centerColumn = (left + right) * 0.5 * count
      const centerRow = (top + bottom) * 0.5 * count
      return visible.sort((first, second) =>
        Math.hypot(first.column + 0.5 - centerColumn, first.row + 0.5 - centerRow) -
        Math.hypot(second.column + 0.5 - centerColumn, second.row + 0.5 - centerRow),
      ).slice(0, MAX_TILES_PER_LAYER)
    })
  }, [detailView])

  // Publish the camera priorities before child tile effects request work.
  useLayoutEffect(() => {
    setVisibleTiles(new Map(tiles.map((tile) => [tileKey(seedName, tile.count, tile.column, tile.row), tile.priority])))
  }, [seedName, tiles])
  useLayoutEffect(() => () => setVisibleTiles(new Map()), [])

  return <>
    <canvas ref={canvasRef} width={BASE_RESOLUTION} height={BASE_RESOLUTION} className="absolute inset-0 h-full w-full [image-rendering:auto]" aria-hidden="true" />
    {tiles.map((tile) => <SeedBiomeTile key={`${seedName}:${tile.count}:${tile.column}:${tile.row}`} seedName={seedName} {...tile} />)}
  </>
}

// Creature snapshots are periodic. None of those updates should
// reconcile the expensive tile tree unless the camera or seed actually moved.
export const SeedBiomeMap = memo(SeedBiomeMapComponent)
