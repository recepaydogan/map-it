import { useTranslation } from 'react-i18next'
import { useRef, useState } from 'react'
import { MAP_SIZE_PX } from './interactive-map-viewport'
import { customMarkerType, type CustomMarker } from '../store/custom-marker-store'
import { CustomMarkerVisual } from './custom-marker-visual'
import { markerBackgroundColor, markerScale, useMarkerSizes } from '../lib/map-marker-sizes'
import { mapMarkerZoomScale } from '../lib/map-marker-zoom'
import { useMarkerProgress } from '../hooks/use-marker-progress'
import { MarkerProgressBadges } from './marker-progress-badges'

const WORLD_DIAMETER = 21_000

export function CustomMarkerLayer({ markers, zoom, selectedId, onSelect, onMove, worldKey }: {
  worldKey: string
  markers: CustomMarker[]
  zoom: number
  selectedId: string | null
  onSelect: (marker: CustomMarker) => void
  onMove: (id: string, x: number, z: number) => void
}) {
  const { t } = useTranslation()
  const progress = useMarkerProgress(worldKey)
  const markerSizes = useMarkerSizes()
  const size = 28 * markerScale('custom', markerSizes) * mapMarkerZoomScale(zoom)
  const drag = useRef<{ id: string; pointerId: number; clientX: number; clientY: number; x: number; z: number; moved: boolean } | null>(null)
  const [preview, setPreview] = useState<{ id: string; x: number; z: number } | null>(null)
  const previewRef = useRef<{ id: string; x: number; z: number } | null>(null)
  const suppressClick = useRef<string | null>(null)
  return <>{markers.map((marker) => (
    <button
      key={marker.id}
      type="button"
      data-custom-marker
      onClick={(event) => {
        event.stopPropagation()
        if (suppressClick.current === marker.id) { suppressClick.current = null; return }
        onSelect(marker)
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 && event.pointerType === 'mouse') return
        event.stopPropagation()
        event.currentTarget.setPointerCapture(event.pointerId)
        drag.current = { id: marker.id, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, x: marker.x, z: marker.z, moved: false }
      }}
      onPointerMove={(event) => {
        const active = drag.current
        if (!active || active.id !== marker.id || active.pointerId !== event.pointerId) return
        event.stopPropagation()
        const dx = event.clientX - active.clientX
        const dy = event.clientY - active.clientY
        if (Math.hypot(dx, dy) > 4) active.moved = true
        if (!active.moved) return
        const metresPerPixel = WORLD_DIAMETER / (MAP_SIZE_PX * zoom)
        previewRef.current = { id: marker.id, x: Math.max(-WORLD_DIAMETER / 2, Math.min(WORLD_DIAMETER / 2, active.x + dx * metresPerPixel)), z: Math.max(-WORLD_DIAMETER / 2, Math.min(WORLD_DIAMETER / 2, active.z - dy * metresPerPixel)) }
        setPreview(previewRef.current)
      }}
      onPointerUp={(event) => {
        const active = drag.current
        if (!active || active.id !== marker.id || active.pointerId !== event.pointerId) return
        event.stopPropagation()
        drag.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (active.moved && previewRef.current?.id === marker.id) {
          suppressClick.current = marker.id
          onMove(marker.id, previewRef.current.x, previewRef.current.z)
        }
        previewRef.current = null
        setPreview(null)
      }}
      onPointerCancel={() => { drag.current = null; previewRef.current = null; setPreview(null) }}
      aria-label={`${marker.name} · ${t(customMarkerType(marker.category).labelKey)}`}
      title={selectedId === marker.id ? undefined : marker.name}
      data-map-selected-marker={selectedId === marker.id ? 'custom' : undefined}
      className={`group/marker absolute flex cursor-pointer items-center gap-1 outline-none hover:z-[110] focus-visible:z-[110] ${selectedId === marker.id ? 'z-[100]' : 'z-[70]'}`}
      style={{
        left: `${(((preview?.id === marker.id ? preview.x : marker.x) / WORLD_DIAMETER) + 0.5) * 100}%`,
        top: `${(0.5 - (preview?.id === marker.id ? preview.z : marker.z) / WORLD_DIAMETER) * 100}%`,
        transform: `translate(${-size / 2}px, -50%) scale(${1 / zoom})`,
        transformOrigin: `${size / 2}px center`,
      }}
    >
      <span className={`relative ${selectedId === marker.id ? 'rounded-full shadow-[0_0_0_3px_var(--accent)]' : ''}`}><CustomMarkerVisual marker={marker} size={size} backgroundColor={markerBackgroundColor('custom', markerSizes)} /><MarkerProgressBadges found={progress.found.has(marker.id)} favorite={progress.favorites.has(marker.id)} /></span>
      {selectedId === marker.id ? <span data-map-selected-tooltip="custom" className="pointer-events-none absolute bottom-[calc(100%+8px)] left-1/2 z-30 max-w-56 -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-left text-[11px] font-bold leading-tight text-[var(--text)] shadow-2xl">{marker.name}</span>
        : zoom >= 10 ? <span className="whitespace-nowrap rounded-[3px] bg-black/75 px-1.5 py-0.5 text-[11px] font-semibold text-white">{marker.name}</span> : null}
    </button>
  ))}</>
}
