import { CircleUserRound, CloudOff, Loader2, X } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../../hooks/use-auth'
import { AuthCard } from './auth-card'
import { ProfileView } from './profile-view'

/**
 * Account surface — sign in / sign up / forgot password when signed out, the
 * profile when signed in. Shares the settings surface's shell language (sticky
 * header + close, own scroll area) and renders inside the main content column,
 * so it never covers the Overwolf ad rail.
 *
 * Sign-in/out are plain auth-service calls; the AuthProvider's onAuthChange
 * subscription is the single source of truth, so the body below swaps between
 * the auth card and the profile automatically as the session appears/clears.
 */
export function AccountSurface({ onClose, onViewPlans }: { onClose: () => void; onViewPlans: () => void }) {
  const { t } = useTranslation()
  const { status, user } = useAuth()

  // ESC closes the surface first. Capture + stopImmediatePropagation so the
  // app-wide ESC handler (selection / filter rail) doesn't also fire underneath.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (event.target instanceof Element && event.target.closest('[data-premium-plans]')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const subtitle =
    status === 'signed-in'
      ? t('account.yourAccount')
      : status === 'unavailable'
        ? t('account.serviceUnavailable')
        : t('account.signInOrCreate')

  return (
    <main className="flex h-full flex-col bg-[var(--background)]">
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-6 py-4">
        <span className="grid size-10 place-items-center rounded-[var(--radius-md)] border border-[var(--accent)]/30 bg-[var(--accent-soft)] text-[var(--accent-text)]">
          <CircleUserRound size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text)]">{t('account.account')}</h1>
          <p className="mt-0.5 text-[12px] text-[var(--muted)]">{subtitle}</p>
        </div>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onClose}
          aria-label={t('account.closeAccount')}
          className="grid size-8 cursor-pointer place-items-center rounded-[var(--radius-md)] text-[var(--muted)] hover:bg-white/[0.06] hover:text-[var(--text)]"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 px-6 py-6">
        {status === 'unavailable' ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CloudOff size={26} className="text-[var(--muted)]" aria-hidden="true" />
            <div>
              <h2 className="text-[13px] font-semibold text-[var(--text)]">{t('account.accountsNotAvailable')}</h2>
              <p className="mx-auto mt-1.5 max-w-xs text-[11.5px] leading-relaxed text-[var(--muted)]">
                {t('account.accountsNotAvailableBody')}
              </p>
            </div>
          </div>
        ) : status === 'signed-in' && user ? (
          <ProfileView user={user} onViewPlans={onViewPlans} />
        ) : status === 'signed-out' ? (
          <AuthCard />
        ) : (
          <div className="flex h-full items-center justify-center text-[var(--muted)]">
            <Loader2 size={18} className="animate-spin" aria-hidden="true" />
          </div>
        )}
      </div>
    </main>
  )
}
