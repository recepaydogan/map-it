import { cn } from '../lib/cn'
import type { LocationMarkerVisual as MarkerVisualDefinition } from '../lib/location-marker-style'
import { MarkerGlyph } from './marker-glyphs'

interface LocationMarkerVisualProps {
  className?: string
  size: number
  visual: MarkerVisualDefinition
}

/** Shared category visual used by map markers, filters, and location details. */
export function LocationMarkerVisual({ className, size, visual }: LocationMarkerVisualProps) {
  if (visual.kind === 'glyph') {
    return <MarkerGlyph name={visual.glyph} size={size} className={className} />
  }

  return (
    <img
      src={visual.src}
      alt=""
      draggable={false}
      width={size}
      height={size}
      className={cn(
        'object-contain',
        visual.kind === 'art' && 'rounded-[var(--radius-full)]',
        className,
      )}
      style={{ height: size, width: size }}
      aria-hidden="true"
    />
  )
}
