import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ForgotPasswordForm } from './forgot-password-form'
import { SignInForm } from './sign-in-form'
import { SignUpForm } from './sign-up-form'
import type { AuthView } from './auth-form'

const VIEW_COPY: Record<AuthView, { titleKey: string; subtitleKey: string }> = {
  'sign-in': {
    titleKey: 'account.signIn',
    subtitleKey: 'account.signInSubtitle',
  },
  'sign-up': {
    titleKey: 'account.createAccount',
    subtitleKey: 'account.signUpSubtitle',
  },
  'forgot-password': {
    titleKey: 'account.recoverAccess',
    subtitleKey: 'account.forgotPasswordSubtitle',
  },
}

/** Sign in / sign up / forgot password — one centered card, three forms. */
export function AuthCard() {
  const { t } = useTranslation()
  const [view, setView] = useState<AuthView>('sign-in')
  const [signInNotice, setSignInNotice] = useState<string | null>(null)

  const switchView = (next: AuthView) => {
    setSignInNotice(null)
    setView(next)
  }

  const copy = VIEW_COPY[view]

  return (
    <div className="relative flex h-full items-center justify-center overflow-y-auto py-6">
      <div className="w-full max-w-sm animate-[fade-in_200ms_ease-out]">
        <div className="flex flex-col gap-5 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)]/70 p-7 shadow-2xl shadow-black/40">
          <header className="flex flex-col gap-1">
            <h2 className="font-[family-name:var(--font-display)] text-[22px] font-bold tracking-wide text-[var(--text)]">
              {t(copy.titleKey)}
              <span className="text-[var(--accent-text)]">.</span>
            </h2>
            <p className="text-[11.5px] leading-relaxed text-[var(--muted)]">{t(copy.subtitleKey)}</p>
          </header>

          {view === 'sign-in' ? (
            <SignInForm onSwitch={switchView} notice={signInNotice} />
          ) : null}
          {view === 'sign-up' ? (
            <SignUpForm
              onSwitch={switchView}
              onNeedsConfirmation={(notice) => {
                setSignInNotice(notice)
                setView('sign-in')
              }}
            />
          ) : null}
          {view === 'forgot-password' ? <ForgotPasswordForm onSwitch={switchView} /> : null}
        </div>
      </div>
    </div>
  )
}
