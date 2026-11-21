/**
 * Uninstall window (manifest.json → data.uninstall_window).
 *
 * Overwolf loads this page invisibly while the app is being uninstalled and
 * keeps the runtime alive for at most `required_runtime` ms, so everything here
 * must be fast and fire-and-forget: no UI, no React, no posthog-js (its event
 * batching could drop the capture when the runtime is torn down).
 *
 * 1. Reports `app_uninstalled` straight to PostHog over HTTP, reusing the
 *    distinct_id posthog-js persisted in localStorage so the event ties to the
 *    same (anonymous) user as the rest of their session data.
 * 2. Opens the uninstall survey (GAME_CONFIG.uninstallSurveyUrl, when set) in
 *    the default browser — openUrlInDefaultBrowser hands the URL to the OS
 *    shell, which outlives this window, so it's fine if we're killed right after.
 */

import { GAME_CONFIG } from "../../game-config";
import { createRuntimeId } from "../../lib/runtime-id";
import { EVENTS } from "../../services/analytics/events";

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

/** posthog-js persists identity under `ph_<key>_posthog` (persistence: "localStorage"). */
const readDistinctId = (apiKey: string): string | null => {
  try {
    const raw = localStorage.getItem(`ph_${apiKey}_posthog`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { distinct_id?: unknown };
    return typeof parsed.distinct_id === "string" ? parsed.distinct_id : null;
  } catch {
    return null;
  }
};

const captureUninstall = (): void => {
  if (!KEY) return;
  const payload = JSON.stringify({
    api_key: KEY,
    event: EVENTS.APP_UNINSTALLED,
    distinct_id: readDistinctId(KEY) ?? `uninstall-${createRuntimeId()}`,
    properties: { $lib: "uninstall-window" },
    timestamp: new Date().toISOString(),
  });
  const url = `${HOST}/i/v0/e/`;
  // sendBeacon survives the window being torn down mid-request; keepalive
  // fetch is the fallback for the same reason.
  const beaconed = navigator.sendBeacon?.(
    url,
    new Blob([payload], { type: "application/json" }),
  );
  if (!beaconed) {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }
};

const openSurvey = (): void => {
  // The system browser cannot load overwolf-extension:// pages, so only a
  // public http(s) URL is ever opened.
  const url = GAME_CONFIG.uninstallSurveyUrl;
  if (!/^https?:\/\//.test(url)) return;
  try {
    if (
      typeof overwolf !== "undefined" &&
      overwolf.utils?.openUrlInDefaultBrowser
    ) {
      overwolf.utils.openUrlInDefaultBrowser(url);
    } else {
      // Outside Overwolf (dev / plain browser) so the flow is testable.
      window.open(url, "_blank");
    }
  } catch {
    /* opening the browser failed — nothing more we can safely do */
  }
};

captureUninstall();
openSurvey();
