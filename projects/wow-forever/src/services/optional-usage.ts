import { createOptionalService } from "../lib/optional-service";
import type { AnalyticsSurface } from "./analytics/app-context";
import type { EVENTS } from "./analytics/events";
import type { recordMarkerOpened as recordMarker } from "./analytics/map-events";

export type { MarkerOpenSource } from "./analytics/map-events";

// Keep all tracking modules outside the application's required import graph.
// A content blocker disables this integration; it must never blank the map.
const service = createOptionalService(
  async () => {
    const [client, events, markers] = await Promise.all([
      import("./analytics/analytics"), import("./analytics/events"), import("./analytics/map-events"),
    ]);
    return { client, events: events.EVENTS, markers };
  },
  error => console.warn("[Analytics] Optional integration unavailable; continuing without analytics.", error),
);

export const initAnalytics = (surface: AnalyticsSurface): void => {
  if (!import.meta.env.VITE_POSTHOG_KEY) {
    service.disable();
    return;
  }
  void service.start(({ client }) => client.initAnalytics(surface));
};

export const track = (event: keyof typeof EVENTS, props?: Record<string, unknown>): void => {
  service.call(({ client, events }) => client.track(events[event], props));
};
export const capturePageview = (path: string, props?: Record<string, unknown>): void => {
  service.call(({ client }) => client.capturePageview(path, props));
};
export const setGameRunning = (running: boolean, title?: string | null): void => {
  service.call(({ client }) => client.setGameRunning(running, title));
};
export const identifyUser = (id: string, props?: Record<string, unknown>): void => {
  service.call(({ client }) => client.identifyUser(id, props));
};
export const resetUser = (): void => {
  service.call(({ client }) => client.resetUser());
};
export const recordMarkerOpened = (...args: Parameters<typeof recordMarker>): void => {
  service.call(({ markers }) => markers.recordMarkerOpened(...args));
};
export const flushOpenedMarkers = (): void => {
  service.call(({ markers }) => markers.flushOpenedMarkers());
};
