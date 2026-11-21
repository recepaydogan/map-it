import { useSyncExternalStore } from "react";
import {
  getCurrentUser,
  isAuthAvailable,
  onAuthChange,
  type AuthUser,
} from "../auth/auth-service";
import { completeOAuthRedirect } from "../auth/google-oauth";
import { identifyUser, resetUser, track } from "../utils/analytics/analytics";
import { EVENTS } from "../utils/analytics/events";
import {
  clearExpeditions,
  startExpeditionSync,
  stopExpeditionSync,
} from "../features/map/expedition-store";

export type AuthStatus =
  /** Restoring the persisted session on boot. */
  | "loading"
  | "signed-in"
  | "signed-out"
  /** Supabase env vars missing - account features hidden, atlas unaffected. */
  | "unavailable";

export interface AuthState {
  status: AuthStatus;
  /** Set exactly when status is "signed-in". */
  user: AuthUser | null;
}

const SIGNED_OUT: AuthState = { status: "signed-out", user: null };

const listeners = new Set<() => void>();

let snapshot: AuthState = {
  status: isAuthAvailable() ? "loading" : "unavailable",
  user: null,
};

/** Whether the last applied state was signed-in, so the sign-out event fires
 *  only on a real sign-OUT transition and never on the initial signed-out boot. */
let wasSignedIn = false;
/** True once the persisted-session boot has settled. Until then a signed-out to
 *  signed-in flip is a session restore, not a fresh sign-in. */
let initialSettled = false;
let started = false;

const emitChange = (): void => {
  listeners.forEach((listener) => listener());
};

const apply = (next: AuthUser | null): void => {
  const previousUserId = snapshot.user?.id;
  if (next && previousUserId && previousUserId !== next.id) {
    // Treat a direct account replacement as a sign-out boundary so one
    // account's local journal can never be uploaded into another account.
    stopExpeditionSync();
    clearExpeditions();
    resetUser();
    wasSignedIn = false;
  }
  if (next) {
    // Stitch analytics to the account so events follow the user; identify() is
    // idempotent on the same id, so repeated auth events never duplicate a person.
    identifyUser(next.id, { email: next.email, name: next.displayName });
    if (initialSettled && !wasSignedIn) track(EVENTS.SIGN_IN_COMPLETED);
    startExpeditionSync(next.id);
  } else if (wasSignedIn) {
    // Real sign-out: log it, then detach the analytics person so the next
    // session here starts anonymous instead of inheriting this identity.
    track(EVENTS.SIGN_OUT);
    resetUser();
    stopExpeditionSync();
    clearExpeditions();
  }
  wasSignedIn = next !== null;
  snapshot = { status: next ? "signed-in" : "signed-out", user: next };
  emitChange();
};

/**
 * Session state for the whole window. Mutations (sign in/out, profile edits)
 * are plain auth-service calls from the screens - they land back here through
 * the onAuthChange subscription, so there is a single source of truth.
 *
 * Called once from the main window; safe to call again (later calls no-op).
 */
export const startAuthSession = (): void => {
  if (started || !isAuthAvailable()) return;
  started = true;

  // Finish a pending dev-mode OAuth redirect (no-op in Overwolf), restore the
  // persisted session, then follow every subsequent change.
  void completeOAuthRedirect()
    .then(() => getCurrentUser())
    .then((restored) => {
      apply(restored);
      // Boot has settled: from here on a sign-in transition is the real thing.
      initialSettled = true;
    });

  onAuthChange(apply);
};

export const getAuthState = (): AuthState => snapshot;

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useAuth = (): AuthState =>
  useSyncExternalStore(subscribe, getAuthState, () => SIGNED_OUT);
