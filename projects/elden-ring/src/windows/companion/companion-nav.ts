import { useCallback, useState } from "react";
import { markersByGame } from "../../data/markers";
import type { Marker } from "../../data/types";

/**
 * One page in a tab's history.
 *
 * `build` is its own entry rather than a flag on `marker`, so Back off the build
 * page lands on the boss page — and an item opened FROM the build page returns
 * to the build page (level/style intact), exactly like the dashboard panel.
 *
 * Regular enemies get their own two kinds rather than reusing `marker`/`build`:
 * they aren't in the bundled marker set at all (see companion-enemy-catalog), so
 * they're addressed by their ER-map record id and their page is assembled from
 * that record plus its enemy profile.
 */
export type CompanionView =
  | { kind: "marker"; markerId: string }
  | { kind: "build"; markerId: string }
  | { kind: "item"; itemKey: string }
  | { kind: "enemy"; enemyId: string }
  | { kind: "enemy-combat"; enemyId: string };

export interface CompanionStackState {
  stack: CompanionView[];
  push: (view: CompanionView) => void;
  pop: () => void;
  reset: () => void;
  /** Replace the whole stack — used when a root list picks a new starting page. */
  open: (view: CompanionView) => void;
}

/** Per-tab history. Each tab keeps its own, so switching tabs and coming back
 *  returns you to the page you were reading, not to the list. */
export const useCompanionStack = (
  initial: CompanionView[] | (() => CompanionView[]) = [],
): CompanionStackState => {
  const [stack, setStack] = useState<CompanionView[]>(initial);
  const push = useCallback((view: CompanionView) => setStack((s) => [...s, view]), []);
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const reset = useCallback(() => setStack([]), []);
  const open = useCallback((view: CompanionView) => setStack([view]), []);
  return { stack, push, pop, reset, open };
};

/** id → marker over EVERY Elden Ring marker, not just the boss catalog: a drop
 *  source can be any pin, and "where to find" rows are plain locations. */
export const buildMarkerIndex = (): Map<string, Marker> =>
  new Map(markersByGame["elden-ring"].map((marker) => [marker.id, marker]));
