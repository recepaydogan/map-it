/**
 * Map-interaction events.
 *
 * Location opens are NOT reported one by one: a single browsing session produces
 * dozens of them, and the individual place (its id, name, region) is identifying
 * detail we don't want to ship. Instead every fifth open sends ONE event
 * describing the batch — what KINDS of places were opened and how they were
 * reached. That keeps the volume sane and the payload categorical.
 *
 * The buffer is per window, in memory: partial batches are best-effort flushed
 * when the window goes away, so a short session isn't silently dropped.
 */
import type { MapPoint } from "../../features/map/types";
import { track } from "./analytics";
import { EVENTS } from "./events";

/** How the player got to the location — a click on the map pin is a very
 *  different signal from arriving via the search results or a saved list. */
export type MarkerOpenSource = "map" | "sidebar";

/** Opens per reported event. */
const BATCH_SIZE = 5;

interface OpenedMarker {
  category: string;
  source: MarkerOpenSource;
  map: string;
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

/** Send whatever is buffered (no-op when empty). */
export const flushOpenedMarkers = (): void => {
  if (batch.length === 0) return;
  const opened = batch;
  batch = [];

  const categories = opened.map((m) => m.category);
  track(EVENTS.MARKERS_OPENED, {
    marker_count: opened.length,
    categories,
    top_category: topCategory(categories),
    open_sources: unique(opened.map((m) => m.source)),
    maps: unique(opened.map((m) => m.map)),
    custom_count: opened.filter((m) => m.custom).length,
  });
};

// Best effort only: a closing window may not get the request out, which is
// exactly why the batch is small. Nothing else depends on this firing.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", flushOpenedMarkers);
}

/** Record one opened location/marker; ships as part of the next batch. */
export const recordMarkerOpened = (
  point: MapPoint,
  options: { map: string; source: MarkerOpenSource },
): void => {
  batch.push({
    category: point.category,
    source: options.source,
    map: options.map,
    custom: point.category === "custom",
  });
  if (batch.length >= BATCH_SIZE) flushOpenedMarkers();
};
