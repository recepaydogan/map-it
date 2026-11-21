import { MAP_ICONS } from '../lib/location-marker-style'
import { Swords } from 'lucide-react'
import { customMarkerType, type CustomMarker } from '../store/custom-marker-store'
import { MarkerGlyph, type MarkerGlyphName } from './marker-glyphs'

export function CustomMarkerVisual({ marker, size = 28, backgroundColor }: { marker: Pick<CustomMarker, 'category' | 'icon'>; size?: number; backgroundColor?: string }) {
  const type = customMarkerType(marker.category)
  const icon = marker.icon ?? type.icon
  const glyph = icon.startsWith('glyph:') ? icon.slice(6) as MarkerGlyphName : null
  const swords = icon === 'lucide:swords'
  const src = glyph || swords ? null : MAP_ICONS[icon as keyof typeof MAP_ICONS] ?? icon
  return (
    <span className="grid shrink-0 place-items-center rounded-full border-2 bg-[#0a0d10]/95 shadow-[0_2px_9px_rgba(0,0,0,0.8)]" style={{ width: size, height: size, borderColor: type.color, backgroundColor }}>
      {swords ? <Swords size={size * 0.7} strokeWidth={2.5} className="text-white" /> : glyph ? <MarkerGlyph name={glyph} size={size * 0.7} className="text-white" /> : <img src={src ?? undefined} alt="" draggable={false} className="h-[78%] w-[78%] object-contain" />}
    </span>
  )
}
