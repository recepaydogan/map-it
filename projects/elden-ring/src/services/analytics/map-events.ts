/**
 * Map-interaction events.
 *
 * Marker opens are NOT reported one by one: a single browsing session produces
 * dozens of them, and the individual pin (its id, name, region) is identifying
 * detail we don't want to ship. Instead every fifth open sends ONE event
 * describing the batch — what KINDS of things were opened and how they were
 * reached. That keeps the volume sane and the payload categorical.
 *
 * The buffer is per window, in memory: partial batches are best-effort flushed
 * when the window goes away, so a short session isn't silently dropped.
 */
import type { Marker } from "../../data/types";
import type { RawErMapMarker } from "../../features/er-map/types";
import { track } from "./analytics";
import { EVENTS } from "./events";

/** How the player got to the marker — a click on the pin is a very different
 *  signal from arriving via search or a panel link. */
export type MarkerOpenSource =
  | "map"
  | "search"
  | "navigation"
  | "codex"
  | "custom-marker";

/** Opens per reported event. */
const BATCH_SIZE = 5;

interface OpenedMarker {
  category: string;
  source: MarkerOpenSource;
  map: string;
  view: string;
  custom: boolean;
}

let batch: OpenedMarker[] = [];

const unique = (values: string[]): string[] => [...new Set(values)].sort();

/** The kind opened most in this batch — the one value a breakdown can rank on. */
const topCategory = (categories: string[]): string =>
  [...categories]
    .sort(
      (a, b) =>
        categories.filter((c) => c === b).length -
        categories.filter((c) => c === a).length,
    )[0] ?? "";

const record = (opened: OpenedMarker): void => {
  batch.push(opened);
  if (batch.length >= BATCH_SIZE) flushOpenedMarkers();
};

/** Send whatever is buffered (no-op when empty). Called automatically at every
 *  fifth open; exported for the window-teardown flush below. */
export const flushOpenedMarkers = (): void => {
  if (batch.length === 0) return;
  const opened = batch;
  batch = [];

  // Ordered, duplicates kept: "four bosses then a grace" is a different session
  // from "one of each", and the raw sequence is the only place that survives.
  const categories = opened.map((m) => m.category);
  track(EVENTS.MARKERS_OPENED, {
    marker_count: opened.length,
    categories,
    top_category: topCategory(categories),
    open_sources: unique(opened.map((m) => m.source)),
    maps: unique(opened.map((m) => m.map)),
    map_views: unique(opened.map((m) => m.view)),
    custom_count: opened.filter((m) => m.custom).length,
  });
};

// Best effort only: a closing window may not get the request out, which is
// exactly why the batch is small. Nothing else depends on this firing.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushOpenedMarkers);
}

/** Elden Ring map (raw game-data markers). */
export const recordErMarkerOpened = (
  marker: RawErMapMarker,
  options: { view: string; source: MarkerOpenSource },
): void => {
  record({
    category: marker.category,
    source: options.source,
    map: "elden-ring",
    view: options.view,
    custom: Boolean(marker.custom),
  });
};

/** Live map (Elden Ring + the procedural Nightreign layouts). */
export const recordLiveMarkerOpened = (
  marker: Marker,
  options: { source: MarkerOpenSource },
): void => {
  record({
    category: marker.category,
    source: options.source,
    map: marker.game,
    view: marker.layer,
    custom: Boolean(marker.custom),
  });
};
