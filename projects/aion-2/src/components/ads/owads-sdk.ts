/**
 * Shared OwAds bootstrap.
 *
 * Share one SDK load, including bounded retries, across all ad surfaces in a
 * window. Always fetch from Overwolf's CDN; never bundle the SDK.
 *
 * https://dev.overwolf.com/ow-native/reference/ads/owad/
 */

import { adErrorProperties, reportAdDiagnostic } from "./ad-telemetry";

const OWADS_SDK_SRC = "https://content.overwolf.com/libs/ads/latest/owads.min.js";
const OWADS_SDK_TIMEOUT_MS = 15_000;
const OWADS_SDK_RETRY_DELAYS_MS = [2_000, 5_000] as const;

export type OwAdsSdkState = "loading" | "ready" | "unsupported" | "error";

let owAdsSdkPromise: Promise<boolean> | null = null;

export const canUseOwAds = (): boolean =>
  typeof window !== "undefined" &&
  typeof overwolf !== "undefined" &&
  typeof document !== "undefined";

/**
 * Whether the window is in an "open" state (normal or maximized). Minimized /
 * hidden / closed count as "not open" — ads must be removed there.
 */
export const isAdWindowOpenState = (state: string): boolean =>
  state === "normal" || state === "maximized";

const loadSdkAttempt = (attempt: number): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    const startedAt = Date.now();
    let existing = document.querySelector(
      'script[data-owads-sdk="true"]',
    ) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "true" && !window.OwAd) {
      existing.remove();
      existing = null;
    }

    const script = existing ?? document.createElement("script");
    let settled = false;
    const finish = (loaded: boolean, reason: string, error?: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      script.removeEventListener("error", onError);
      if (!loaded) {
        script.remove();
        console.warn(`[Ads SDK] Load attempt ${attempt} failed`, reason, error);
        reportAdDiagnostic("ADS_SDK_LOAD_ATTEMPT_FAILED", {
          attempt, reason, elapsed_ms: Date.now() - startedAt,
          retry_scheduled: attempt <= OWADS_SDK_RETRY_DELAYS_MS.length,
          ...adErrorProperties(error),
        });
      }
      resolve(loaded);
    };
    const onLoad = () => {
      script.dataset.loaded = "true";
      finish(Boolean(window.OwAd), "missing_global");
    };
    const onError = () => finish(false, "download_error");
    const timeout = window.setTimeout(
      () => finish(Boolean(window.OwAd), "timeout"),
      OWADS_SDK_TIMEOUT_MS,
    );

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = OWADS_SDK_SRC;
      script.async = true;
      script.dataset.owadsSdk = "true";
      try {
        document.head.appendChild(script);
      } catch (error) {
        finish(false, "script_append_failed", error);
      }
    }
  });

const loadSdkWithRetries = async (): Promise<boolean> => {
  const startedAt = Date.now();
  let attempts = 0;
  const result = (loaded: boolean, reason: string, error?: unknown) => {
    reportAdDiagnostic("ADS_SDK_LOAD_RESULT", {
      loaded, reason, attempts, elapsed_ms: Date.now() - startedAt,
      recovered_after_retry: loaded && (attempts > 1 || reason === "late_success"),
      ...adErrorProperties(error),
    });
    return loaded;
  };
  try {
    for (let attempt = 0; attempt <= OWADS_SDK_RETRY_DELAYS_MS.length; attempt++) {
      // A timed-out request may finish during the delay; reuse it if available.
      if (window.OwAd) return result(true, "late_success");
      attempts++;
      if (await loadSdkAttempt(attempts)) return result(true, "loaded");
      const delay = OWADS_SDK_RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
      }
    }
    return result(false, "attempts_exhausted");
  } catch (error) {
    console.error("[Ads SDK] Unexpected loader failure", error);
    return result(false, "unexpected_error", error);
  }
};

export const loadOwAdsSdk = async (): Promise<boolean> => {
  if (!canUseOwAds()) return false;
  if (window.OwAd) return true;
  if (owAdsSdkPromise) return owAdsSdkPromise;

  const pending = loadSdkWithRetries();
  owAdsSdkPromise = pending;
  const loaded = await pending;
  // A later mount can try again after the bounded attempts are exhausted.
  if (!loaded && owAdsSdkPromise === pending) owAdsSdkPromise = null;
  return loaded;
};
