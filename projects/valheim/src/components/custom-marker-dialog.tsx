import { Check, MapPinPlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CUSTOM_MARKER_ICON_TYPES, customMarkerType, type CustomMarker, type CustomMarkerType, type MarkerFields, useCustomMarkerStore } from '../store/custom-marker-store'
import { CustomMarkerVisual } from './custom-marker-visual'
import { CustomMarkerPicker, type MarkerPickerOption } from './custom-marker-picker'

export function CustomMarkerDialog({ editing, onClose, onCreate, onSaved }: {
  editing: CustomMarker | null
  onClose: () => void
  onCreate: (fields: MarkerFields) => void
  onSaved: (id: string) => void
}) {
  const { t } = useTranslation()
  const update = useCustomMarkerStore((state) => state.update)
  const [category, setCategory] = useState<CustomMarkerType>(editing?.category ?? 'type:traders')
  const [name, setName] = useState(editing?.name ?? '')
  const [description, setDescription] = useState(editing?.description ?? '')
  const [icon, setIcon] = useState(editing?.icon)
  const currentIconId = editing && (icon || !CUSTOM_MARKER_ICON_TYPES.some((type) => type.key === category)) ? `current:${editing.id}` : null
  const imageOptions: MarkerPickerOption[] = [
    ...(currentIconId ? [{ id: currentIconId, label: t('customMarkers.currentIcon'), group: t('customMarkers.currentIcon'), visual: <CustomMarkerVisual marker={{ category, icon }} size={24} /> }] : []),
    ...CUSTOM_MARKER_ICON_TYPES.map((type) => ({
      id: type.key,
      label: t(type.labelKey),
      group: t('customMarkers.mapCategories'),
      visual: <CustomMarkerVisual marker={{ category: type.key }} size={24} />,
    })),
  ]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  const save = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    const fields = { category, name: trimmed, description: description.trim() || undefined, icon }
    if (editing) {
      update(editing.id, fields)
      onSaved(editing.id)
    } else onCreate(fields)
    onClose()
  }

  return (
    <div className="absolute inset-0 z-[60] grid place-items-center bg-black/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={t(editing ? 'customMarkers.edit' : 'customMarkers.new')} className="flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
        <header className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-4">
          <CustomMarkerVisual marker={{ category, icon }} size={40} />
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-[var(--text)]">{name.trim() || t(editing ? 'customMarkers.edit' : 'customMarkers.new')}</h2>
            <p className="text-xs text-[var(--muted)]">{t(customMarkerType(category).labelKey)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('customMarkers.close')} className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-[var(--surface-hover)]"><X size={17} /></button>
        </header>
        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">{t('customMarkers.name')} <span className="text-[var(--accent-text)]">*</span></span>
            <input autoFocus maxLength={80} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') save() }} placeholder={t('customMarkers.namePlaceholder')} className="w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
          </label>
          <CustomMarkerPicker label={t('customMarkers.image')} value={currentIconId ?? category} options={imageOptions} onChange={(value) => { if (value === currentIconId) return; setCategory(value); setIcon(undefined) }} />
          <label className="block">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">{t('customMarkers.description')} <span className="font-normal normal-case tracking-normal">{t('customMarkers.optional')}</span></span>
            <textarea rows={3} maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder={t('customMarkers.descriptionPlaceholder')} className="w-full resize-none rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-3 py-2 text-[13px] text-[var(--text)] outline-none focus:border-[var(--accent)]" />
          </label>
        </div>
        <footer className="flex gap-2 border-t border-[var(--border)] p-4">
          <button type="button" onClick={onClose} className="flex-1 cursor-pointer rounded-[var(--radius-md)] border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]">{t('customMarkers.cancel')}</button>
          <button type="button" onClick={save} disabled={!name.trim()} className="flex flex-[2] cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-contrast)] disabled:cursor-not-allowed disabled:opacity-40">{editing ? <Check size={15} /> : <MapPinPlus size={15} />}{t(editing ? 'customMarkers.save' : 'customMarkers.chooseLocation')}</button>
        </footer>
      </div>
    </div>
  )
}
