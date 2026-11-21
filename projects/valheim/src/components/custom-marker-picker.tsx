import { Check, ChevronDown, Search } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../lib/cn'

export interface MarkerPickerOption {
  id: string
  label: string
  group: string
  visual: ReactNode
}

export function CustomMarkerPicker({ label, value, options, onChange }: {
  label: string
  value: string
  options: MarkerPickerOption[]
  onChange: (id: string) => void
}) {
  const { t } = useTranslation()
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.id === value) ?? options[0]
  const visible = options.filter((option) => `${option.label} ${option.group}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  let lastGroup = ''

  return <section onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false) } }}>
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--muted)]">{label}</p>
    <button type="button" aria-expanded={open} aria-controls={listId} onClick={() => { setOpen(!open); setQuery('') }} className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-black/25 px-3 py-2 text-left text-[13px] text-[var(--text)] hover:border-[var(--accent)]">
      {selected?.visual}<span className="min-w-0 flex-1 truncate">{selected?.label}</span><ChevronDown size={15} className={cn('shrink-0 text-[var(--muted)]', open && 'rotate-180')} />
    </button>
    {open ? <div id={listId} className="mt-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1.5 shadow-xl">
      <label className="mb-1.5 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--border)] bg-black/25 px-2 py-1.5">
        <Search size={13} className="text-[var(--muted)]" aria-hidden="true" />
        <span className="sr-only">{t('customMarkers.searchOptions')}</span>
        <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('customMarkers.searchOptions')} className="min-w-0 flex-1 bg-transparent text-xs text-[var(--text)] outline-none" />
      </label>
      <div className="max-h-48 overflow-y-auto overscroll-contain">
        {visible.map((option) => {
          const showGroup = option.group !== lastGroup
          lastGroup = option.group
          return <div key={option.id}>
            {showGroup ? <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{option.group}</p> : null}
            <button type="button" onClick={() => { onChange(option.id); setOpen(false) }} aria-pressed={option.id === value} className={cn('flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-xs text-[var(--text)] hover:bg-[var(--surface-hover)]', option.id === value && 'bg-[var(--surface-hover)]')}>
              {option.visual}<span className="min-w-0 flex-1 truncate">{option.label}</span>{option.id === value ? <Check size={13} className="text-[var(--accent-text)]" /> : null}
            </button>
          </div>
        })}
        {!visible.length ? <p className="px-2 py-3 text-xs text-[var(--muted)]">{t('customMarkers.noOptions')}</p> : null}
      </div>
    </div> : null}
  </section>
}
