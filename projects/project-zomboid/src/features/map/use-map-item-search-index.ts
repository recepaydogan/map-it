import { useEffect, useState } from "react";
import { createMapItemSearchIndex, type MapItemSearchIndex } from "./map-item-search.ts";
import type { MapMetadata } from "./types.ts";

/**
 * The index for the current map, built once and kept.
 *
 * `enabled` holds the ~250k-iteration build off until something asks for it —
 * the search only asks after the first keystroke — and the timeout hands that
 * keystroke a paint before the work starts, so typing never stutters on it. The
 * ref outlives an emptied query, so clearing the box and searching again is
 * free.
 */
export const useMapItemSearchIndex = (
  data: MapMetadata | null | undefined,
  enabled: boolean,
): MapItemSearchIndex | null => {
  const [built, setBuilt] = useState<{
    data: MapMetadata;
    index: MapItemSearchIndex | null;
  } | null>(null);
  const ready = Boolean(data && built?.data === data);

  useEffect(() => {
    if (!enabled || !data || ready) return;
    const handle = window.setTimeout(
      () => setBuilt({ data, index: createMapItemSearchIndex(data) }),
      0,
    );
    return () => window.clearTimeout(handle);
  }, [data, enabled, ready]);

  return ready ? built!.index : null;
};
