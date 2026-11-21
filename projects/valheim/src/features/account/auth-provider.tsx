import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  getCurrentUser,
  isAuthAvailable,
  onAuthChange,
  type AuthUser,
} from '../../lib/auth/auth-service'
import { identifyUser, resetUser, track } from '../../lib/analytics/analytics'
import { EVENTS } from '../../lib/analytics/events'
import { AuthContext, type AuthContextValue, type AuthStatus } from '../../lib/auth/auth-context'

/**
 * Session state for the whole window. Mutations (sign in/out, profile edits)
 * are plain auth-service calls from the screens — they land back here through
 * the onAuthChange subscription, so there is a single source of truth.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isAuthAvailable() ? 'loading' : 'unavailable',
  )
  const [user, setUser] = useState<AuthUser | null>(null)
  // Whether the last applied state was signed-in — so the sign-out event fires
  // only on a real sign-OUT transition, never on the initial signed-out boot.
  const wasSignedInRef = useRef(false)
  // True once the persisted-session boot has settled. Until then a signed-out ->
  // signed-in flip is a session *restore*, not a fresh sign-in, so we don't
  // count it (otherwise every launch by a logged-in user logs a sign-in).
  const initialSettledRef = useRef(false)

  useEffect(() => {
    if (!isAuthAvailable()) return

    const apply = (next: AuthUser | null) => {
      if (next) {
        // Stitch analytics to the account so events follow the user; rides every
        // auth event (sign-in, profile update, token refresh) but identify() is
        // idempotent on the same id, so it never duplicates a person.
        identifyUser(next.id, { email: next.email, name: next.displayName })
        // A genuine sign-in: signed-out -> signed-in *after* the boot restore.
        // Token refreshes (user -> user) and the boot restore itself don't count.
        if (initialSettledRef.current && !wasSignedInRef.current) {
          track(EVENTS.SIGN_IN_COMPLETED)
        }
      } else if (wasSignedInRef.current) {
        // Real sign-out: log it, then detach the analytics person so the next
        // session here starts anonymous instead of inheriting this identity.
        track(EVENTS.SIGN_OUT)
        resetUser()
      }
      wasSignedInRef.current = next !== null
      setUser(next)
      setStatus(next ? 'signed-in' : 'signed-out')
    }

    // Restore the persisted session, then follow every subsequent change.
    let cancelled = false
    void getCurrentUser()
      .then((restored) => {
        if (cancelled) return
        apply(restored)
        // Boot has settled: from here on a sign-in transition is the real thing.
        initialSettledRef.current = true
      })
    const unsubscribe = onAuthChange((next) => {
      if (!cancelled) apply(next)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ status, user }), [status, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
