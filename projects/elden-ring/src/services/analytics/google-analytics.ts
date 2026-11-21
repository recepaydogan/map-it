/**
 * Google Analytics 4 — WEB ONLY.
 *
 * Deliberately never loads inside Overwolf: the native app's pageviews/events
 * stay PostHog's job (see analytics.ts) and must not show up in the GA property.
 * Two guards enforce that: `IS_OVERWOLF` at runtime, and the fact that the
 * Overwolf build has no reason to set VITE_GA_MEASUREMENT_ID at all.
 *
 * Optional — with no measurement id every call is a silent no-op. gtag is
 * loaded lazily with `send_page_view: false`; the app sends page_view itself on
 * every surface change (the SPA pushes History paths, GA wouldn't see them).
 */

import { IS_OVERWOLF } from "../../utils/platform";

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as
  | string
  | undefined;

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let ready = false;
let started = false;

export const isGoogleAnalyticsEnabled = (): boolean => ready;

/** Load gtag.js once. Safe to call from every entry (landing + app); no-op in
 *  Overwolf, in dev, or without a measurement id. */
export const initGoogleAnalytics = (): void => {
  if (started) return;
  started = true;
  if (IS_OVERWOLF || typeof window === "undefined") return;
  if (!MEASUREMENT_ID) return;
  if (import.meta.env.DEV) return; // don't count local dev sessions

  window.dataLayer = window.dataLayer ?? [];
  // gtag must push the `arguments` object itself, not a spread array.
  window.gtag =
    window.gtag ??
    function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer!.push(arguments);
    };
  window.gtag("js", new Date());
  window.gtag("config", MEASUREMENT_ID, {
    send_page_view: false,
    anonymize_ip: true,
  });

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(MEASUREMENT_ID)}`;
  document.head.appendChild(script);
  ready = true;
};

/** Send a page_view for the CURRENT browser location (call after the URL has
 *  been pushed). `title` defaults to document.title. */
export const gaPageview = (props?: Record<string, unknown>): void => {
  if (!ready || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_location: window.location.href,
    page_path: window.location.pathname,
    page_title: document.title,
    ...props,
  });
};

/** Mirror a custom event to GA (flat, primitive props only). */
export const gaEvent = (name: string, props?: Record<string, unknown>): void => {
  if (!ready || !window.gtag) return;
  const flat: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") flat[k] = v;
  }
  window.gtag("event", name, flat);
};
