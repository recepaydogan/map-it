import { Crosshair, Pencil, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { customMarkerType, type CustomMarker } from '../store/custom-marker-store'
import { CustomMarkerVisual } from './custom-marker-visual'
import { markerBackgroundColor, useMarkerSizes } from '../lib/map-marker-sizes'
import { MarkerProgressActions } from './marker-progress-actions'

export function CustomMarkerDetail({ marker, leftOffset, topOffset, onClose, onEdit, onDelete, onCenter }: {
  marker: CustomMarker
  leftOffset: number
  topOffset: number
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
  onCenter: () => void
}) {
  const { t } = useTranslation()
  const markerColor = markerBackgroundColor('custom', useMarkerSizes())
  return <aside data-map-selection-panel="custom" className="absolute z-40 w-[360px] max-w-[calc(100%-1rem)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--overlay-background)] p-4 text-[var(--text)] shadow-2xl" style={{ left: leftOffset, top: topOffset }}>
    <div className="flex items-start gap-3">
      <CustomMarkerVisual marker={marker} size={42} backgroundColor={markerColor} />
      <div className="min-w-0 flex-1"><h2 className="break-words text-base font-bold">{marker.name}</h2><p className="text-xs text-[var(--muted)]">{t(customMarkerType(marker.category).labelKey)}</p></div>
      <button type="button" onClick={onClose} aria-label={t('customMarkers.close')} className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"><X size={16} /></button>
    </div>
    {marker.description ? <p className="mt-4 whitespace-pre-wrap break-words text-[13px] leading-relaxed">{marker.description}</p> : null}
    <p className="mt-4 text-xs text-[var(--muted)]">{t('map.coordinates')}: {marker.x.toFixed(0)}, {marker.z.toFixed(0)}</p>
    <MarkerProgressActions worldKey={marker.worldKey} markerId={marker.id} />
    <div className="mt-4 flex gap-2 border-t border-[var(--border)] pt-3">
      <button type="button" onClick={onEdit} className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:bg-[var(--surface-hover)]"><Pencil size={15} />{t('customMarkers.editAction')}</button>
      <button type="button" onClick={onDelete} aria-label={t('customMarkers.delete')} title={t('customMarkers.delete')} className="grid size-9 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--muted)] hover:border-red-500 hover:text-red-300"><Trash2 size={15} /></button>
      <button type="button" onClick={onCenter} aria-label={t('customMarkers.center')} title={t('customMarkers.center')} className="grid size-9 cursor-pointer place-items-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"><Crosshair size={15} /></button>
    </div>
  </aside>
}
