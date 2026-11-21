/**
 * PostHog analytics — a thin, optional wrapper.
 *
 * The app must boot and work even when PostHog isn't configured: with no
 * VITE_POSTHOG_KEY every call below is a silent no-op. Initialized exactly once
 * per window, and only in windows that render UI a user acts in — the desktop
 * dashboard and the in-game minimap overlay (see use-analytics) — plus the
 * background window, which renders nothing but is the only place the overlay's
 * show/hide can be observed (see background-analytics).
 *
 * Every event carries this window's context (see app-context): which `surface`
 * it came from, the player's display setup, and whether the game is running —
 * merged in at capture time rather than registered as PostHog super properties,
 * because those persist to the localStorage the extension's windows share and
 * would bleed one window's context into another's events.
 *
 * Pageviews are sent manually (the app has no URL routing — "pages" are the
 * dashboard's surfaces) and de-duplicated, so React StrictMode's double-invoke
 * in dev and incidental re-renders can't inflate the counts.
 */

import posthog from "posthog-js";
import {
  type AnalyticsSurface,
  readAppVersion,
  readScreenContext,
} from "./app-context";

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

/** Stands in for the host on the few properties PostHog derives from it —
 *  there is no real host in a desktop app, so the URL column shows the bare
 *  screen path (`/map`) and this only surfaces in host-based breakdowns. */
const APP_HOST = "gamemaps";

/** The path last announced by capturePageview; custom events fired between
 *  pageviews (sign-in, etc.) inherit it when their auto-collected URL is the
 *  opaque overwolf-extension:// one. */
let currentPath = "/";

/** Anything Overwolf-shaped that PostHog collected on its own. */
const isRawExtensionUrl = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith("overwolf-extension://");

/**
 * Replace every raw extension URL PostHog auto-collected with the current
 * screen path. Runs on the full property bag of every event, including the
 * nested `$set` / `$set_once` person properties where `$initial_current_url`
 * hides — miss those and the extension id sticks to the person record forever.
 */
const sanitizeUrlProps = (
  props: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...props };

  for (const key of Object.keys(out)) {
    const value = out[key];
    if (isRawExtensionUrl(value)) {
      out[key] = currentPath;
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      // $set / $set_once carry their own copies of the same keys.
      out[key] = sanitizeUrlProps(value as Record<string, unknown>);
    }
  }

  // PostHog derives these from location directly, so they hold the extension id
  // (or "/index.html") without ever looking like a URL.
  if (out.$pathname === "/index.html") out.$pathname = currentPath;
  if (typeof out.$host === "string" && out.$host !== APP_HOST) out.$host = APP_HOST;

  return out;
};

let started = false; // guards posthog.init against a second call (StrictMode, remounts)
let ready = false; // true once init succeeded; gates every capture/identify

export const isAnalyticsEnabled = (): boolean => ready;

/* ──────────────────────────────────────────────────────────────────────────
 * Per-window context (see app-context for why it isn't posthog.register)
 * ──────────────────────────────────────────────────────────────────────── */

let context: Record<string, unknown> = {};

/** Merge properties into the context stamped on every subsequent event. Pass a
 *  null/undefined value to drop a key (e.g. the game title when it stops). */
export const setAnalyticsContext = (props: Record<string, unknown>): void => {
  context = { ...context, ...props };
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) delete context[key];
  }
};

/** Whether the game is running right now, on every event from here on —
 *  the single most useful split in the whole dataset: it separates
 *  planning-at-the-desk usage from live in-session usage. */
export const setGameRunning = (running: boolean, title?: string | null): void => {
  setAnalyticsContext({
    game_running: running,
    running_game: running ? (title ?? null) : null,
  });
};

/* The display setup and app version are read through Overwolf CALLBACKS, so they
 * land a tick or two after init — while the very events that care about them
 * (app_opened, the first pageview) are sent on that same first tick. So captures
 * queue until the context has landed and are flushed with it, rather than
 * shipping a boot batch with no screen_count on it. The timeout is the escape
 * hatch: if an Overwolf callback never fires, the events still go out. */
const CONTEXT_WAIT_MS = 3000;
let contextPending = true;
const queuedCaptures: (() => void)[] = [];

const flushQueuedCaptures = (): void => {
  contextPending = false;
  while (queuedCaptures.length > 0) queuedCaptures.shift()?.();
};

/** Run a capture now, or as soon as the environment context has landed. */
const withContext = (capture: () => void): void => {
  if (contextPending) queuedCaptures.push(capture);
  else capture();
};

/** Read the display setup + app version once, at boot. Both describe the machine,
 *  not the moment, so there's nothing to keep refreshing. */
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
    flushQueuedCaptures(); // nothing will ever send; don't hold a queue forever
    return;
  }
  posthog.init(KEY, {
    api_host: HOST,
    // Only create person profiles for signed-in users; anonymous events still
    // flow, but we don't mint a profile for every visitor.
    person_profiles: "identified_only",
    // Overwolf's overwolf-extension:// cookies are unreliable; localStorage is
    // stable and — because it's SHARED across the extension's windows — gives the
    // desktop window and the in-game overlay one identity instead of two. (The
    // same sharing is why per-window context never goes through posthog.register.)
    persistence: "localStorage",
    // Send only the intentional events below — no click/DOM autocapture noise.
    autocapture: false,
    // No URL routing here: pageviews are sent manually on surface changes.
    capture_pageview: false,
    // The SDK closes the final manual pageview when its window unloads. The
    // background and minimap windows never send pageviews, so they have no
    // matching page to leave.
    capture_pageleave: surface !== "background" && surface !== "overlay",
    // No session replay in a game companion (heavy + privacy).
    disable_session_recording: true,
    // Rewrite the opaque overwolf-extension:// URLs PostHog collects on its own
    // so the URL column shows bare screen paths ("/map") on every event.
    sanitize_properties: (properties, eventName) =>
      sanitizeUrlProps(eventName === "$pageleave" ? { ...context, ...properties } : properties),
  });
  ready = true;
  loadEnvironmentContext();
};

export const track = (event: string, props?: Record<string, unknown>): void => {
  if (!ready) return;
  withContext(() => posthog.capture(event, { ...context, ...props }));
};

/** Like track(), but for a capture whose window may die moments later (the
 *  overlay hidden during app shutdown, reported from the background): sends via
 *  sendBeacon (a normal request is cancelled with the window) and skips the
 *  context queue — a queued capture would never run, so whatever context has
 *  landed by now ships with it. */
export const trackImmediate = (
  event: string,
  props?: Record<string, unknown>,
): void => {
  if (!ready) return;
  posthog.capture(event, { ...context, ...props }, { transport: "sendBeacon" });
};

// The last pageview captured, so an identical consecutive one is dropped.
let lastPageKey: string | null = null;

/** Capture a pageview for an app surface (path like "/map", "/account"). Drops
 *  an identical consecutive call so StrictMode / re-renders can't double-count. */
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
      // Path alone, no synthetic origin — the URL column reads like a site map
      // ("/map", "/account") instead of a fake https:// host.
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
