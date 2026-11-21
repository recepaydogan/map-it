import { ArrowLeft, Bell } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { WHATS_NEW_VERSION } from './whats-new-release'

type LinkedNote = { target: 'marker-customization' | 'character-pins'; before: string; link: string; after: string }
type FeedbackFooter = { target: 'feedback'; before: string; link: string; after: string }
type ReleaseNote = string | LinkedNote
type Release = { version: string; items: unknown[]; footer?: unknown }

const isReleaseNote = (entry: unknown): entry is ReleaseNote => typeof entry === 'string' || (
  typeof entry === 'object' && entry !== null &&
  'target' in entry && (entry.target === 'marker-customization' || entry.target === 'character-pins') &&
  'before' in entry && typeof entry.before === 'string' &&
  'link' in entry && typeof entry.link === 'string' &&
  'after' in entry && typeof entry.after === 'string'
)

const isRelease = (entry: unknown): entry is Release => typeof entry === 'object' && entry !== null &&
  'version' in entry && typeof entry.version === 'string' &&
  'items' in entry && Array.isArray(entry.items)

const isFeedbackFooter = (entry: unknown): entry is FeedbackFooter => typeof entry === 'object' && entry !== null &&
  'target' in entry && entry.target === 'feedback' &&
  'before' in entry && typeof entry.before === 'string' &&
  'link' in entry && typeof entry.link === 'string' &&
  'after' in entry && typeof entry.after === 'string'

export function WhatsNewSurface({ onClose, onOpenMarkerCustomization, onOpenCharacterPins, onOpenFeedback }: {
  onClose: () => void
  onOpenMarkerCustomization: () => void
  onOpenCharacterPins: () => void
  onOpenFeedback: () => void
}) {
  const { t } = useTranslation()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => headingRef.current?.focus({ preventScroll: true }), [])

  const currentKey = `v${WHATS_NEW_VERSION.replaceAll('.', '')}`
  const result = t('whatsNew.releases', { returnObjects: true })
  const releases = (typeof result === 'object' && result !== null ? Object.entries(result) : [])
    .filter((entry): entry is [string, Release] => isRelease(entry[1]))
    .sort(([left], [right]) => left === currentKey ? -1 : right === currentKey ? 1 : right.localeCompare(left, undefined, { numeric: true }))

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--background)]" data-whats-new-page>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
        <div className="flex items-center gap-3">
          <Bell size={18} className="shrink-0 text-[var(--accent-text)]" aria-hidden="true" />
          <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-[var(--text)] outline-none">{t('whatsNew.title')}</h1>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('whatsNew.back')}
          className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-[var(--radius-sm)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
        >
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
        <div className="max-w-3xl space-y-10">
          {releases.map(([key, release]) => {
            const notes = release.items.filter(isReleaseNote)
            return (
              <article key={key} aria-labelledby={`whats-new-${key}`}>
                <h2 id={`whats-new-${key}`} className="mb-6 inline-flex rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-1.5 font-mono text-sm font-semibold text-[var(--accent-text)]">
                  {t('whatsNew.version', { version: release.version })}
                </h2>
                {notes.length > 0 && (
                  <ul className="space-y-4 pl-4">
                    {notes.map((note, index) => (
                      <li key={`${key}-${index}`} className="flex gap-3 text-[15px] leading-7 text-[var(--text)]">
                        <span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-[var(--accent)]" />
                        <span>{typeof note === 'string' ? note : <>{note.before}<button type="button"
                          onClick={note.target === 'character-pins' ? onOpenCharacterPins : onOpenMarkerCustomization}
                          className="cursor-pointer font-semibold text-[var(--accent-text)] underline decoration-current underline-offset-4 transition-colors hover:text-[var(--text)] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                        >{note.link}</button>{note.after}</>}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {isFeedbackFooter(release.footer) && (
                  <p className="mt-5 pl-4 text-[15px] leading-7 text-[var(--text)]">
                    {release.footer.before}<button type="button"
                      onClick={onOpenFeedback}
                      className="cursor-pointer font-semibold text-[var(--accent-text)] underline decoration-current underline-offset-4 transition-colors hover:text-[var(--text)] focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                    >{release.footer.link}</button>{release.footer.after}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      </div>
    </div>
  )
}
