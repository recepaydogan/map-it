import { CircleHelp, MessageSquareText, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

const QUESTIONS = ['thunderstore', 'tracker', 'world', 'overlay', 'inventory'] as const

type FaqSurfaceProps = {
  onClose: () => void
  onOpenSupport: () => void
}

export function FaqSurface({ onClose, onOpenSupport }: FaqSurfaceProps) {
  const { t } = useTranslation()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <main className="flex h-full min-h-0 flex-col bg-[var(--background)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <span className="grid size-10 place-items-center rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-text)]">
          <CircleHelp size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">{t('faq.title')}</h1>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{t('faq.description')}</p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('faq.close')}
          className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--text)]"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-2xl">
          <section aria-label={t('faq.title')} className="divide-y divide-[var(--border)] overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/60">
            {QUESTIONS.map((key) => (
              <article key={key} className="px-5 py-4">
                <h2 className="text-[13px] font-semibold leading-snug text-[var(--text)]">{t(`faq.questions.${key}.question`)}</h2>
                <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--muted)]">{t(`faq.questions.${key}.answer`)}</p>
              </article>
            ))}
          </section>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/40 px-5 py-4">
            <div>
              <p className="text-[12.5px] font-semibold text-[var(--text)]">{t('faq.moreHelp')}</p>
              <p className="mt-0.5 text-[11.5px] text-[var(--muted)]">{t('faq.moreHelpDescription')}</p>
            </div>
            <button
              type="button"
              onClick={onOpenSupport}
              className="flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2 text-[12px] font-semibold text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              <MessageSquareText size={14} aria-hidden="true" />
              {t('faq.openSupport')}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
