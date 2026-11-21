/**
 * Supabase Auth wrapper for email/password accounts. Overwolf
 * windows cannot receive password-recovery redirects, so the reset flow uses the
 * emailed 6-digit recovery code (`verifyOtp`) instead of a magic link.
 *
 * Every call degrades gracefully when Supabase is not configured: the caller
 * gets `{ ok: false }` with a human-readable message and the rest of the app
 * keeps working signed-out.
 */

import type { User } from "@supabase/supabase-js";
import i18n from "i18next";
import { getSupabaseClient } from "../../data/supabase-client";
import { flushSavedDataBeforeSignOut } from "../saved-data/saved-data-sync";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  /** ISO timestamp of account creation. */
  createdAt: string;
}

export type AuthResult = { ok: true } | { ok: false; error: string; reason?: "unsynced" };

const notConfigured = (): string => i18n.t("account.errors.notConfigured");

/** Supabase error strings → copy that matches the app's tone. */
const FRIENDLY_ERRORS: Array<[match: RegExp, key: string]> = [
  [/invalid login credentials/i, "account.errors.invalidCredentials"],
  [/email not confirmed/i, "account.errors.emailNotConfirmed"],
  [/already registered/i, "account.errors.alreadyRegistered"],
  [/rate limit|too many requests/i, "account.errors.rateLimited"],
  [/token has expired|invalid token|otp/i, "account.errors.invalidCode"],
  [/at least 6 characters/i, "account.errors.passwordTooShort"],
  [/failed to fetch|network/i, "account.errors.offline"],
];

const friendly = (raw: string): string => {
  const key = FRIENDLY_ERRORS.find(([match]) => match.test(raw))?.[1];
  if (!key) console.warn("[Auth] Unmapped request error:", raw);
  return i18n.t(key ?? "account.errors.unknown");
};

/** Matches the sign-up form's own ceiling, so a name can't be set longer than
 *  it could have been created. */
export const DISPLAY_NAME_MAX = 24;

/**
 * What an account is called before its owner picks anything: the local part of
 * their e-mail address (explorer@example.com → "explorer").
 *
 * Having a name is mandatory, choosing one is not — so this always answers, and
 * the profile offers a box to replace it. In practice it is reached only by
 * accounts created outside this app's sign-up form (which requires a name).
 */
export const defaultDisplayName = (email: string | null | undefined): string =>
  email?.split("@")[0]?.trim() || i18n.t("account.defaultDisplayName");

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
  if (!client) return { ok: false, error: notConfigured() };
  const { error } = await client.auth.signInWithPassword({ email, password });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

export const signUp = async (
  email: string,
  password: string,
  displayName: string,
): Promise<{ ok: true; needsConfirmation: boolean } | { ok: false; error: string }> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: notConfigured() };
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return { ok: false, error: friendly(error.message) };
  // No session back from signUp means the project requires email confirmation.
  return { ok: true, needsConfirmation: data.session === null };
};

export const signOut = async (options: { discardUnsynced?: boolean } = {}): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: notConfigured() };
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) return { ok: false, error: friendly(sessionError.message) };
  if (sessionData.session && !options.discardUnsynced) {
    try {
      const saved = await flushSavedDataBeforeSignOut(sessionData.session.user.id);
      if (!saved) return { ok: false, error: i18n.t("account.errors.unsyncedChanges"), reason: "unsynced" };
    } catch (error) {
      console.error("[Auth] Could not save player data before sign-out:", error);
      return { ok: false, error: i18n.t("account.errors.unsyncedChanges"), reason: "unsynced" };
    }
  }
  const { error } = await client.auth.signOut();
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

/** Step 1 of forgot-password: email the user a recovery code. */
export const requestPasswordReset = async (email: string): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: notConfigured() };
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
  if (!client) return { ok: false, error: notConfigured() };
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
 * the English fallback for anything blank.
 *
 * The change lands back in the app through AuthProvider's onAuthChange
 * subscription (Supabase emits a user-updated event), so no caller has to
 * re-read the session or refresh anything itself.
 */
export const updateDisplayName = async (displayName: string): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: notConfigured() };
  const { error } = await client.auth.updateUser({
    data: { display_name: displayName.trim().slice(0, DISPLAY_NAME_MAX) },
  });
  return error ? { ok: false, error: friendly(error.message) } : { ok: true };
};

export const updatePassword = async (newPassword: string): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: notConfigured() };
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
