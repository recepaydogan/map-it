/**
 * How many notes this marker has — the number on the button, fetched once and
 * then remembered.
 *
 * The count is what makes the whole feature affordable: it is one integer, the
 * only thing a marker open ever costs, and a marker with none never loads a
 * list. Both the button and the open panel mount this hook, so the fetch is
 * guarded against firing twice for the same marker.
 */

import { useEffect } from "react";
import {
  isCountFresh,
  useCommentCountStore,
} from "../../store/comment-count-store";
import {
  areCommentsAvailable,
  fetchCommentCounts,
} from "../../services/comments/comments-service";

/** Markers whose count is being fetched right now, so the button and the panel
 *  asking at the same moment still make one request. */
const inFlight = new Set<string>();

export const useCommentCount = (markerKey: string | null): number | null => {
  const entry = useCommentCountStore((state) =>
    markerKey ? state.counts[markerKey] : undefined,
  );
  const remember = useCommentCountStore((state) => state.remember);
  const fresh = isCountFresh(entry);

  useEffect(() => {
    if (!markerKey || !areCommentsAvailable() || fresh) return;
    if (inFlight.has(markerKey)) return;
    inFlight.add(markerKey);
    let cancelled = false;

    void fetchCommentCounts([markerKey])
      .then((counts) => {
        if (cancelled) return;
        remember(markerKey, counts.get(markerKey) ?? 0);
      })
      .finally(() => inFlight.delete(markerKey));

    return () => {
      cancelled = true;
    };
  }, [fresh, markerKey, remember]);

  // Null means "not known yet" — the button shows no badge rather than a wrong
  // zero, and "0" is a real answer that must not be faked while loading.
  return fresh && entry ? entry.count : null;
};
