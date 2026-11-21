/**
 * Supabase Auth wrapper. Overwolf windows cannot receive redirects, so the
 * email/password forgot-password flow uses the
 * emailed 6-digit recovery code (`verifyOtp`) instead of a magic link.
 *
 * Every call degrades gracefully when Supabase is not configured: the caller
 * gets `{ ok: false }` with a human-readable message and the rest of the app
 * keeps working signed-out.
 */

import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "../../data/supabase-client";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** ISO timestamp of account creation. */
  createdAt: string;
}

export type AuthResult = { ok: true } | { ok: false; error: string };

export const NOT_CONFIGURED =
  "Account service is not configured in this build — everything else keeps working.";

/** Supabase error strings → copy that matches the app's tone. */
const FRIENDLY_ERRORS: Array<[match: RegExp, message: string]> = [
  [/invalid login credentials/i, "Email or password is incorrect."],
  [/email not confirmed/i, "Confirm your email first — check your inbox for the link."],
  [/already registered/i, "An account with this email already exists — sign in instead."],
  [/rate limit|too many requests/i, "Too many attempts — wait a minute and try again."],
  [/token has expired|invalid token|otp/i, "That code is invalid or expired — request a new one."],
  [/at least 6 characters/i, "Password must be at least 6 characters."],
  [/failed to fetch|network/i, "Can't reach the account service — check your connection."],
];

export const friendly = (raw: string): string =>
  FRIENDLY_ERRORS.find(([match]) => match.test(raw))?.[1] ?? raw;

/** Last resort, for an account with no name and no address to derive one from. */
export const DEFAULT_DISPLAY_NAME = "Explorer";
/** Matches the sign-up form's own ceiling, so a name can't be set longer than
 *  it could have been created. */
export const DISPLAY_NAME_MAX = 24;

/**
 * What an account is called before its owner picks anything: the local part of
 * their e-mail address (explorer@example.com → "explorer").
 *
 * Having a name is mandatory, choosing one is not — so this always answers, and
 * the profile offers a box to replace it. In practice it is reached only by
 * accounts that never went through the sign-up form (which requires a name).
 */
export const defaultDisplayName = (email: string | null | undefined): string =>
  email?.split("@")[0]?.trim() || DEFAULT_DISPLAY_NAME;

/** The one name this account goes by across the app. */
export const resolveDisplayName = (user: User): string => {
  const chosen = user.user_metadata?.display_name;
  return typeof chosen === "string" && chosen.trim()
    ? chosen.trim()
    : defaultDisplayName(user.email);
};

export const toAuthUser = (user: User): AuthUser => ({
  id: user.id,
  email: user.email ?? "",
  displayName: resolveDisplayName(user),
  createdAt: user.created_at,
});

export const isAuthAvailable = (): boolean => getSupabaseClient() !== null;

export const signIn = async (
  email: string,
  password: string,
): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

export const signUp = async (
  email: string,
  password: string,
  displayName: string,
): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; error: string }> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { ok: false, error: friendly(error.message) };
  // No session back from signUp means the project requires email confirmation.
  return { ok: true, needsConfirmation: data.session === null };
};

export const signOut = async (): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await client.auth.signOut();
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

/** Step 1 of forgot-password: email the user a recovery code. */
export const requestPasswordReset = async (email: string): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await client.auth.resetPasswordForEmail(email);
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

/** Step 2: the emailed code proves ownership, then the new password is set. */
export const confirmPasswordReset = async (
  email: string,
  code: string,
  newPassword: string,
): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { error: verifyError } = await client.auth.verifyOtp({
    email,
    token: code.trim(),
    type: "recovery",
  });
  if (verifyError) return { ok: false, error: friendly(verifyError.message) };
  const { error } = await client.auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

/**
 * Rename the account. Clearing it is legal and means "use the default" — the
 * name is mandatory, choosing one is not, and resolveDisplayName() supplies
 * DEFAULT_DISPLAY_NAME for anything blank.
 *
 * The change lands back in the app through AuthProvider's onAuthChange
 * subscription (Supabase emits a user-updated event), so no caller has to
 * re-read the session or refresh anything itself.
 */
export const updateDisplayName = async (displayName: string): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await client.auth.updateUser({
    data: { display_name: displayName.trim().slice(0, DISPLAY_NAME_MAX) },
  });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

export const updatePassword = async (newPassword: string): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };
  const { error } = await client.auth.updateUser({ password: newPassword });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

/** Current user from the persisted session, or null when signed out. */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data } = await client.auth.getSession();
  return data.session ? toAuthUser(data.session.user) : null;
};

/** Subscribe to sign-in/out and profile updates. Returns the unsubscribe. */
export const onAuthChange = (
  callback: (user: AuthUser | null) => void,
): (() => void) => {
  const client = getSupabaseClient();
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    callback(session ? toAuthUser(session.user) : null);
  });
  return () => data.subscription.unsubscribe();
};
