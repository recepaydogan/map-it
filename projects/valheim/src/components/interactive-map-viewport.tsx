import { Minus, Plus, RotateCcw } from 'lucide-react'
import {
  useCallback,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
  useRef,
  useState,
  startTransition,
} from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { readMapCamera, writeMapCamera } from '../lib/map-camera-persistence'
import { MapControlTooltip } from './map-marker-tooltip'

interface InteractiveMapViewportProps {
  children: ReactNode | ((view: ViewRenderState) => ReactNode)
  className?: string
  /**
   * Identifies the camera while the app stays open. The main map also uses it
   * for persistence when persistCamera is enabled.
   */
  cameraKey?: string
  persistCamera?: boolean
  initialZoom?: number
  /** Fired when the user pans or zooms by hand (used to stop camera follow). */
  onUserInteraction?: () => void
  /** Optional initial-view guide; does not change existing follow behavior. */
  onManualCameraChange?: () => void
  onMapClickCapture?: (event: ReactMouseEvent<HTMLDivElement>) => void
  /** Reports the focus function and current zoom to a parent that keeps them in refs. */
  onViewportChange?: (focusPoint: (x: number, y: number, zoom: number) => void, zoom: number) => void
  /** Extra buttons stacked above the zoom controls in the same corner. */
  extraControls?: ReactNode
  /** Full desktop controls, compact overlay +/- controls, or no zoom buttons. */
  zoomControls?: 'full' | 'compact' | 'hidden'
}

/** Camera positions retained while a surface is temporarily unmounted. */
const cameraBySurface = new Map<string, ViewState>()

export interface ViewState {
  zoom: number
  panX: number
  panY: number
}

interface ViewRenderState extends ViewState {
  mapSize: number
  viewportHeight: number
  viewportWidth: number
  focusPoint: (x: number, y: number, zoom: number) => void
  /** ER-style marker travel: keeps zoom, glides, and lands beside the detail panel. */
  focusMarker: (x: number, y: number, offsetX?: number, offsetY?: number) => void
  /** Re-centres on a normalized map point without changing zoom. */
  centerOn: (x: number, y: number) => void
}

const DEFAULT_ZOOM = 0.85
/** How often a followed camera's pan is committed to React state. */
const PAN_COMMIT_MS = 100
/** Pointer travel before a press on a marker or control counts as a drag instead of a click. */
const DRAG_THRESHOLD_PX = 4
export const MAX_ZOOM = 48
/**
 * The map's rendered diameter at zoom 1, in CSS px, the same on every surface.
 * The window never scales the map — it only decides how much of it is in view —
 * so a given zoom means the same metres per pixel on the desktop and on the
 * in-game mini-map, and resizing a window leaves every marker on the same ground.
 */
export const MAP_SIZE_PX = 776
/** Pass as the requested zoom to mean "as close as the map allows". */
export const CLOSEST_ZOOM = MAX_ZOOM
const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(0.25, zoom))

/**
 * Follow updates must land on physical pixels. Leaving the whole map stage at a
 * fractional translation makes Chromium continuously resample counter-scaled
 * marker badges and the structure SVG, which is especially visible in the
 * Overwolf overlay as intermittent blur.
 */
const snapToPhysicalPixel = (value: number) => {
  const scale = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  return Math.round(value * scale) / scale
}

type Pan = { panX: number; panY: number }

interface FocusOptions {
  animate?: boolean
  /** Desired marker position relative to the horizontal viewport centre, in px. */
  offsetX?: number
  offsetY?: number
  /** Used to match ER's shorter nearby pan and slightly longer distant travel. */
  viewportWidth?: number
}

/** Fast departure and soft arrival, close to ER's marker-camera timing. */
const easeOutCubic = (progress: number) => 1 - (1 - progress) ** 3

/**
 * Camera follow calls centerOn every animation frame. Committing each call to
 * React state re-rendered every map layer at 60 fps, so the follow-pan is
 * written straight to the stage transform and React is told a few times a
 * second (layers only need pan for viewport culling). The controller also
 * parks a focus requested before the viewport is measured (the map mounts and
 * a planner "Go" fires in the same tick) and applies it once it can.
 */
function createCameraController(initialView: ViewState) {
  let stage: HTMLDivElement | null = null
  let pendingPan: Pan | null = null
  let pendingZoom: number | null = null
  let pendingFocus: { x: number; y: number; zoom: number; options?: FocusOptions } | null = null
  let timer = 0
  let frame = 0
  let dragFrame = 0
  let focusFrame = 0
  let commit: (update: ViewState | ((current: ViewState) => ViewState)) => void = () => {}
  let zoom = initialView.zoom
  let mapSize = 1
  let commitVersion = 0
  /** The pan React last committed; the base for drag deltas. */
  let committedPan: Pan = { panX: initialView.panX, panY: initialView.panY }
  const controller = {
    snapshot(): ViewState {
      const pan = pendingPan ?? committedPan
      return { zoom: pendingZoom ?? zoom, panX: pan.panX, panY: pan.panY }
    },
    setCommit(next: typeof commit) { commit = next },
    setView(next: ViewState) {
      commitVersion += 1
      if (timer) { window.clearTimeout(timer); timer = 0 }
      if (frame) { window.cancelAnimationFrame(frame); frame = 0 }
      if (dragFrame) { window.cancelAnimationFrame(dragFrame); dragFrame = 0 }
      if (focusFrame) { window.cancelAnimationFrame(focusFrame); focusFrame = 0 }
      pendingPan = null
      pendingZoom = null
      committedPan = { panX: next.panX, panY: next.panY }
      zoom = next.zoom
      if (stage) {
        stage.style.transition = ''
        stage.style.transform = `translate(${next.panX}px, ${next.panY}px) scale(${next.zoom})`
      }
      commit(next)
    },
    zoomAtCenter(factor: number) {
      controller.flush()
      controller.setView({ ...committedPan, zoom: clampZoom(zoom * factor) })
    },
    /** Drag panning moves only the stage; the layers catch up on release. */
    /**
     * Wheel zoom about the cursor. Several wheel events can land in one frame;
     * the transform follows each one, React is told once per frame (zoom does
     * need a render: markers counter-scale with it).
     */
    zoomAround(cursorX: number, cursorY: number, factor: number) {
      const base = pendingPan ?? committedPan
      const fromZoom = pendingZoom ?? zoom
      const toZoom = clampZoom(fromZoom * factor)
      const ratio = toZoom / fromZoom
      const pan = { panX: cursorX - (cursorX - base.panX) * ratio, panY: cursorY - (cursorY - base.panY) * ratio }
      pendingPan = pan
      pendingZoom = toZoom
      if (stage) {
        stage.style.transition = ''
        stage.style.transform = `translate(${pan.panX}px, ${pan.panY}px) scale(${toZoom})`
      }
      if (!frame) frame = window.requestAnimationFrame(() => { frame = 0; controller.commitPan() })
    },
    panBy(deltaX: number, deltaY: number) {
      const base = pendingPan ?? committedPan
      const pan = { panX: base.panX + deltaX, panY: base.panY + deltaY }
      pendingPan = pan
      // Pointer events may arrive several times per display frame. Paint the
      // latest position once per frame while keeping every pointer delta.
      if (!dragFrame) dragFrame = window.requestAnimationFrame(() => {
        dragFrame = 0
        const current = pendingPan ?? committedPan
        if (stage) {
          stage.style.transition = ''
          stage.style.transform = `translate(${snapToPhysicalPixel(current.panX)}px, ${snapToPhysicalPixel(current.panY)}px) scale(${pendingZoom ?? zoom})`
        }
      })
    },
    setMapSize(next: number) {
      mapSize = next
      if (mapSize > 1) controller.applyPendingFocus()
    },
    setStage(element: HTMLDivElement | null) {
      stage = element
      if (stage) {
        const pan = pendingPan ?? committedPan
        stage.style.transform = `translate(${pan.panX}px, ${pan.panY}px) scale(${pendingZoom ?? zoom})`
      }
    },
    /** Sends the last follow-pan to React (before user-driven view changes). */
    flush() {
      if (timer) { window.clearTimeout(timer); timer = 0 }
      if (frame) { window.cancelAnimationFrame(frame); frame = 0 }
      if (dragFrame) { window.cancelAnimationFrame(dragFrame); dragFrame = 0 }
      if (focusFrame) { window.cancelAnimationFrame(focusFrame); focusFrame = 0 }
      // User input takes over: stop gliding so drags feel direct.
      if (stage) {
        stage.style.transition = ''
        const pan = pendingPan ?? committedPan
        stage.style.transform = `translate(${snapToPhysicalPixel(pan.panX)}px, ${snapToPhysicalPixel(pan.panY)}px) scale(${pendingZoom ?? zoom})`
      }
      controller.commitPan(false, true)
    },
    /** Tells React the current follow-pan without interrupting the glide. */
    commitPan(deferred = false, force = false) {
      const pan = pendingPan ?? (force ? committedPan : null)
      const nextZoom = pendingZoom
      if (!pan && nextZoom === null) return
      pendingPan = null
      pendingZoom = null
      // The stage already has the latest camera position. React only updates
      // culling and detail layers, so drag commits can yield to pointer input.
      if (pan) committedPan = pan
      if (nextZoom !== null) zoom = nextZoom
      const version = ++commitVersion
      const update = () => commit((current) => {
        if (version !== commitVersion) return current
        const next = { zoom: nextZoom ?? current.zoom, panX: pan?.panX ?? current.panX, panY: pan?.panY ?? current.panY }
        return next.zoom === current.zoom && next.panX === current.panX && next.panY === current.panY ? current : next
      })
      if (deferred) startTransition(update)
      else update()
    },
    centerOn(x: number, y: number) {
      if (mapSize <= 1) return
      const pan = {
        panX: snapToPhysicalPixel(-(x - 0.5) * mapSize * zoom),
        panY: snapToPhysicalPixel(-(y - 0.5) * mapSize * zoom),
      }
      pendingPan = pan
      if (stage) {
        // Do not CSS-transition the entire stage while following. Position
        // samples arrive before the previous transition could finish, leaving
        // markers and structure vectors permanently rasterized mid-animation.
        stage.style.transition = 'none'
        stage.style.transform = `translate(${pan.panX}px, ${pan.panY}px) scale(${zoom})`
      }
      if (!timer) timer = window.setTimeout(() => { timer = 0; controller.commitPan() }, PAN_COMMIT_MS)
    },
    focus(x: number, y: number, requestedZoom: number, options?: FocusOptions) {
      if (mapSize <= 1) { pendingFocus = { x, y, zoom: requestedZoom, options }; return }
      // Clamped here, once the map is measured: the ceiling depends on its size.
      const targetZoom = clampZoom(requestedZoom)
      const targetPan = {
        panX: snapToPhysicalPixel((options?.offsetX ?? 0) - (x - 0.5) * mapSize * targetZoom),
        panY: snapToPhysicalPixel((options?.offsetY ?? 0) - (y - 0.5) * mapSize * targetZoom),
      }
      // A new marker selection takes over the current camera position. Drop
      // queued culling work from the previous movement before starting it.
      const fromPan = pendingPan ?? committedPan
      commitVersion += 1
      if (timer) { window.clearTimeout(timer); timer = 0 }
      if (frame) { window.cancelAnimationFrame(frame); frame = 0 }
      if (dragFrame) { window.cancelAnimationFrame(dragFrame); dragFrame = 0 }
      if (focusFrame) { window.cancelAnimationFrame(focusFrame); focusFrame = 0 }
      const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
      if (stage && options?.animate && !reducedMotion) {
        const travel = Math.hypot(targetPan.panX - fromPan.panX, targetPan.panY - fromPan.panY)
        const duration = travel <= (options.viewportWidth ?? Infinity) ? 400 : 600
        const startedAt = performance.now()
        stage.style.transition = 'none'
        pendingZoom = targetZoom
        const animate = (now: number) => {
          const progress = Math.min(1, (now - startedAt) / duration)
          const eased = easeOutCubic(progress)
          const pan = {
            panX: snapToPhysicalPixel(fromPan.panX + (targetPan.panX - fromPan.panX) * eased),
            panY: snapToPhysicalPixel(fromPan.panY + (targetPan.panY - fromPan.panY) * eased),
          }
          pendingPan = pan
          if (stage) stage.style.transform = `translate(${pan.panX}px, ${pan.panY}px) scale(${targetZoom})`
          // Keep viewport culling and detail tiles near the moving camera without
          // re-rendering every map layer on every animation frame.
          if (!timer && progress < 1) {
            timer = window.setTimeout(() => { timer = 0; controller.commitPan(true) }, PAN_COMMIT_MS)
          }
          if (progress < 1) {
            focusFrame = window.requestAnimationFrame(animate)
            return
          }
          focusFrame = 0
          if (timer) { window.clearTimeout(timer); timer = 0 }
          pendingPan = targetPan
          pendingZoom = targetZoom
          controller.commitPan()
        }
        focusFrame = window.requestAnimationFrame(animate)
        return
      }
      pendingPan = null
      pendingZoom = null
      if (stage) {
        stage.style.transition = ''
        stage.style.transform = `translate(${targetPan.panX}px, ${targetPan.panY}px) scale(${targetZoom})`
      }
      committedPan = targetPan
      zoom = targetZoom
      commit({ zoom: targetZoom, ...targetPan })
    },
    applyPendingFocus() {
      const focus = pendingFocus
      if (!focus) return
      pendingFocus = null
      controller.focus(focus.x, focus.y, focus.zoom, focus.options)
    },
    dispose() {
      if (timer) window.clearTimeout(timer)
      if (frame) window.cancelAnimationFrame(frame)
      if (dragFrame) window.cancelAnimationFrame(dragFrame)
      if (focusFrame) window.cancelAnimationFrame(focusFrame)
      timer = 0; frame = 0; dragFrame = 0; focusFrame = 0; pendingPan = null; pendingZoom = null; pendingFocus = null
    },
  }
  return controller
}

export function InteractiveMapViewport({
  children,
  className,
  cameraKey,
  persistCamera = false,
  initialZoom = DEFAULT_ZOOM,
  onUserInteraction,
  onManualCameraChange,
  onMapClickCapture,
  onViewportChange,
  extraControls,
  zoomControls = 'full',
}: InteractiveMapViewportProps) {
  const { t } = useTranslation()
  const [view, setView] = useState<ViewState>(
    () => (cameraKey ? cameraBySurface.get(cameraKey) ?? (persistCamera ? readMapCamera(cameraKey) : null) : null)
      ?? { zoom: clampZoom(initialZoom), panX: 0, panY: 0 },
  )

  useEffect(() => {
    if (cameraKey) cameraBySurface.set(cameraKey, view)
    if (!cameraKey || !persistCamera) return
    const timer = window.setTimeout(() => writeMapCamera(cameraKey, view), 500)
    return () => window.clearTimeout(timer)
  }, [cameraKey, persistCamera, view])
  const [mapSize, setMapSize] = useState(1)
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 })
  const [controlsIntroVisible, setControlsIntroVisible] = useState(true)
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<null | {
    pointerId: number
    x: number
    y: number
    /** Started on a marker or control: pointer capture waits until it is clearly a drag. */
    onControl: boolean
    moved: boolean
  }>(null)
  /** Set when a drag ended on a control so its click does not fire as well. */
  const suppressClick = useRef(false)

  // Teach the controls on every map open, then let the map itself reveal them.
  useEffect(() => {
    const timer = window.setTimeout(() => setControlsIntroVisible(false), 10_000)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const updateSize = () => {
      const bounds = element.getBoundingClientRect()
      setViewportSize({ width: bounds.width, height: bounds.height })
      // Measured, not derived from the window: the map is MAP_SIZE_PX everywhere.
      setMapSize(bounds.width > 0 && bounds.height > 0 ? MAP_SIZE_PX : 1)
    }
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Imperative camera helper (see `createCameraController`): it owns the
  // stage element, the follow-pan that bypasses React, and a focus that was
  // asked for before the viewport was measured.
  const [camera] = useState(() => createCameraController(view))
  useEffect(() => { camera.setCommit(setView) }, [camera])
  // A measured viewport can also honour a focus that arrived while it was 1px.
  useEffect(() => { camera.setMapSize(mapSize) }, [camera, mapSize])
  useEffect(() => {
    const saveLatest = () => {
      if (!cameraKey) return
      const latest = camera.snapshot()
      cameraBySurface.set(cameraKey, latest)
      if (persistCamera) writeMapCamera(cameraKey, latest)
    }
    window.addEventListener('pagehide', saveLatest)
    return () => {
      window.removeEventListener('pagehide', saveLatest)
      saveLatest()
      camera.dispose()
    }
  }, [camera, cameraKey, persistCamera])

  const focusPoint = useCallback((x: number, y: number, requestedZoom: number) => {
    camera.focus(x, y, requestedZoom)
  }, [camera])
  const focusMarker = useCallback((x: number, y: number, offsetX: number = 0, offsetY: number = 0) => {
    camera.focus(x, y, view.zoom, {
      animate: true,
      offsetX,
      offsetY,
      viewportWidth: viewportSize.width,
    })
  }, [camera, view.zoom, viewportSize.width])
  const centerOn = useCallback((x: number, y: number) => camera.centerOn(x, y), [camera])
  const flushPendingPan = useCallback(() => camera.flush(), [camera])
  useEffect(() => { onViewportChange?.(focusPoint, view.zoom) }, [focusPoint, onViewportChange, view.zoom])
  const stageRef = useCallback((element: HTMLDivElement | null) => camera.setStage(element), [camera])

  const zoomAtCenter = (factor: number) => {
    onManualCameraChange?.()
    camera.zoomAtCenter(factor)
  }
  const reset = () => { onManualCameraChange?.(); camera.setView({ zoom: DEFAULT_ZOOM, panX: 0, panY: 0 }) }
  // React attaches `onWheel` as a passive listener, so preventDefault there is
  // a no-op (and logs a warning). Block page scroll with a native non-passive one.
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    // A scrollable list inside a map card (chest group, search results) keeps
    // its own wheel: the event scrolls the list, not the map.
    const block = (event: WheelEvent) => {
      if ((event.target as Element | null)?.closest?.('[data-map-scroll]')) return
      event.preventDefault()
    }
    element.addEventListener('wheel', block, { passive: false })
    return () => element.removeEventListener('wheel', block)
  }, [])
  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    onManualCameraChange?.()
    onUserInteraction?.()
    const bounds = event.currentTarget.getBoundingClientRect()
    const cursorX = event.clientX - bounds.left - bounds.width / 2
    const cursorY = event.clientY - bounds.top - bounds.height / 2
    const factor = event.deltaY < 0 ? 1.25 : 0.8
    camera.zoomAround(cursorX, cursorY, factor)
  }
  // A drag may start anywhere, markers and controls included: the pointer is
  // captured at once on bare map, but only once it has clearly moved when it
  // went down on a button, so a plain click still reaches that button.
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return
    const onControl = Boolean((event.target as HTMLElement).closest('button'))
    flushPendingPan()
    if (!onControl) event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      onControl,
      moved: false,
    }
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (!active || active.pointerId !== event.pointerId) return
    const deltaX = event.clientX - active.x
    const deltaY = event.clientY - active.y
    if (!active.moved) {
      if (Math.abs(deltaX) < DRAG_THRESHOLD_PX && Math.abs(deltaY) < DRAG_THRESHOLD_PX) return
      active.moved = true
      onManualCameraChange?.()
      onUserInteraction?.()
      if (active.onControl && !event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId)
      }
    }
    active.x = event.clientX
    active.y = event.clientY
    camera.panBy(deltaX, deltaY)
  }
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = drag.current
    if (active?.pointerId !== event.pointerId) return
    drag.current = null
    if (active.moved) suppressClick.current = true
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    // Settle React on the final pan right away so the layers catch up.
    flushPendingPan()
  }
  const handleClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (suppressClick.current) {
      suppressClick.current = false
      event.preventDefault()
      event.stopPropagation()
      return
    }
    onMapClickCapture?.(event)
  }

  return (
    <div
      ref={viewport}
      data-map-viewport
      className={cn('group/map touch-none select-none', className)}
      onWheel={handleWheel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClickCapture={handleClickCapture}
    >
      <div
        ref={stageRef}
        data-map-stage
        className="absolute inset-0 origin-center"
      >
        {typeof children === 'function'
          ? children({
            ...view,
            mapSize,
            viewportHeight: viewportSize.height,
            viewportWidth: viewportSize.width,
            focusPoint,
            focusMarker,
            centerOn,
          })
          : children}
      </div>
      <div className={cn(
        'absolute bottom-4 right-4 z-30 flex flex-col items-end gap-2 transition-opacity duration-200',
        controlsIntroVisible
          ? 'opacity-100'
          : 'pointer-events-none opacity-0 group-hover/map:pointer-events-auto group-hover/map:opacity-100 group-focus-within/map:pointer-events-auto group-focus-within/map:opacity-100',
      )}>
        {extraControls}
        {zoomControls !== 'hidden' ? <div className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--overlay-background)] p-1">
        {zoomControls === 'full' ? <span className="min-w-8 px-1 py-1 text-center text-[10px] font-bold tabular-nums text-[var(--accent-text)]">
          {Math.round(view.zoom * 100)}%
        </span> : null}
        <button type="button" onClick={() => zoomAtCenter(1.25)} className="group/control relative grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--text)] hover:bg-[var(--surface-hover)]" aria-label={t('map.zoomIn')} title={zoomControls === 'full' ? t('map.zoomIn') : undefined}>
          <Plus size={16} aria-hidden="true" />
          {zoomControls === 'compact' ? <MapControlTooltip label={t('map.zoomIn')} /> : null}
        </button>
        <button type="button" onClick={() => zoomAtCenter(0.8)} className="group/control relative grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--text)] hover:bg-[var(--surface-hover)]" aria-label={t('map.zoomOut')} title={zoomControls === 'full' ? t('map.zoomOut') : undefined}>
          <Minus size={16} aria-hidden="true" />
          {zoomControls === 'compact' ? <MapControlTooltip label={t('map.zoomOut')} /> : null}
        </button>
        {zoomControls === 'full' ? <button type="button" onClick={reset} className="grid h-8 w-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--text)] hover:bg-[var(--surface-hover)]" aria-label={t('map.resetView')}>
          <RotateCcw size={15} aria-hidden="true" />
        </button> : null}
        </div> : null}
      </div>
    </div>
  )
}
