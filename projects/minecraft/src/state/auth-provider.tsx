import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { identifyUser, resetUser, track } from "../services/analytics/analytics";
import { EVENTS } from "../services/analytics/events";
import {
  getCurrentUser,
  isAuthAvailable,
  onAuthChange,
  type AuthUser,
} from "../services/auth/auth-service";
import { syncOverwolfEmailHashes } from "../services/auth/overwolf-email-hashes";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./auth-context";

/**
 * Session state for the whole window. Mutations (sign in/out, profile edits)
 * are plain auth-service calls from the screens — they land back here through
 * the onAuthChange subscription, so there is a single source of truth.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isAuthAvailable() ? "loading" : "unavailable",
  );
  const [user, setUser] = useState<AuthUser | null>(null);

  // Analytics bookkeeping: was the previous state signed-in, and has the boot
  // restore settled? Only a signed-out → signed-in transition AFTER the restore
  // is a real sign-in; token refreshes and the restore itself are not.
  const wasSignedInRef = useRef(false);
  const initialSettledRef = useRef(false);

  useEffect(() => {
    if (!isAuthAvailable()) {
      syncOverwolfEmailHashes(null);
      return;
    }

    const apply = (next: AuthUser | null) => {
      syncOverwolfEmailHashes(next?.email ?? null);
      if (next) {
        // Stitch analytics to the account so events follow the user; rides every
        // auth event (sign-in, profile update, token refresh) but identify() is
        // idempotent on the same id, so it never duplicates a person.
        identifyUser(next.id, { email: next.email, name: next.displayName });
        if (initialSettledRef.current && !wasSignedInRef.current) {
          track(EVENTS.SIGN_IN_COMPLETED);
        }
      } else if (wasSignedInRef.current) {
        // Real sign-out: log it, then detach the analytics person so the next
        // session here starts anonymous instead of inheriting this identity.
        track(EVENTS.SIGN_OUT);
        resetUser();
      }
      wasSignedInRef.current = next !== null;
      setUser(next);
      setStatus(next ? "signed-in" : "signed-out");
    };

    // Restore the persisted session, then follow every subsequent change.
    let cancelled = false;
    let authEventReceived = false;
    void getCurrentUser()
      .then((restored) => {
        if (cancelled) return;
        if (!authEventReceived) apply(restored);
        // Boot has settled: from here on a sign-in transition is the real thing.
        initialSettledRef.current = true;
      });
    const unsubscribe = onAuthChange((next) => {
      if (!cancelled) {
        authEventReceived = true;
        apply(next);
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ status, user }), [status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
