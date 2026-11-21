import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { identifyUser, resetUser, track } from "../services/optional-usage";
import {
  getCurrentUser,
  isAuthAvailable,
  onAuthChange,
  type AuthUser,
} from "../services/auth/auth-service";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./auth-context";
import { setCloudSyncUser, startCloudSync } from "../services/sync/cloud-sync";
import { loadAccountLinkedCharacters } from "../features/character-profiles/linked-characters";

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
  const linkedUserRef = useRef<string | null>(null);

  useEffect(() => {
    startCloudSync();
    if (!isAuthAvailable()) {
      setCloudSyncUser(null);
      return;
    }

    const apply = (next: AuthUser | null) => {
      if (next) {
        // Stitch analytics to the account so events follow the user; rides every
        // auth event (sign-in, profile update, token refresh) but identify() is
        // idempotent on the same id, so it never duplicates a person.
        identifyUser(next.id, { email: next.email, name: next.displayName });
        if (initialSettledRef.current && !wasSignedInRef.current) {
          track("SIGN_IN_COMPLETED");
        }
      } else if (wasSignedInRef.current) {
        // Real sign-out: log it, then detach the analytics person so the next
        // session here starts anonymous instead of inheriting this identity.
        track("SIGN_OUT");
        resetUser();
      }
      wasSignedInRef.current = next !== null;
      setCloudSyncUser(next?.id ?? null);
      if (next?.id !== linkedUserRef.current) {
        linkedUserRef.current = next?.id ?? null;
        if (next) void loadAccountLinkedCharacters(next.id).catch((error: unknown) => {
          console.error("Could not merge linked characters after sign-in", error);
        });
      }
      setUser(next);
      setStatus(next ? "signed-in" : "signed-out");
    };

    // Restore the persisted session, then follow every subsequent change.
    let cancelled = false;
    void getCurrentUser()
      .then((restored) => {
        if (cancelled) return;
        apply(restored);
        // Boot has settled: from here on a sign-in transition is the real thing.
        initialSettledRef.current = true;
      })
      .catch((error: unknown) => {
        console.error("[Auth] Could not restore the session:", error);
        if (!cancelled) {
          setCloudSyncUser(null);
          setStatus("signed-out");
        }
      });
    const unsubscribe = onAuthChange((next) => {
      if (!cancelled) apply(next);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({ status, user }), [status, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
