import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { signIn } from '../../lib/auth/auth-service'
import {
  AuthError,
  AuthField,
  AuthLink,
  AuthNotice,
  AuthSubmit,
  type AuthView,
} from './auth-form'

type SignInFormProps = {
  onSwitch: (view: AuthView) => void
  /** One-shot success line from a completed sign-up or password reset. */
  notice?: string | null
}

/** Email/password sign-in. Success lands via the AuthProvider subscription —
 *  the account surface swaps to the profile once the session appears. */
export function SignInForm({ onSwitch, notice }: SignInFormProps) {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await signIn(email.trim(), password)
    if (!result.ok) {
      setError(result.error)
      setPending(false)
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4">
      {!error ? <AuthNotice>{notice}</AuthNotice> : null}
      <AuthField
        label={t('account.email')}
        type="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder={t('account.emailPlaceholder')}
        autoComplete="email"
        autoFocus
        required
      />
      <AuthField
        label={t('account.password')}
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="••••••••"
        autoComplete="current-password"
        required
      />
      <AuthError>{error}</AuthError>
      <AuthSubmit pending={pending} disabled={!email.trim() || !password}>
        {t('account.signIn')}
      </AuthSubmit>
      <div className="flex items-center justify-between">
        <AuthLink onClick={() => onSwitch('forgot-password')}>
          {t('account.forgotPassword')}
        </AuthLink>
        <AuthLink onClick={() => onSwitch('sign-up')}>
          {t('account.noAccountSignUp')}
        </AuthLink>
      </div>
    </form>
  )
}
