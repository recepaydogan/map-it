import { useEffect, useRef } from "react";
import { useKeyHints, WASD_HINT_AFTER_MARKERS } from "./use-key-hints";

interface KeyHintTriggerOptions {
  /** The marker whose detail panel is open, or null when nothing is open. */
  selectedId: string | null;
  /** True while Esc would step back (drilled item / combat view / pushed marker)
   * instead of closing the panel outright. */
  canGoBack: boolean;
  /** Set false while this map isn't the one on screen — a hidden map must not
   * fire hints for state the player can't see. */
  enabled?: boolean;
}

/**
 * Turns map state into contextual key hints. Shared by both map surfaces (the
 * Elden Ring data map and Nightreign's live map) so the lessons — and the
 * "already learned" memory behind them — are the same wherever you are.
 */
const useKeyHintTriggers = ({ selectedId, canGoBack, enabled = true }: KeyHintTriggerOptions) => {
  const request = useKeyHints((s) => s.request);
  const dismiss = useKeyHints((s) => s.dismiss);
  const markersOpened = useRef(0);
  const previousId = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const previous = previousId.current;
    previousId.current = selectedId;
    if (!selectedId) {
      dismiss("escClose"); // the panel it was pointing at is gone
      return;
    }
    if (selectedId === previous) return;
    // Every fresh panel is a chance to teach Esc; the store decides whether
    // that lesson still has shows left.
    request("escClose");
    markersOpened.current += 1;
    if (markersOpened.current >= WASD_HINT_AFTER_MARKERS) request("wasdNav");
  }, [dismiss, enabled, request, selectedId]);

  useEffect(() => {
    if (!enabled) return;
    if (canGoBack) request("escBack");
    else dismiss("escBack");
  }, [canGoBack, dismiss, enabled, request]);
};

export default useKeyHintTriggers;
