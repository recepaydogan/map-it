/**
 * Google sign-in for an Overwolf window via a custom URL protocol.
 *
 * OAuth redirects can't land on an overwolf-extension:// origin, so we register
 * a `pzinteractivemap://` protocol in the manifest and use it as the redirect:
 *
 *   1. signInWithGoogle() asks Supabase for the consent URL (PKCE,
 *      skipBrowserRedirect) with redirectTo = pzinteractivemap://auth/callback,
 *      then opens it in the system browser.
 *   2. After consent the browser hits Supabase's callback, which redirects to
 *      pzinteractivemap://auth/callback?code=…. The OS hands that URL to
 *      Overwolf, which launches/relays it to the app as a launch parameter.
 *   3. The background window forwards the parameter to the main window
 *      (see background-controller + use-oauth-deeplink), which calls
 *      exchangeOAuthCode() to turn the code into a session.
 *
 * The PKCE verifier is held in the main window's persisted Supabase storage, so
 * the exchange must run there — which is exactly where the relay delivers it.
 * No hosted page or Realtime channel is involved.
 *
 * In plain-browser dev (no `overwolf` global) the flow falls back to a
 * full-page redirect completed by completeOAuthRedirect() on reload.
 */

import { getSupabaseClient } from "../../data/supabase-client";
import { NOT_CONFIGURED, friendly, type AuthResult } from "./auth-service";
import { OAUTH_REDIRECT_URL, parseOAuthParams } from "./oauth-deeplink";

/**
 * Start Google sign-in. Resolves as soon as the browser is opened — the actual
 * session arrives asynchronously through the deep-link relay and surfaces via
 * the AuthProvider's onAuthChange subscription.
 */
export const signInWithGoogle = async (): Promise<AuthResult> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED };

  // Plain-browser dev: navigate away and finish on reload.
  if (typeof overwolf === "undefined") {
    const { error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    return error ? { ok: false, error: friendly(error.message) } : { ok: true };
  }

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: OAUTH_REDIRECT_URL,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data?.url) {
    return {
      ok: false,
      error: friendly(error?.message ?? "Couldn't start Google sign-in."),
    };
  }

  overwolf.utils.openUrlInDefaultBrowser(data.url);
  return { ok: true };
};

/**
 * Exchange an auth code carried by a deep-link launch parameter for a session.
 * Runs in the main window, where the PKCE verifier lives. Returns whether a
 * code was found and exchanged (so the relay can stop re-processing it).
 */
export const exchangeOAuthCode = async (
  rawParameter: string,
): Promise<AuthResult & { hadCode: boolean }> => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: NOT_CONFIGURED, hadCode: false };

  const { code, errorDescription } = parseOAuthParams(rawParameter);
  if (errorDescription) {
    return { ok: false, error: friendly(errorDescription), hadCode: true };
  }
  if (!code) return { ok: false, error: "", hadCode: false };

  const { error } = await client.auth.exchangeCodeForSession(code);
  if (error) return { ok: false, error: friendly(error.message), hadCode: true };
  return { ok: true, hadCode: true };
};

/**
 * Dev-only counterpart of the browser fallback above: after the full-page
 * redirect lands back on the vite origin with ?code=, exchange it and scrub
 * the URL. No-op inside Overwolf and when no code is present.
 */
export const completeOAuthRedirect = async (): Promise<void> => {
  if (typeof window === "undefined" || typeof overwolf !== "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return;
  const client = getSupabaseClient();
  if (!client) return;
  await client.auth.exchangeCodeForSession(code);
  params.delete("code");
  const query = params.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + (query ? `?${query}` : ""),
  );
};
