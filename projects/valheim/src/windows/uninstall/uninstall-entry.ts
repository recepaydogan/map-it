/**
 * Overwolf runs this invisible page for the manifest's required_runtime.
 * Keep it lightweight: hand the survey to the system browser and send analytics
 * without waiting for a response. No React UI or analytics SDK is needed here.
 */
import { EVENTS } from '../../lib/analytics/events'
import { clearPreferences } from '../../store/preferences'

// Published Valheim uninstall survey, opened in the default system browser.
const SURVEY_URL: string = "https://docs.google.com/forms/d/e/1FAIpQLSfcJ5x8_LFEywohwRdKcA81LGxOuERQylsZpNIUxkLOhphhgA/viewform?usp=dialog";

const RAW_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const ANALYTICS_ENABLED = import.meta.env.VITE_POSTHOG_ENABLED === "true";
const KEY = ANALYTICS_ENABLED && RAW_KEY && !/^phc_x{16,}$/i.test(RAW_KEY)
  ? RAW_KEY
  : undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

function getDistinctId(apiKey: string): string | undefined {
  try {
    const raw = localStorage.getItem(`ph_${apiKey}_posthog`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as { distinct_id?: unknown } | null;
    return typeof parsed?.distinct_id === "string" && parsed.distinct_id
      ? parsed.distinct_id
      : undefined;
  } catch {
    return undefined;
  }
}

function captureUninstall(): void {
  if (!KEY) return;
  const distinctId = getDistinctId(KEY);
  if (distinctId) {
    const payload = {
      api_key: KEY,
      event: EVENTS.APP_UNINSTALLED,
      properties: {
        distinct_id: distinctId,
        $current_url: "valheim-companion-uninstall",
        surface: "uninstall"
      },
      timestamp: new Date().toISOString()
    };
    
    const body = JSON.stringify(payload);
    const url = `${HOST.replace(/\/$/, "")}/capture/`;
    // Both transports can outlive this short-lived window.
    try {
      if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) {
        return;
      }
    } catch {
      // A rejected beacon must not prevent the fallback or survey from opening.
    }
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  }
}

function openSurvey(): void {
  const url = SURVEY_URL.trim();
  if (!url || /YOUR-SURVEY-URL/i.test(url)) {
    console.warn("[uninstall] Set SURVEY_URL to the published Valheim form URL.");
    return;
  }

  // The default browser cannot load local extension pages or custom protocols.
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    console.warn("[uninstall] SURVEY_URL must be a public HTTP(S) URL.");
    return;
  }

  if (typeof overwolf !== "undefined" && overwolf.utils?.openUrlInDefaultBrowser) {
    overwolf.utils.openUrlInDefaultBrowser(url);
  } else {
    // Browser-only development fallback; Overwolf uses the OS browser above.
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Each step is independent: analytics/browser failures must not block cleanup.
for (const step of [captureUninstall, openSurvey, clearPreferences]) {
  try {
    step();
  } catch (error) {
    console.warn(`[uninstall] ${step.name} failed`, error);
  }
}
