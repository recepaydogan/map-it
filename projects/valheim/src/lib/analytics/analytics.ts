import posthog from "posthog-js";
import { EVENTS } from "./events";
import type { MapSpoilerMode } from "../valheim/map-spoiler-mode";
import {
  type AnalyticsSurface,
  readAppVersion,
  readScreenContext,
} from "./app-context";

const RAW_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const ANALYTICS_ENABLED = import.meta.env.VITE_POSTHOG_ENABLED === "true";
// The documented example key must never initialize the SDK in local or packaged builds.
const KEY = ANALYTICS_ENABLED && RAW_KEY && !/^phc_x{16,}$/i.test(RAW_KEY)
  ? RAW_KEY
  : undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

const APP_HOST = "valheim-companion";

let currentPath = "/";

const isRawExtensionUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("overwolf-extension://");

const sanitizeUrlProps = (
  props: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...props };

  for (const key of Object.keys(out)) {
    const value = out[key];
    if (isRawExtensionUrl(value)) {
      out[key] = currentPath;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      out[key] = sanitizeUrlProps(value as Record<string, unknown>);
    }
  }

  if (out.$pathname === "/index.html" || out.$pathname === "/app.html") {
    out.$pathname = currentPath;
  }
  if (typeof out.$host === "string" && out.$host !== APP_HOST) out.$host = APP_HOST;

  return out;
};

let started = false;
let ready = false;

export const isAnalyticsEnabled = (): boolean => ready;

let context: Record<string, unknown> = {};

export const setAnalyticsContext = (props: Record<string, unknown>): void => {
  context = { ...context, ...props };
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) delete context[key];
  }
};

export const setGameRunning = (running: boolean, title?: string | null): void => {
  setAnalyticsContext({
    game_running: running,
    running_game: running ? (title ?? null) : null,
  });
};

const CONTEXT_WAIT_MS = 3000;
let contextPending = true;
const queuedCaptures: (() => void)[] = [];

const flushQueuedCaptures = (): void => {
  contextPending = false;
  while (queuedCaptures.length > 0) queuedCaptures.shift()?.();
};

const withContext = (capture: () => void): void => {
  if (contextPending) queuedCaptures.push(capture);
  else capture();
};

const loadEnvironmentContext = (): void => {
  void Promise.allSettled([
    readScreenContext().then(setAnalyticsContext),
    readAppVersion().then(
      (version) => version && setAnalyticsContext({ app_version: version }),
    ),
  ]).then(flushQueuedCaptures);
  setTimeout(flushQueuedCaptures, CONTEXT_WAIT_MS);
};

export const initAnalytics = (surface: AnalyticsSurface): void => {
  if (started) return;
  started = true;
  setAnalyticsContext({ surface });
  if (!KEY) {
    console.warn("[Analytics] VITE_POSTHOG_KEY not set — analytics disabled.");
    flushQueuedCaptures();
    return;
  }
  posthog.init(KEY, {
    api_host: HOST,
    person_profiles: "identified_only",
    persistence: "localStorage",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    sanitize_properties: (properties) => sanitizeUrlProps(properties),
    before_send: (event) => {
      if (!event || event.event !== EVENTS.MAP_SPOILER_MODE_CHANGED) return event;
      const properties: Record<string, unknown> = {
        from: event.properties.from,
        to: event.properties.to,
      };
      // Keep only the SDK's required ingestion/identity and profile controls.
      // Device, URL, session and app context are unnecessary for this change.
      for (const key of ["token", "distinct_id", "$cookieless_mode", "$process_person_profile"]) {
        if (key in event.properties) properties[key] = event.properties[key];
      }
      return { uuid: event.uuid, event: event.event, timestamp: event.timestamp, properties };
    },
  });
  ready = true;
  loadEnvironmentContext();
};

export const track = (event: string, props?: Record<string, unknown>): void => {
  if (!ready) return;
  withContext(() => posthog.capture(event, { ...context, ...props }));
};

/** User action only; no environment context or duplicate selections. */
export const trackSpoilerModeChanged = (from: MapSpoilerMode, to: MapSpoilerMode): void => {
  if (!ready || from === to) return;
  posthog.capture(EVENTS.MAP_SPOILER_MODE_CHANGED, { from, to });
};

export const trackImmediate = (
  event: string,
  props?: Record<string, unknown>,
): void => {
  if (!ready) return;
  posthog.capture(event, { ...context, ...props }, { transport: "sendBeacon" });
};

/** Craft events deliberately include only these two environment properties. */
export const trackCraftEvent = (event: string, props: Record<string, unknown>): void => {
  if (!ready) return;
  withContext(() => posthog.capture(event, {
    ...(context.screen_count != null ? { screen_count: context.screen_count } : {}),
    ...(context.app_version != null ? { app_version: context.app_version } : {}),
    ...props,
  }, { transport: "sendBeacon" }));
};

let lastPageKey: string | null = null;

export const capturePageview = (
  path: string,
  props?: Record<string, unknown>,
): void => {
  if (!ready) return;
  const key = `${path}|${JSON.stringify(props ?? {})}`;
  if (key === lastPageKey) return;
  lastPageKey = key;
  currentPath = path;
  withContext(() =>
    posthog.capture("$pageview", {
      ...context,
      $current_url: path,
      $pathname: path,
      ...props,
    }),
  );
};

export const identifyUser = (
  id: string,
  props?: Record<string, unknown>,
): void => {
  if (!ready) return;
  // Idempotent for the same id, so it's safe to call on every auth event.
  posthog.identify(id, props);
};

export const resetUser = (): void => {
  if (!ready) return;
  posthog.reset();
  // Next pageview after a reset should always send (new anonymous identity).
  lastPageKey = null;
};
