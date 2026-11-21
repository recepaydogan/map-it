import { Check, ChevronDown, Eye, EyeOff, Map } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { MAP_SPOILER_MODES, type MapSpoilerMode } from '../lib/valheim/map-spoiler-mode'
import { cn } from '../lib/cn'

const icons = { full: Eye, terrain: Map, personal: EyeOff }

export function MapSpoilerControl({ mode, characterName, hint, onChange }: {
  mode: MapSpoilerMode
  characterName: string | null
  hint: string
  onChange: (mode: MapSpoilerMode) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const options = useRef<Array<HTMLButtonElement | null>>([])
  const id = useId()
  const Icon = icons[mode]
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => options.current[MAP_SPOILER_MODES.indexOf(mode)]?.focus({ preventScroll: true }))
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside) }
  }, [open, mode])
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus({ preventScroll: true })
    } else if (event.key === 'Tab') setOpen(false)
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      const current = options.current.findIndex(option => option === document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + 3) % 3
      options.current[next]?.focus({ preventScroll: true })
    }
  }
  return <div ref={root} className="pointer-events-auto relative mt-auto flex shrink-0 flex-col-reverse items-start gap-2" data-tour="spoilers">
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={id}
      aria-label={t('map.spoilers.label')} title={hint} onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true) } }}
      className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--overlay-background)] px-3 py-2 text-xs text-[var(--text)] shadow-lg hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
      <Icon size={16} aria-hidden="true" />
      <span className="text-left">
        <span className="block">{t(`map.spoilers.mode_${mode}`)}</span>
        {mode !== 'full' ? <span className="mt-0.5 block text-[10px] font-medium text-[var(--accent-text)]">
          {t('map.pins.characterLabel', { character: characterName ?? '—' })}
        </span> : null}
      </span>
      <ChevronDown size={14} aria-hidden="true" className={cn('ml-1 transition-transform', open && 'rotate-180')} />
    </button>
    {open ? <div id={id} role="menu" aria-label={t('map.spoilers.label')} onKeyDown={onKeyDown}
      className="w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] p-1.5 text-[var(--text)] shadow-2xl">
      {MAP_SPOILER_MODES.map((option, index) => {
        const OptionIcon = icons[option]
        return <button key={option} ref={element => { options.current[index] = element }} type="button"
          role="menuitemradio" aria-checked={mode === option} tabIndex={-1}
          title={t(`map.spoilers.mode_${option}_hint`)}
          onClick={() => { onChange(option); setOpen(false); trigger.current?.focus({ preventScroll: true }) }}
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-left hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <OptionIcon size={16} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-xs font-semibold">{t(`map.spoilers.mode_${option}`)}</span>
          {mode === option ? <Check size={15} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" /> : <span className="w-[15px] shrink-0" />}
        </button>
      })}
    </div> : null}
  </div>
}
