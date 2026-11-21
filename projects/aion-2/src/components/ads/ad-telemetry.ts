import { track } from "../../services/optional-usage";

type AdDiagnosticEvent = "ADS_SDK_LOAD_ATTEMPT_FAILED" | "ADS_SDK_LOAD_RESULT"
  | "AD_CONTAINER_CREATED" | "AD_CONTAINER_ERROR";

// Per-window limits, shared across remounts and high-impact banner recreation.
const reports = new Map<string, number>();

export const reportAdDiagnostic = (
  event: AdDiagnosticEvent,
  properties: Record<string, unknown>,
  limitKey?: string,
  limit = 3,
): void => {
  try {
    if (limitKey) {
      const count = reports.get(limitKey) ?? 0;
      if (count >= limit) return;
      reports.set(limitKey, count + 1);
    }
    // The optional client supplies surface, app_version and game context.
    track(event, { ...properties, online: navigator.onLine });
  } catch (error) {
    // Diagnostics must never break loading or mask the original SDK exception.
    console.warn("[Ads diagnostics] Unable to report event", error);
  }
};

/** Do not send arbitrary SDK payloads, ad URLs or user data to analytics. */
export const adErrorProperties = (error: unknown): Record<string, unknown> => {
  const value = error as { name?: unknown; code?: unknown } | null;
  const name = value?.name;
  const code = value?.code;
  return {
    error_type: typeof name === "string" && /^(Error|TypeError|RangeError|ReferenceError|SyntaxError|SecurityError|NetworkError|NotSupportedError)$/.test(name)
      ? name : "unknown",
    ...(typeof code === "number" && Number.isFinite(code) ? { error_code: code } : {}),
  };
};

export const createObservedAd = (
  container: HTMLElement,
  options: OwAdOptions,
): { ad: OwAdInstance; disposeDiagnostics: () => void } => {
  const properties = { container_id: options.containerId };
  const startedAt = Date.now();
  let ad: OwAdInstance;
  try {
    if (!window.OwAd) throw new Error("OwAd is unavailable");
    ad = new window.OwAd(container, options);
  } catch (error) {
    reportAdDiagnostic("AD_CONTAINER_ERROR", {
      ...properties, stage: "constructor", reason: "constructor_threw",
      ...adErrorProperties(error),
    }, `constructor:${options.containerId}`);
    throw error;
  }
  reportAdDiagnostic("AD_CONTAINER_CREATED", {
    ...properties, elapsed_ms: Date.now() - startedAt, sdk_version: ad.version,
  }, `created:${options.containerId}`, 1);

  const onError = (error: unknown) => reportAdDiagnostic("AD_CONTAINER_ERROR", {
    ...properties, stage: "video_load", reason: "sdk_error_event",
    sdk_version: ad.version, ...adErrorProperties(error),
  }, `video_load:${options.containerId}`);

  // The documented video error event is deprecated; absence is not proof of success.
  let subscribed = false;
  try {
    subscribed = ad.addEventListener("error", onError) !== false;
    if (!subscribed) {
      reportAdDiagnostic("AD_CONTAINER_ERROR", {
        ...properties, stage: "diagnostics", reason: "listener_rejected",
      }, `listener:${options.containerId}`);
    }
  } catch (error) {
    console.warn("[Ads diagnostics] Unable to observe SDK errors", error);
    reportAdDiagnostic("AD_CONTAINER_ERROR", {
      ...properties, stage: "diagnostics", reason: "listener_threw", ...adErrorProperties(error),
    }, `listener:${options.containerId}`);
  }
  return {
    ad,
    disposeDiagnostics: () => {
      if (!subscribed) return;
      subscribed = false;
      try { ad.removeEventListener("error", onError); }
      catch (error) { console.warn("[Ads diagnostics] Unable to remove SDK listener", error); }
    },
  };
};
