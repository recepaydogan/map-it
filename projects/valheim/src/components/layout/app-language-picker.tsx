import { APP_LANGUAGE_OPTIONS as languages } from './app-language-options'
import { Check, ChevronDown } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/cn'
import { readPreferences, writePreferences, type AppLanguage } from '../../store/preferences'

type AppLanguagePickerProps = { variant?: 'header' | 'settings' }

/** One language control for the title bar and Settings, styled like the AION 2 picker. */
export function AppLanguagePicker({ variant = 'header' }: AppLanguagePickerProps) {
  const { i18n, t } = useTranslation()
  const currentCode: AppLanguage = i18n.language === 'ru' || i18n.language === 'zh-Hans' || i18n.language === 'pt-BR' ? i18n.language : 'en'
  const current = languages.find((language) => language.code === currentCode) ?? languages[0]
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      close()
      triggerRef.current?.focus()
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [close, open])

  const select = (language: AppLanguage) => {
    if (language !== currentCode) writePreferences({ ...readPreferences(), language })
    close()
    triggerRef.current?.focus()
  }

  return (
    <div ref={rootRef} data-language-menu={open ? 'open' : 'closed'} className={cn('relative shrink-0', variant === 'header' && 'h-full')}>
      <button
        ref={triggerRef}
        type="button"
        data-ow-no-drag
        onClick={() => setOpen((value) => !value)}
        aria-label={t('settings.language')}
        aria-haspopup="listbox"
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        title={current.name}
        className={cn(
          'flex cursor-pointer items-center gap-1.5 text-[var(--text)] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-text)]',
          variant === 'header'
            ? 'h-full px-2 text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--text)]'
            : 'h-9 min-w-[142px] justify-between rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 text-[12.5px] font-medium hover:border-[var(--accent)] hover:bg-[var(--surface-hover)]',
        )}
      >
        <img src={current.flag} alt="" aria-hidden="true" className="h-auto w-[22px] shrink-0 rounded-[2px] ring-1 ring-black/25" />
        {variant === 'settings' && <span className="flex-1 text-left">{current.name}</span>}
        <ChevronDown size={13} className="shrink-0 text-[var(--muted)]" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label={t('settings.language')}
          className="absolute right-0 top-[calc(100%+6px)] z-[1600] min-w-44 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] p-1 shadow-xl shadow-black/50"
        >
          {languages.map((language) => {
            const selected = language.code === currentCode
            return (
              <button
                key={language.code}
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => select(language.code)}
                className={cn(
                  'flex w-full cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-1.5 text-left text-[13px] outline-none transition-colors hover:bg-[var(--surface-hover)] focus-visible:bg-[var(--surface-hover)]',
                  selected ? 'text-[var(--text)]' : 'text-[var(--muted)]',
                )}
              >
                <span className="grid w-4 shrink-0 place-items-center">
                  {selected && <Check size={13} className="text-[var(--accent-text)]" aria-hidden="true" />}
                </span>
                <img src={language.flag} alt="" aria-hidden="true" className="h-auto w-5 shrink-0 rounded-[2px] ring-1 ring-black/25" />
                <span>{language.name}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
