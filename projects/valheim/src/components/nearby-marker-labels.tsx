import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { livePositionFeed } from '../lib/live-tracking/live-position-feed'

/** A marker the mini-map may label: map fractions plus its world position. */
export interface NearbyLabelCandidate {
  id: string
  /** Map fraction 0..1. */
  x: number
  y: number
  worldX: number
  worldZ: number
  name: string
  sizeScale: number
}

interface NearbyMarkerLabelsProps {
  candidates: readonly NearbyLabelCandidate[]
  zoom: number
  mapSize: number
  panX: number
  panY: number
  viewportWidth: number
  viewportHeight: number
}

/** Markers within this many metres of the player carry their name. */
const LABEL_RADIUS_M = 150
/** Labels on a 360×325 mini-map; larger windows get proportionally more. */
const BASE_LABEL_COUNT = 8
const BASE_VIEWPORT_AREA = 360 * 325
/** Refresh cadence for the player's position; labels do not need 20 Hz. */
const POSITION_REFRESH_MS = 250
/** Marker badge radius (size-8) plus the tooltip's gap. */
const CLEARANCE_PX = 26
const LABEL_HEIGHT_PX = 30
const LABEL_PAD_PX = 22
const CARET_PX = 8
const GAP_PX = 4

type Side = 'top' | 'bottom' | 'right' | 'left'
const SIDES: Side[] = ['top', 'bottom', 'right', 'left']

interface Box { left: number; top: number; width: number; height: number }

const overlaps = (a: Box, b: Box) =>
  a.left < b.left + b.width + GAP_PX && a.left + a.width + GAP_PX > b.left &&
  a.top < b.top + b.height + GAP_PX && a.top + a.height + GAP_PX > b.top

/** Label box relative to the marker centre, in screen px, for a side. */
const boxFor = (side: Side, width: number, clearance = CLEARANCE_PX): Box => {
  const h = LABEL_HEIGHT_PX
  const c = clearance
  switch (side) {
    case 'top': return { left: -width / 2, top: -c - h, width, height: h }
    case 'bottom': return { left: -width / 2, top: c, width, height: h }
    case 'right': return { left: c, top: -h / 2, width, height: h }
    default: return { left: -c - width, top: -h / 2, width, height: h }
  }
}

interface Placed extends NearbyLabelCandidate { side: Side; width: number; clearance: number }

/** The player's position, refreshed a few times a second from the live feed. */
function usePlayerPosition() {
  const [position, setPosition] = useState(() => livePositionFeed.latest)
  useEffect(() => {
    let last = 0
    let timer = 0
    const unsubscribe = livePositionFeed.subscribe((sample) => {
      const now = performance.now()
      if (now - last >= POSITION_REFRESH_MS) {
        last = now
        setPosition(sample)
      } else if (!timer) {
        timer = window.setTimeout(() => {
          timer = 0
          last = performance.now()
          setPosition(livePositionFeed.latest)
        }, POSITION_REFRESH_MS)
      }
    })
    return () => { unsubscribe(); if (timer) window.clearTimeout(timer) }
  }, [])
  return position
}

/**
 * The mini-map's "what is around me": every marker within LABEL_RADIUS_M of
 * the player carries its name, in the hover card's own look with a caret
 * pointing at its marker. Nearest first, each label takes the first side
 * (above, below, right, left) that clears every marker badge and every label
 * already placed; a marker with no free side waits until one opens up.
 */
export function NearbyMarkerLabels({ candidates, zoom, mapSize, panX, panY, viewportWidth, viewportHeight }: NearbyMarkerLabelsProps) {
  const player = usePlayerPosition()
  const placed = useMemo<Placed[]>(() => {
    if (!player || mapSize <= 1) return []
    const context = document.createElement('canvas').getContext('2d')
    if (context) context.font = `700 11px ${getComputedStyle(document.documentElement).fontFamily}`
    const limit = Math.max(BASE_LABEL_COUNT, Math.round(BASE_LABEL_COUNT * (viewportWidth * viewportHeight) / BASE_VIEWPORT_AREA))
    const scale = mapSize * zoom
    const toScreen = (x: number, y: number) => ({
      sx: viewportWidth / 2 + panX + (x - 0.5) * scale,
      sy: viewportHeight / 2 + panY + (y - 0.5) * scale,
    })
    const nearby = candidates
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.worldX - player.x, candidate.worldZ - player.z) }))
      .filter((entry) => entry.distance <= LABEL_RADIUS_M)
      .sort((a, b) => a.distance - b.distance)
    // Every marker badge on screen blocks labels, labelled or not.
    const badges = candidates.map((candidate) => {
      const { sx, sy } = toScreen(candidate.x, candidate.y)
      const half = 16 * candidate.sizeScale
      return { id: candidate.id, box: { left: sx - half, top: sy - half, width: half * 2, height: half * 2 } }
    })
    const taken: Box[] = []
    const result: Placed[] = []
    for (const { candidate } of nearby) {
      if (result.length >= limit) break
      const { sx, sy } = toScreen(candidate.x, candidate.y)
      const width = Math.ceil((context?.measureText(candidate.name).width ?? candidate.name.length * 6.3) + LABEL_PAD_PX)
      const clearance = Math.max(CLEARANCE_PX, 16 * candidate.sizeScale + 10)
      for (const side of SIDES) {
        const local = boxFor(side, width, clearance)
        const box = { ...local, left: local.left + sx, top: local.top + sy }
        const hitsBadge = badges.some((badge) => badge.id !== candidate.id && overlaps(box, badge.box))
        if (hitsBadge || taken.some((other) => overlaps(box, other))) continue
        taken.push(box)
        result.push({ ...candidate, side, width, clearance })
        break
      }
    }
    return result
  }, [candidates, mapSize, panX, panY, player, viewportHeight, viewportWidth, zoom])

  if (placed.length === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden="true">
      {placed.map((label) => {
        const box = boxFor(label.side, label.width, label.clearance)
        return (
          <div
            key={`nearby:${label.id}`}
            className="absolute animate-[fade-in_160ms_ease-out]"
            style={{ left: `${label.x * 100}%`, top: `${label.y * 100}%`, transform: `scale(${1 / zoom})`, transformOrigin: '0 0' }}
          >
            <span
              className="absolute z-30 flex items-center whitespace-nowrap rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 text-[11px] font-bold leading-tight text-[var(--text)] shadow-2xl"
              style={{ left: box.left, top: box.top, height: LABEL_HEIGHT_PX, width: label.width }}
            >
              {label.name}
              <Caret side={label.side} />
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** The little triangle on the label's marker-facing edge, pointing at the marker. */
function Caret({ side }: { side: Side }) {
  const half = CARET_PX / 2
  const base = 'absolute size-2 rotate-45 border-[var(--border-strong)] bg-[var(--surface)]'
  const styles: Record<Side, { className: string; style: CSSProperties }> = {
    top: { className: `${base} border-b border-r`, style: { left: `calc(50% - ${half}px)`, bottom: -half } },
    bottom: { className: `${base} border-l border-t`, style: { left: `calc(50% - ${half}px)`, top: -half } },
    right: { className: `${base} border-b border-l`, style: { top: `calc(50% - ${half}px)`, left: -half } },
    left: { className: `${base} border-r border-t`, style: { top: `calc(50% - ${half}px)`, right: -half } },
  }
  return <span className={styles[side].className} style={styles[side].style} />
}
