import { Check, ChevronDown, LoaderCircle, RefreshCw, UserRound } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

export function CharacterSelector({ characters, characterName, activeCharacterName, selectedCharacterId, loading, unavailable,
  openOnMount = false, onOpened, onOpen, onSelect, onRefresh }: {
  characters: Array<{ id: string; name: string }>
  characterName: string | null
  activeCharacterName: string | null
  selectedCharacterId: string | null
  loading: boolean
  unavailable: boolean
  openOnMount?: boolean
  onOpened?: () => void
  onOpen?: () => void
  onSelect: (id: string | null) => void
  onRefresh: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(openOnMount)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const optionButtons = useRef<Array<HTMLButtonElement | null>>([])
  const id = useId()
  const matches = activeCharacterName ? characters.filter(character => character.name.toLowerCase() === activeCharacterName.toLowerCase()) : []
  const activeId = matches.length === 1 ? matches[0].id : null
  const options = [
    ...(activeCharacterName ? [{ id: '', name: activeCharacterName }]
      : characters.length === 0 ? [{ id: '', name: t('map.pins.default') }] : []),
    ...characters.filter(character => character.id !== activeId),
  ]
  const value = selectedCharacterId === activeId ? '' : selectedCharacterId ?? ''
  const selectedIndex = Math.max(0, options.findIndex(option => option.id === value))
  const name = characterName ?? activeCharacterName ?? t('map.pins.default')
  useEffect(() => {
    if (!openOnMount) return
    const frame = requestAnimationFrame(() => { setOpen(true); onOpened?.() })
    return () => cancelAnimationFrame(frame)
  }, [openOnMount, onOpened])
  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      optionButtons.current[selectedIndex]?.focus({ preventScroll: true })
    })
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => { cancelAnimationFrame(frame); document.removeEventListener('pointerdown', outside) }
  }, [open, selectedIndex, options.length])
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }) }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close() }
    else if (event.key === 'Tab') setOpen(false)
    else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation()
      const current = optionButtons.current.findIndex(option => option === document.activeElement)
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
        : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
      optionButtons.current[next]?.focus({ preventScroll: true })
    }
  }
  return <div ref={root} data-character-selector data-tour="character" className="pointer-events-auto relative shrink-0">
    <button ref={trigger} type="button" aria-label={t('map.pins.character')} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined}
      title={t('map.pins.characterLabel', { character: name })}
      onClick={() => { if (!open) onOpen?.(); setOpen(value => !value) }}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); onOpen?.(); setOpen(true) } }}
      className="flex h-9 max-w-48 cursor-pointer items-center gap-2 rounded-[var(--radius-full)] border border-[var(--border)] bg-[var(--overlay-background)] px-3 text-xs text-[var(--text)] shadow-lg backdrop-blur-xl hover:border-[var(--border-strong)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
      <UserRound size={15} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
      <span className="min-w-0 truncate font-bold">{name}</span>
      {loading ? <LoaderCircle size={13} className="shrink-0 animate-spin" aria-hidden="true" /> : <ChevronDown size={13} className="shrink-0" aria-hidden="true" />}
    </button>
    {open ? <div id={id} role="dialog" aria-label={t('map.pins.character')} onKeyDown={onKeyDown}
      className="absolute left-0 top-full z-50 mt-2 w-64 max-w-[calc(100vw-2rem)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] shadow-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <p className="text-xs font-semibold">{t('map.pins.character')}</p>
        <button type="button" onClick={onRefresh} disabled={loading} aria-label={t('map.pins.refresh')} title={t('map.pins.refresh')}
          className="grid size-7 cursor-pointer place-items-center rounded-[var(--radius-sm)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)] disabled:cursor-default">
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
        </button>
      </div>
      <div role="listbox" aria-label={t('map.pins.character')} className="max-h-64 overflow-y-auto p-1.5">
        {options.map((option, index) => <button key={option.id} ref={element => { optionButtons.current[index] = element }} type="button"
          role="option" aria-selected={option.id === value} tabIndex={-1}
          onClick={() => { onSelect(option.id || null); close() }}
          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] px-2.5 py-2.5 text-left text-xs hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]">
          <span className="truncate">{option.name}</span>{option.id === value ? <Check size={14} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" /> : null}
        </button>)}
      </div>
      {unavailable ? <p role="status" className="border-t border-[var(--border)] px-3 py-2 text-[11px] leading-relaxed">
        {loading ? t('map.pins.loading') : characterName ? t('map.pins.unavailable', { character: characterName }) : t('map.pins.chooseCharacter')}
      </p> : null}
    </div> : null}
  </div>
}
