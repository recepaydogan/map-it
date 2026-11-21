import { useEffect } from "react";
import { exchangeOAuthCode } from "../../auth/google-oauth";
import {
  OAUTH_LAUNCH_MESSAGE_ID,
  OAUTH_LAUNCH_STORAGE_KEY,
  type OAuthLaunchPayload,
} from "../../auth/oauth-deeplink";
import { APP_CONFIG } from "../../config/app-config";
import { revealWindow } from "../../overwolf/window-manager";

/**
 * Completes Google sign-in in the main window. After consent the background
 * window relays the peakmap://auth/callback?code=... launch parameter here
 * (via a window message, and via shared localStorage as a fallback for a
 * just-opened main). We exchange the code for a session - the PKCE verifier
 * lives in this window's Supabase storage, so the exchange must run here.
 *
 * Success surfaces through the auth store's onAuthChange subscription, so this
 * hook only drives the exchange and clears the pending launch.
 */
export const useOAuthDeepLink = (): void => {
  useEffect(() => {
    let cancelled = false;
    // The code is single-use: the relay can deliver the same launch via both
    // localStorage and a window message, so guard against a double exchange
    // (the second would fail with "code already used").
    const seen = new Set<string>();

    const consume = (rawParameter: string) => {
      if (seen.has(rawParameter)) return;
      seen.add(rawParameter);
      void exchangeOAuthCode(rawParameter).then((result) => {
        if (cancelled) return;
        if (!result.ok && result.error) {
          console.warn("[OAuth] Sign-in could not be completed:", result.error);
        }
        // The sign-in happened in the system browser, which still owns the
        // foreground. When this launch carried our auth hand-off, raise the
        // window back over it.
        if (result.hadCode && typeof overwolf !== "undefined") {
          void revealWindow(APP_CONFIG.mainWindowName);
        }
      });
    };

    // 1. Pending launch left in localStorage before this window mounted.
    try {
      const pending = window.localStorage.getItem(OAUTH_LAUNCH_STORAGE_KEY);
      if (pending) {
        window.localStorage.removeItem(OAUTH_LAUNCH_STORAGE_KEY);
        const { rawParameter } = JSON.parse(pending) as OAuthLaunchPayload;
        if (rawParameter) consume(rawParameter);
      }
    } catch {
      window.localStorage.removeItem(OAUTH_LAUNCH_STORAGE_KEY);
    }

    // 2. Live relays from the background window while main is already open.
    if (typeof overwolf === "undefined") return;
    const onMessage = (message: { id: string; content?: unknown }) => {
      if (message.id !== OAUTH_LAUNCH_MESSAGE_ID) return;
      window.localStorage.removeItem(OAUTH_LAUNCH_STORAGE_KEY);
      const payload = message.content as OAuthLaunchPayload | undefined;
      if (payload?.rawParameter) consume(payload.rawParameter);
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessage);

    return () => {
      cancelled = true;
      overwolf.windows?.onMessageReceived?.removeListener(onMessage);
    };
  }, []);
};
