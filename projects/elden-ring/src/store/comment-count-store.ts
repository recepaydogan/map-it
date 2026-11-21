import { create } from "zustand";

/**
 * How many community notes each marker has.
 *
 * This is a STORE rather than a plain module cache because two components need
 * the same number and must never disagree about it: the sticky button at the
 * bottom of the detail panel, and the notes panel it opens beside it. Posting a
 * note in the panel has to move the badge on the button, and they are siblings —
 * neither owns the other.
 *
 * It doubles as the cache that keeps marker opens cheap. Opening a marker is the
 * most repeated action in the app, and on the ER map a click already costs the
 * un-clustering burst; a count that is remembered for a few minutes means
 * clicking back and forth between two bosses asks the server nothing.
 *
 * Deliberately NOT synced across windows: a badge that is stale by minutes is
 * invisible, and a cross-window ping for one integer costs more than it is worth.
 */

const TTL_MS = 5 * 60 * 1000;

interface CountEntry {
  count: number;
  at: number;
}

interface CommentCountStore {
  counts: Record<string, CountEntry>;
  remember: (markerKey: string, count: number) => void;
}

export const useCommentCountStore = create<CommentCountStore>((set) => ({
  counts: {},
  remember: (markerKey, count) =>
    set((state) => ({
      counts: { ...state.counts, [markerKey]: { count, at: Date.now() } },
    })),
}));

/** Whether an entry is still worth trusting. */
export const isCountFresh = (entry: CountEntry | undefined): boolean =>
  entry !== undefined && Date.now() - entry.at < TTL_MS;

/** A non-reactive read, for seeding state during render. Returns undefined when
 *  the marker has never been asked about, or was asked about too long ago. */
export const peekCommentCount = (markerKey: string): number | undefined => {
  const entry = useCommentCountStore.getState().counts[markerKey];
  return isCountFresh(entry) ? entry.count : undefined;
};
