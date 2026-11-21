import { Check, ChevronDown, Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { CUSTOM_MARKER_TYPES, useCustomMarkerStore } from '../store/custom-marker-store'
import { CustomMarkerVisual } from './custom-marker-visual'
import { markerBackgroundColor, useMarkerSizes } from '../lib/map-marker-sizes'
import { isMapPointVisible, type ExplorationRestriction } from '../lib/valheim/explored-map'
import { useMarkerProgress } from '../hooks/use-marker-progress'

export function CustomMarkerFilters({ worldKey, query, exploration }: { worldKey: string; query: string; exploration?: ExplorationRestriction }) {
  const { t } = useTranslation()
  const { found } = useMarkerProgress(worldKey)
  const progressCount = (entries: typeof markers) => {
    const completed = entries.filter(marker => found.has(marker.id)).length
    return <span title={t('markerProgress.count', { found: completed, total: entries.length })}><span className="text-emerald-300">{completed}</span><span className="mx-0.5 opacity-60">/</span>{entries.length}</span>
  }
  const markerColor = markerBackgroundColor('custom', useMarkerSizes())
  const markers = useCustomMarkerStore((state) => state.markers)
  const hidden = useCustomMarkerStore((state) => state.hiddenCategories)
  const setVisible = useCustomMarkerStore((state) => state.setCategoryVisible)
  const setAllVisible = useCustomMarkerStore((state) => state.setAllVisible)
  const [expanded, setExpanded] = useState(true)
  const worldMarkers = markers.filter((marker) => marker.worldKey === worldKey && isMapPointVisible(exploration, marker.x, marker.z))
  if (!worldMarkers.length) return null
  const used = CUSTOM_MARKER_TYPES.filter((type) => worldMarkers.some((marker) => marker.category === type.key))
  const shown = used.filter((type) => t(type.labelKey).toLowerCase().includes(query.toLowerCase()))
  if (query && !shown.length && !t('customMarkers.yourMarkers').toLowerCase().includes(query.toLowerCase())) return null
  const allVisible = used.every((type) => !hidden.includes(type.key))
  return <section className="order-first border-b border-[var(--border)]/60">
    <div className="flex items-center gap-2 py-2">
      <button type="button" onClick={() => setAllVisible(!allVisible)} aria-pressed={allVisible} aria-label={t('customMarkers.yourMarkers')} className={cn('grid size-4 cursor-pointer place-items-center rounded-[5px] border', allVisible ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-zinc-500')}>{allVisible ? <Check size={11} /> : null}</button>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} className="flex flex-1 cursor-pointer items-center gap-2 text-left text-[13px] font-semibold text-[var(--text)]"><Star size={15} />{t('customMarkers.yourMarkers')}</button>
      <span className="text-[10px] tabular-nums text-[var(--muted)]">{progressCount(worldMarkers)}</span>
      <button type="button" onClick={() => setExpanded(!expanded)} aria-label={t('customMarkers.yourMarkers')}><ChevronDown size={15} className={cn('text-[var(--muted)]', expanded && 'rotate-180')} /></button>
    </div>
    {(expanded || query) ? <div className="space-y-0.5 pb-2 pl-1">{shown.map((type) => {
      const active = !hidden.includes(type.key)
      return <button key={type.key} type="button" onClick={() => setVisible(type.key, !active)} aria-pressed={active} className={cn('flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-[var(--text)] hover:bg-white/5', !active && 'opacity-60')}>
        <CustomMarkerVisual marker={{ category: type.key }} size={20} backgroundColor={markerColor} />
        <span className="flex-1">{t(type.labelKey)}</span>
        <span className="text-[11px] tabular-nums text-[var(--muted)]">{progressCount(worldMarkers.filter((marker) => marker.category === type.key))}</span>
        <span className={cn('grid size-4 place-items-center rounded-[5px] border', active ? 'border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]' : 'border-zinc-500')}>{active ? <Check size={11} /> : null}</span>
      </button>
    })}</div> : null}
  </section>
}
