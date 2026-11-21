import { Navigation2 } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { livePositionFeed } from '../lib/live-tracking/live-position-feed'
import { smoothedPlayerPosition } from '../lib/live-tracking/smoothed-position'
import type { PlayerPosition } from '../lib/live-tracking/tracking-installer'
import { markerBackgroundColor, markerScale, useMarkerSizes } from '../lib/map-marker-sizes'

const WORLD_DIAMETER = 21_000
/** Distance that only a portal or teleport explains; snap instead of gliding. */
const SNAP_DISTANCE = 100
/**
 * The mod samples at 20 Hz and ~14–20 reach us per second; a linear CSS
 * transition slightly longer than one sample gap glides the marker from one
 * sample to the next with no gaps and no visible stepping.
 */
const GLIDE_MS = 120
const HEADING_GLIDE_MS = 160
/** Older than this the sample is stale: dim the marker. */
const STALE_MS = 1_000
const STALE_CHECK_MS = 500

/**
 * Where the arrow points, degrees clockwise from north: the way the camera
 * looks (what the player sees on screen), falling back to the body facing
 * only when the mod did not report a camera.
 */
const headingOf = (sample: PlayerPosition, fallback: number): number =>
  sample.cameraHeading ?? sample.heading ?? fallback

/** Unwraps `to` next to `from` so a CSS rotate never spins the long way round. */
const continuousHeading = (from: number, to: number) => {
  const delta = ((((to - from) % 360) + 540) % 360) - 180
  return from + delta
}

/**
 * The player marker. `position` only seeds the first frame; afterwards the
 * marker listens to the raw position feed and moves itself through the DOM
 * on every sample, gliding between samples with CSS transitions. Nothing
 * here depends on requestAnimationFrame: Overwolf windows behind the game get
 * their animation frames throttled or paused, which froze the previous
 * frame-loop marker for seconds while samples were arriving fine.
 */
export function PlayerPositionMarker({ position, zoom }: { position: PlayerPosition; zoom: number }) {
  const markerSizes = useMarkerSizes()
  const sizeScale = markerScale('player', markerSizes)
  const markerRef = useRef<HTMLDivElement>(null)
  useEffect(() => { livePositionFeed.zoom = zoom }, [zoom])
  const arrowRef = useRef<HTMLDivElement>(null)
  const seed = livePositionFeed.latest ?? position
  const state = useRef({ x: seed.x, z: seed.z, heading: headingOf(seed, 0), updatedAt: seed.updatedAt })

  // Position and heading live only in the DOM (never in JSX) so a React
  // re-render can never snap the marker back to a stale prop.
  const zoomRef = useRef(zoom)
  /**
   * Moves the marker with a compositor-only transform (no layout, no paint of
   * the huge scaled map layer underneath): position in map pixels at zoom 1,
   * counter-scaled so it stays screen-sized. `left`/`top` stay at 0.
   */
  // The map's exact width. `offsetWidth` rounds to whole pixels, and at 32×
  // zoom half a map pixel is 16 screen pixels: the marker drifted off the
  // ground it should stand on in the small mini-map. Layers place themselves
  // with percentages, so this has to be as exact.
  const mapPxRef = useRef(0)
  const place = useCallback((x: number, z: number, glide: boolean) => {
    const marker = markerRef.current
    if (!marker) return
    const mapPx = mapPxRef.current || marker.parentElement?.offsetWidth || 0
    const px = (x / WORLD_DIAMETER + 0.5) * mapPx
    const py = (0.5 - z / WORLD_DIAMETER) * mapPx
    marker.style.transition = glide ? `transform ${GLIDE_MS}ms linear, opacity 200ms` : 'none'
    marker.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -50%) scale(${1 / zoomRef.current})`
  }, [])

  useLayoutEffect(() => {
    const parent = markerRef.current?.parentElement
    if (!parent) return
    mapPxRef.current = parent.getBoundingClientRect().width / (zoomRef.current || 1)
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width) { mapPxRef.current = width; place(state.current.x, state.current.z, false) }
    })
    observer.observe(parent)
    return () => observer.disconnect()
  }, [place])

  useLayoutEffect(() => {
    zoomRef.current = zoom
    place(state.current.x, state.current.z, false)
  }, [place, zoom])

  useLayoutEffect(() => {
    const arrow = arrowRef.current
    if (arrow) arrow.style.transform = `rotate(${state.current.heading}deg)`
    smoothedPlayerPosition.x = state.current.x
    smoothedPlayerPosition.z = state.current.z
    smoothedPlayerPosition.heading = state.current.heading
    smoothedPlayerPosition.valid = true
    return () => { smoothedPlayerPosition.valid = false }
  }, [])

  useEffect(() => {
    const apply = (sample: PlayerPosition) => {
      const marker = markerRef.current
      const arrow = arrowRef.current
      const current = state.current
      const jumped = Math.hypot(sample.x - current.x, sample.z - current.z) > SNAP_DISTANCE
      const heading = continuousHeading(current.heading, headingOf(sample, current.heading))
      state.current = { x: sample.x, z: sample.z, heading, updatedAt: sample.updatedAt }
      smoothedPlayerPosition.x = sample.x
      smoothedPlayerPosition.z = sample.z
      smoothedPlayerPosition.heading = heading
      smoothedPlayerPosition.valid = true
      place(sample.x, sample.z, !jumped)
      if (marker) marker.style.opacity = '1'
      if (arrow) {
        arrow.style.transition = jumped ? 'none' : `transform ${HEADING_GLIDE_MS}ms linear`
        arrow.style.transform = `rotate(${heading}deg)`
      }
      livePositionFeed.recordMarkerWrite()
    }
    const unsubscribe = livePositionFeed.subscribe((sample) => { if (sample) apply(sample) })
    // Dim when the game stops reporting; timers keep running where frames don't.
    const staleTimer = window.setInterval(() => {
      const marker = markerRef.current
      if (!marker) return
      const age = Date.now() - state.current.updatedAt
      marker.style.opacity = age > 10_000 ? '0.35' : age > STALE_MS ? '0.7' : '1'
      const rect = marker.getBoundingClientRect()
      livePositionFeed.recordScreenPosition(rect.left + rect.width / 2, rect.top + rect.height / 2, performance.now())
      const parent = marker.parentElement
      if (parent) livePositionFeed.mapSize = Math.round(parent.getBoundingClientRect().width)
    }, STALE_CHECK_MS)
    return () => { unsubscribe(); window.clearInterval(staleTimer) }
  }, [place])

  return <div ref={markerRef} data-player-marker className="pointer-events-none absolute left-0 top-0 z-[90] grid place-items-center rounded-full border border-white bg-[var(--accent)] text-[var(--accent-contrast)] shadow-[0_2px_12px_rgba(0,0,0,0.7)] will-change-transform" style={{ width: 24 * sizeScale, height: 24 * sizeScale, backgroundColor: markerBackgroundColor('player', markerSizes) }}><div ref={arrowRef} className="grid place-items-center will-change-transform"><Navigation2 size={13 * sizeScale} fill="currentColor" /></div><span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" /></div>
}
