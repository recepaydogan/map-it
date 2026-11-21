import { BookOpen, Focus, Palette, RotateCcw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../../lib/cn'

interface SceneActionsProps {
  colourAll: boolean
  canUndo: boolean
  canClear: boolean
  onColourAll: (value: boolean) => void
  onUndo: () => void
  onClear: () => void
  onFit: () => void
  onReference: () => void
}

const button = (active = false) => cn(
  'grid size-9 cursor-pointer place-items-center rounded-[var(--radius-sm)] transition-colors disabled:cursor-default disabled:opacity-35',
  active ? 'bg-[var(--surface-hover)] text-[var(--accent-text)]' : 'text-[var(--text)] hover:bg-white/10',
)

/** Top-right icon cluster: colour toggle, undo, clear, frame, reference. */
export function SceneActions({ colourAll, canUndo, canClear, onColourAll, onUndo, onClear, onFit, onReference }: SceneActionsProps) {
  const { t } = useTranslation()
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-[var(--radius-md)] border border-white/10 bg-black/60 p-1 shadow-xl backdrop-blur-xl">
      <button type="button" onClick={() => onColourAll(!colourAll)} className={button(colourAll)} title={colourAll ? t('building.toolbar.colourAllOn') : t('building.toolbar.colourAllOff')} aria-pressed={colourAll} aria-label={t('building.toolbar.colourAll')}>
        <Palette size={15} aria-hidden="true" />
      </button>
      <button type="button" onClick={onUndo} disabled={!canUndo} className={button()} title={t('building.toolbar.undo')} aria-label={t('building.toolbar.undo')}>
        <RotateCcw size={15} aria-hidden="true" />
      </button>
      <button type="button" onClick={onClear} disabled={!canClear} className={button()} title={t('building.toolbar.clear')} aria-label={t('building.toolbar.clear')}>
        <Trash2 size={15} aria-hidden="true" />
      </button>
      <button type="button" onClick={onFit} className={button()} title={t('building.toolbar.fit')} aria-label={t('building.toolbar.fit')}>
        <Focus size={15} aria-hidden="true" />
      </button>
      <span className="mx-0.5 h-6 w-px bg-white/10" />
      <button type="button" onClick={onReference} className={button()} title={t('building.rail.reference')} aria-label={t('building.rail.reference')}>
        <BookOpen size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
