import { ArrowLeft, Castle, Landmark, MapPin, Palette, RotateCcw, Store, Swords, TreePine, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'
import { MarkerTypeDropdown } from './marker-type-dropdown'
import {
  MARKER_SIZE_CATEGORIES, MARKER_SIZE_GROUPS, MARKER_SIZE_MAX, MARKER_SIZE_MIN, MARKER_SIZE_STEP,
  clearMarkerCategorySize, markerBackgroundColor, markerSizePercent, resetMarkerSizes,
  setMarkerCategoryColor, setMarkerCategorySize, setMarkerGroupColor, setMarkerGroupSize,
  useMarkerSizes, type MarkerSizeGroup,
} from '../lib/map-marker-sizes'

const groupIcons = { bosses: Swords, dungeons: Castle, npcs: Store, structures: Landmark,
  discoveries: TreePine, personal: MapPin, live: MapPin } as const

export function MapMarkerSizePanel({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation()
  const sizes = useMarkerSizes()
  const [group, setGroup] = useState<MarkerSizeGroup>('bosses')
  const [categoryId, setCategoryId] = useState('')
  const selectedGroup = MARKER_SIZE_GROUPS.find((entry) => entry.id === group)!
  const categories = MARKER_SIZE_CATEGORIES.filter((category) => category.group === group)
  const effectiveCategoryId = categories.length === 1 ? categories[0].id : categoryId
  const selectedCategory = categories.find((category) => category.id === effectiveCategoryId)
  const current = selectedCategory ? markerSizePercent(selectedCategory.id, sizes) : sizes.groups[group]
  const color = selectedCategory ? markerBackgroundColor(selectedCategory.id, sizes) : sizes.groupColors[group]
  const ownColor = selectedCategory ? sizes.categoryColors[selectedCategory.id] : sizes.groupColors[group]
  const typeOptions = [
    ...(categories.length > 1 ? [{ id: '', label: t('filters.groupDefaultSize') }] : []),
    ...categories.map((category) => ({ id: category.id, label: t(category.labelKey) })),
  ]
  const setColor = (next: string | null) => selectedCategory
    ? setMarkerCategoryColor(selectedCategory.id, next) : setMarkerGroupColor(group, next)

  return <aside id="map-marker-size-panel" className="pointer-events-auto flex max-h-full w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--panel-background)] shadow-2xl shadow-black/40 backdrop-blur-xl">
    <header className="flex shrink-0 items-start gap-2 border-b border-[var(--border)] px-4 py-3">
      <MapPin size={16} className="mt-0.5 shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <h2 className="text-sm font-semibold text-[var(--text)]">{t('filters.markerSizes')}</h2>
      </span>
      <button type="button" onClick={onBack} aria-label={t('filters.backToFilters')} title={t('filters.backToFilters')}
        className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-white/5 hover:text-[var(--text)]">
        <X size={15} aria-hidden="true" />
      </button>
    </header>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      <button type="button" onClick={onBack} className="mb-3 flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[var(--accent-text)] hover:text-[var(--text)]">
        <ArrowLeft size={13} aria-hidden="true" />{t('filters.backToFilters')}
      </button>
      <div role="group" aria-label={t('filters.markerSizes')} className="grid grid-cols-2 gap-2">
        {MARKER_SIZE_GROUPS.map((entry) => {
          const Icon = groupIcons[entry.id]
          const active = entry.id === group
          const customized = MARKER_SIZE_CATEGORIES.some((category) => category.group === entry.id &&
            (sizes.categories[category.id] !== undefined || sizes.categoryColors[category.id] !== undefined))
          return <button key={entry.id} type="button" aria-pressed={active} onClick={() => { setGroup(entry.id); setCategoryId('') }}
            title={customized ? t('filters.customMarkerSizes') : undefined}
            className={cn('relative flex min-h-14 min-w-0 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]',
              active ? 'border-[var(--accent)] bg-black/20' : 'border-[var(--border)] bg-black/20 hover:border-[var(--border-strong)]')}>
            <Icon size={16} className={cn('shrink-0', active ? 'text-[var(--accent-text)]' : 'text-[var(--muted)]')} aria-hidden="true" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[12px] font-medium leading-4 text-[var(--text)]">{t(entry.labelKey)}</span>
              <span className={cn('text-[11px] font-semibold tabular-nums', active ? 'text-[var(--accent-text)]' : 'text-[var(--muted)]')}>{MARKER_SIZE_CATEGORIES.filter((category) => category.group === entry.id).length === 1
                ? markerSizePercent(MARKER_SIZE_CATEGORIES.find((category) => category.group === entry.id)!.id, sizes)
                : sizes.groups[entry.id]}%</span>
            </span>
            {customized ? <span className="absolute right-2 top-2 size-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" /> : null}
          </button>
        })}
      </div>
      <div className="mb-1.5 mt-4 text-[11px] font-medium text-[var(--muted)]">{t('filters.markerType')}</div>
      <MarkerTypeDropdown label={t('filters.markerType')} options={typeOptions} value={effectiveCategoryId} onChange={setCategoryId} />
      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/20 px-3 py-3">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium text-[var(--text)]">{t(selectedCategory?.labelKey ?? selectedGroup.labelKey)}</span>
          <output className="text-lg font-semibold tabular-nums text-[var(--accent-text)]">{current}%</output>
        </div>
        <input type="range" min={MARKER_SIZE_MIN} max={MARKER_SIZE_MAX} step={MARKER_SIZE_STEP} value={current}
          aria-label={t('filters.markerSizeFor', { group: t(selectedCategory?.labelKey ?? selectedGroup.labelKey) })}
          onChange={(event) => selectedCategory ? setMarkerCategorySize(selectedCategory.id, Number(event.currentTarget.value)) : setMarkerGroupSize(group, Number(event.currentTarget.value))}
          className="w-full cursor-pointer accent-[var(--accent)]" />
        <div className="mt-1 flex justify-between text-[10px] tabular-nums text-[var(--muted)]"><span>50%</span><span>200%</span></div>
        {selectedCategory && sizes.categories[selectedCategory.id] !== undefined ? <button type="button" onClick={() => clearMarkerCategorySize(selectedCategory.id)}
          className="mt-2 cursor-pointer text-[11px] font-medium text-[var(--accent-text)] hover:text-[var(--text)]">{t('filters.useGroupDefaultSize')}</button> : null}
      </div>
      <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/20 px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[12px] font-medium text-[var(--text)]">{t('filters.markerBackgroundColor')}</span>
          <span className="text-[11px] tabular-nums text-[var(--muted)]">{ownColor ?? t('filters.defaultMarkerColor')}</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative grid size-8 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] focus-within:outline-2 focus-within:outline-[var(--accent)]">
            <span className="grid size-6 place-items-center rounded-[3px]" style={{ backgroundColor: color }}>
              {!color ? <Palette size={15} className="text-[var(--muted)]" aria-hidden="true" /> : null}
            </span>
            <input type="color" value={color ?? '#4A3324'} onChange={(event) => setColor(event.currentTarget.value)}
              aria-label={t('filters.markerBackgroundColor')}
              className="absolute inset-0 size-full cursor-pointer opacity-0" />
          </label>
          <span className="text-[11px] text-[var(--muted)]">{t('filters.chooseMarkerColor')}</span>
          {ownColor ? <button type="button" onClick={() => setColor(null)}
            className="ml-auto cursor-pointer text-[11px] font-medium text-[var(--accent-text)] hover:text-[var(--text)]">{t('filters.useDefaultMarkerColor')}</button> : null}
        </div>
      </div>
      <button type="button" onClick={resetMarkerSizes} className="mt-3 flex cursor-pointer items-center gap-1.5 text-[12px] font-medium text-[var(--muted)] hover:text-[var(--accent-text)]">
        <RotateCcw size={13} aria-hidden="true" />{t('filters.resetMarkerSizes')}
      </button>
    </div>
  </aside>
}
