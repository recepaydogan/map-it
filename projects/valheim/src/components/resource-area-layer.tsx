import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { MAP_SIZE_PX } from './interactive-map-viewport'
import { MapMarkerTooltip } from './map-marker-tooltip'

const WORLD_DIAMETER = 21_000
const INNER_RADIUS = 2.4
const OUTER_RADIUS = 3.1
const DRAW_BATCH = 2_000
const HOVER_CELL_SIZE = 8

export interface ResourceAreaMaterial {
  key: string
  label: string
  color: string
  points: readonly { x: number; z: number }[]
}

function ResourceCoverageCanvas({ material, opacity, zoom }: { material: ResourceAreaMaterial; opacity: number; zoom: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    canvas.width = canvas.height = MAP_SIZE_PX
    const inner = document.createElement('canvas')
    const outer = document.createElement('canvas')
    inner.width = inner.height = outer.width = outer.height = MAP_SIZE_PX
    const innerContext = inner.getContext('2d')
    const outerContext = outer.getContext('2d')
    if (!innerContext || !outerContext) return

    innerContext.fillStyle = '#fff'
    outerContext.fillStyle = '#fff'
    let cursor = 0
    let frame = 0
    const drawBatch = () => {
      const end = Math.min(cursor + DRAW_BATCH, material.points.length)
      innerContext.beginPath()
      outerContext.beginPath()
      for (; cursor < end; cursor += 1) {
        const point = material.points[cursor]
        if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) continue
        const x = (point.x / WORLD_DIAMETER + 0.5) * MAP_SIZE_PX
        const y = (0.5 - point.z / WORLD_DIAMETER) * MAP_SIZE_PX
        if (x < -OUTER_RADIUS || x > MAP_SIZE_PX + OUTER_RADIUS || y < -OUTER_RADIUS || y > MAP_SIZE_PX + OUTER_RADIUS) continue
        innerContext.moveTo(x + INNER_RADIUS, y)
        innerContext.arc(x, y, INNER_RADIUS, 0, Math.PI * 2)
        outerContext.moveTo(x + OUTER_RADIUS, y)
        outerContext.arc(x, y, OUTER_RADIUS, 0, Math.PI * 2)
      }
      innerContext.fill()
      outerContext.fill()
      if (cursor < material.points.length) {
        frame = window.requestAnimationFrame(drawBatch)
        return
      }

      // Cut the inner union from the outer union so dense areas have one boundary,
      // rather than a separate ring around every resource node.
      outerContext.globalCompositeOperation = 'destination-out'
      outerContext.drawImage(inner, 0, 0)
      outerContext.globalCompositeOperation = 'source-in'
      outerContext.fillStyle = material.color
      outerContext.fillRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX)

      innerContext.globalCompositeOperation = 'source-in'
      innerContext.fillStyle = material.color
      innerContext.globalAlpha = 0.28
      innerContext.fillRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX)
      innerContext.globalAlpha = 1
      innerContext.globalCompositeOperation = 'source-atop'
      innerContext.strokeStyle = 'rgba(255, 255, 255, 0.4)'
      innerContext.lineWidth = 0.8
      innerContext.beginPath()
      for (let x = -MAP_SIZE_PX; x < MAP_SIZE_PX; x += 7) {
        innerContext.moveTo(x, 0)
        innerContext.lineTo(x + MAP_SIZE_PX, MAP_SIZE_PX)
      }
      innerContext.stroke()

      context.clearRect(0, 0, MAP_SIZE_PX, MAP_SIZE_PX)
      context.drawImage(inner, 0, 0)
      context.drawImage(outer, 0, 0)
      inner.width = inner.height = outer.width = outer.height = 0
    }
    drawBatch()
    return () => window.cancelAnimationFrame(frame)
  }, [material.color, material.points])

  return (
    <canvas
      ref={canvasRef}
      width={MAP_SIZE_PX}
      height={MAP_SIZE_PX}
      className="pointer-events-none absolute inset-0 h-full w-full rounded-full transition-opacity duration-150"
      style={{ opacity, filter: zoom < 2 ? `drop-shadow(0 0 ${Math.min(8, 2 / zoom)}px ${material.color})` : undefined }}
      aria-hidden="true"
    />
  )
}

/** Resource coverage remains fixed to world coordinates while pan and zoom transform the map. */
export function ResourceAreaLayer({ materials, highlightedKey, zoom }: {
  materials: readonly ResourceAreaMaterial[]
  highlightedKey: string | null
  zoom: number
}) {
  const [hovered, setHovered] = useState<{ x: number; y: number; names: string } | null>(null)
  const hoverCells = useMemo(() => {
    const cells = new Map<number, Array<{ x: number; y: number; label: string }>>()
    for (const material of materials) for (const point of material.points) {
      const x = (point.x / WORLD_DIAMETER + 0.5) * MAP_SIZE_PX
      const y = (0.5 - point.z / WORLD_DIAMETER) * MAP_SIZE_PX
      if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > MAP_SIZE_PX || y < 0 || y > MAP_SIZE_PX) continue
      const key = Math.floor(y / HOVER_CELL_SIZE) * 128 + Math.floor(x / HOVER_CELL_SIZE)
      const cell = cells.get(key) ?? []
      cell.push({ x, y, label: material.label })
      cells.set(key, cell)
    }
    return cells
  }, [materials])

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - bounds.left) * MAP_SIZE_PX / bounds.width
    const y = (event.clientY - bounds.top) * MAP_SIZE_PX / bounds.height
    const cellX = Math.floor(x / HOVER_CELL_SIZE)
    const cellY = Math.floor(y / HOVER_CELL_SIZE)
    const names = new Set<string>()
    let nearest: { x: number; y: number } | null = null
    let nearestDistance = 4.5 ** 2
    for (let offsetY = -1; offsetY <= 1; offsetY += 1) for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (const point of hoverCells.get((cellY + offsetY) * 128 + cellX + offsetX) ?? []) {
        const distance = (point.x - x) ** 2 + (point.y - y) ** 2
        if (distance > 4.5 ** 2) continue
        names.add(point.label)
        if (distance < nearestDistance) { nearest = point; nearestDistance = distance }
      }
    }
    const next = nearest ? { x: nearest.x, y: nearest.y, names: [...names].join(', ') } : null
    if (hovered?.x !== next?.x || hovered?.y !== next?.y || hovered?.names !== next?.names) setHovered(next)
  }

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-full">
      {materials.map((material) => (
        <ResourceCoverageCanvas
          key={material.key}
          material={material}
          opacity={highlightedKey ? material.key === highlightedKey ? 1 : 0.08 : 1}
          zoom={zoom}
        />
      ))}
      <div className="pointer-events-auto absolute inset-0" onPointerMove={onPointerMove} onPointerLeave={() => { if (hovered) setHovered(null) }} aria-hidden="true" />
      {hovered ? (
        <span className="pointer-events-none absolute z-20 size-0" style={{ left: hovered.x, top: hovered.y, transform: `scale(${1 / zoom})` }}>
          <MapMarkerTooltip label={hovered.names} visible />
        </span>
      ) : null}
    </div>
  )
}
