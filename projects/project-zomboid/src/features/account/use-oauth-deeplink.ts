import { useEffect } from "react";
import {
  restoreWindowPreservingPlacement,
  surfaceWindowOverExternalApp,
} from "../../overwolf-utils/window-manager";
import { exchangeOAuthCode } from "../../services/auth/google-oauth";
import {
  OAUTH_LAUNCH_MESSAGE_ID,
  OAUTH_LAUNCH_STORAGE_KEY,
  type OAuthLaunchPayload,
} from "../../services/auth/oauth-deeplink";

/**
 * Completes Google sign-in in the main window. After consent the background
 * window relays the pzinteractivemap://auth/callback?code=… launch parameter
 * here (via a window message, and via shared localStorage as a fallback for a
 * just-opened main). We exchange the code for a session — the PKCE verifier
 * lives in this window's Supabase storage, so the exchange must run here.
 *
 * Success surfaces through the AuthProvider's onAuthChange subscription, so this
 * hook only needs to drive the exchange and clear the pending launch.
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
        // foreground. When this launch actually carried our auth hand-off,
        // un-minimize if needed and raise the window above the browser via a
        // topmost pulse — plain bringToFront loses the foreground fight with
        // another process, so it would flash forward then drop back behind.
        if (result.hadCode && typeof overwolf !== "undefined") {
          void restoreWindowPreservingPlacement("main").finally(() => {
            void surfaceWindowOverExternalApp("main");
          });
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
    const onMessageReceived = (message: { id: string; content?: unknown }) => {
      if (message.id !== OAUTH_LAUNCH_MESSAGE_ID) return;
      window.localStorage.removeItem(OAUTH_LAUNCH_STORAGE_KEY);
      const payload = message.content as OAuthLaunchPayload | undefined;
      if (payload?.rawParameter) consume(payload.rawParameter);
    };
    overwolf.windows?.onMessageReceived?.addListener(onMessageReceived);

    return () => {
      cancelled = true;
      overwolf.windows?.onMessageReceived?.removeListener(onMessageReceived);
    };
  }, []);
};
