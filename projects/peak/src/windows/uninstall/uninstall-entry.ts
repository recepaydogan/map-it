/**
 * Overwolf runs this page invisibly for required_runtime before removal.
 * Hand the survey to the OS browser so it survives uninstall. No React or SDK.
 * Overwolf performs its normal app-data cleanup after this window closes.
 */
import { EVENTS } from "../../utils/analytics/events";

// Public Peak survey generated from scripts/create-uninstall-survey.gs.
const SURVEY_URL: string = "https://docs.google.com/forms/d/e/1FAIpQLScKIkkGCuKOku-3hWgKau7m22mMTEo-1McAwoQ7HAL-7W3-GQ/viewform?usp=dialog";

// Match Peak's existing analytics configuration: no key means no tracking.
const RAW_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const KEY = RAW_KEY && !/^phc_x{16,}$/i.test(RAW_KEY) ? RAW_KEY : undefined;
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? "https://us.i.posthog.com";

function readDistinctId(apiKey: string): string | undefined {
  try {
    const raw = localStorage.getItem(`ph_${apiKey}_posthog`);
    const parsed = raw ? JSON.parse(raw) as { distinct_id?: unknown } | null : null;
    return typeof parsed?.distinct_id === "string" && parsed.distinct_id
      ? parsed.distinct_id
      : undefined;
  } catch {
    return undefined;
  }
}

function captureUninstall(): void {
  if (!KEY) return;
  const distinctId = readDistinctId(KEY);
  if (!distinctId) return;

  const body = JSON.stringify({
    api_key: KEY,
    event: EVENTS.APP_UNINSTALLED,
    properties: {
      distinct_id: distinctId,
      $current_url: "peakmap-uninstall",
      surface: "uninstall",
    },
    timestamp: new Date().toISOString(),
  });
  const url = `${HOST.replace(/\/$/, "")}/capture/`;
  try {
    if (navigator.sendBeacon?.(url, new Blob([body], { type: "application/json" }))) return;
  } catch {
    // A refused beacon can still fall back to a keepalive request.
  }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function openSurvey(): void {
  const url = SURVEY_URL.trim();
  if (!url || /YOUR-SURVEY-URL/i.test(url)) {
    console.warn("[uninstall] Set SURVEY_URL to the published Peak form URL.");
    return;
  }
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) {
    console.warn("[uninstall] SURVEY_URL must be a public HTTP(S) URL.");
    return;
  }
  if (typeof overwolf !== "undefined" && overwolf.utils?.openUrlInDefaultBrowser) {
    overwolf.utils.openUrlInDefaultBrowser(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

// Neither analytics nor browser failures may interrupt the other action.
for (const step of [captureUninstall, openSurvey]) {
  try {
    step();
  } catch (error) {
    console.warn(`[uninstall] ${step.name} failed`, error);
  }
}
