/**
 * Custom-protocol OAuth hand-off — pure, Overwolf-free helpers shared by the
 * main and background windows.
 *
 * Overwolf windows live on an `overwolf-extension://` origin that Google OAuth
 * cannot redirect to. Instead of bouncing through a hosted page, the manifest
 * registers a `peakmap://` URL protocol used as the OAuth `redirectTo`. After
 * consent the OS launches the app with that URL as the launch parameter; the
 * background window relays it to the main window, which extracts the auth
 * `code` and exchanges it for a session.
 */

/** URL-protocol scheme — must match `data.url_protocol.scheme` in manifest.json. */
export const OAUTH_SCHEME = "peakmap";

/** OAuth redirect target. Allow-list this exact value under Supabase → Auth →
 *  URL Configuration → Redirect URLs, or the consent screen rejects it. */
export const OAUTH_REDIRECT_URL = `${OAUTH_SCHEME}://auth/callback`;

/** localStorage key the background window drops a pending launch into, so the
 *  main window can pick it up on mount even if it was not open to receive the
 *  cross-window message. Shared because all extension windows share an origin. */
export const OAUTH_LAUNCH_STORAGE_KEY = "peak-map:oauth-launch";

/** Cross-window message id the background uses to push a launch to the main. */
export const OAUTH_LAUNCH_MESSAGE_ID = "oauth_launch";

export interface OAuthLaunchPayload {
  /** The raw launch parameter (a `peakmap://…?code=…` URL or query slice). */
  rawParameter: string;
}

export interface ParsedOAuthParams {
  code: string | null;
  errorDescription: string | null;
}

const decodeMaybe = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const extractParam = (raw: string, param: string): string | null => {
  const match = raw.match(new RegExp(`[?#&]${param}=([^&#\\s]+)`, "i"));
  return match?.[1] ? decodeMaybe(match[1]) : null;
};

/** Pull the auth `code` (and any OAuth error) out of a launch parameter,
 *  tolerant of single- or double-encoding and `?`/`#`/`&` separators. */
export const parseOAuthParams = (rawInput: string): ParsedOAuthParams => {
  const normalized = decodeMaybe(rawInput.trim());
  return {
    code: extractParam(normalized, "code"),
    errorDescription:
      extractParam(normalized, "error_description") ?? extractParam(normalized, "error"),
  };
};

/** True when the parameter carries something worth handing to the main window. */
export const isOAuthLaunch = (rawInput: string | null | undefined): boolean => {
  if (!rawInput) return false;
  const { code, errorDescription } = parseOAuthParams(rawInput);
  return Boolean(code || errorDescription);
};
