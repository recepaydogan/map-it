/**
 * Everything the open notes panel needs: what to show, and what the reader can do
 * to it.
 *
 * Two things drive the shape of this hook.
 *
 * FIRST, the TOTAL is not owned here — it lives in the shared count store, so
 * the badge on the button that opened this panel and the number inside it can
 * never disagree, and so posting a note moves both at once.
 *
 * SECOND, loading is DECLARATIVE: `comments === null` means "should be showing
 * notes and hasn't got them", and one effect exists to make that false. Handlers
 * therefore never fetch — changing the sort just clears the list and the effect
 * does the rest, which is why none of them can race. The reset itself runs
 * during render, because the panel swaps markers under this hook rather than
 * remounting (an effect-based reset would paint the previous marker's notes for a
 * frame under the new marker's name).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import {
  areCommentsAvailable,
  deleteComment,
  editComment,
  fetchComments,
  postComment,
  reportComment,
  setCommentHidden,
  voteComment,
  type CommentSort,
  type MarkerComment,
} from "../../services/comments/comments-service";
import { useCommentCountStore } from "../../store/comment-count-store";
import { applyVote, nextVote } from "./comment-vote-math";
import { useCommentCount } from "./use-comment-count";

/** Shared empties, so a reset doesn't allocate one per marker change. */
const NO_REPORTS: ReadonlySet<string> = new Set();
const NO_COMMENTS: MarkerComment[] = [];

export interface MarkerCommentsState {
  /** Null until the count is known — the panel shows no number rather than a
   *  wrong one, and "0" is a real answer that must not be faked while loading. */
  total: number | null;
  comments: MarkerComment[];
  sort: CommentSort;
  loading: boolean;
  /** A write is in flight; the composer and the row actions disable on it. */
  busy: boolean;
  error: string | null;
  hasMore: boolean;
  /** Notes this reader has flagged in this session, so the row can say so. */
  reported: ReadonlySet<string>;
  setSort: (sort: CommentSort) => void;
  loadMore: () => void;
  dismissError: () => void;
  post: (body: string, isSpoiler: boolean) => Promise<boolean>;
  edit: (id: string, body: string, isSpoiler: boolean) => Promise<boolean>;
  remove: (id: string) => Promise<boolean>;
  vote: (id: string, clicked: 1 | -1) => void;
  report: (id: string) => Promise<boolean>;
  /** Staff only — the server re-checks. */
  setHidden: (id: string, hidden: boolean) => Promise<boolean>;
}

export const useMarkerComments = (
  markerKey: string | null,
  /** The signed-in account, or null. Changing it re-reads: "my vote" and "mine"
   *  are answers about the caller, so they are wrong the moment it changes. */
  userId: string | null,
): MarkerCommentsState => {
  /** null = should be showing notes and hasn't loaded them yet. */
  const [comments, setComments] = useState<MarkerComment[] | null>(null);
  const [sort, setSortState] = useState<CommentSort>("top");
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reported, setReported] = useState<ReadonlySet<string>>(NO_REPORTS);

  const total = useCommentCount(markerKey);
  const remember = useCommentCountStore((state) => state.remember);
  const available = areCommentsAvailable();

  /* ── Reset ─────────────────────────────────────────────────────────────── */
  const identity = `${markerKey ?? ""} ${userId ?? ""}`;
  const [prevIdentity, setPrevIdentity] = useState(identity);
  if (identity !== prevIdentity) {
    setPrevIdentity(identity);
    setComments(null);
    setError(null);
    setSortState("top");
    setReported(NO_REPORTS);
    setLoadingMore(false);
  }

  /** The marker being shown right now, for callbacks that resolve after the
   *  reader has moved on. Written in an effect, read only in callbacks. */
  const shownKeyRef = useRef(markerKey);
  useEffect(() => {
    shownKeyRef.current = markerKey;
  }, [markerKey]);

  /* ── Fetching ──────────────────────────────────────────────────────────── */
  // `comments === null` is the entire trigger, so changing the sort works by
  // clearing it. The `cancelled` flag drops a reply that belongs to a marker the
  // reader has already left, instead of painting it under the new marker's name.
  useEffect(() => {
    if (!markerKey || !available) return;
    // A marker known to have nothing needs no request to prove it.
    if (comments !== null || total === 0) return;
    let cancelled = false;

    void fetchComments(markerKey, sort, 0).then((page) => {
      if (cancelled) return;
      setComments(page.comments);
      remember(markerKey, page.total);
    });

    return () => {
      cancelled = true;
    };
  }, [available, comments, markerKey, remember, sort, total]);

  /* ── Reading actions ───────────────────────────────────────────────────── */

  // Clearing the list IS the reload — the effect above picks it up.
  const setSort = useCallback(
    (next: CommentSort) => {
      if (next === sort) return;
      setSortState(next);
      setComments(null);
    },
    [sort],
  );

  const loadMore = useCallback(() => {
    const key = markerKey;
    if (!key || loadingMore || comments === null) return;
    setLoadingMore(true);
    void fetchComments(key, sort, comments.length).then((page) => {
      if (shownKeyRef.current !== key) return;
      setLoadingMore(false);
      // A page that comes back empty says nothing about the total; only a first
      // page is authoritative about how many there are.
      if (page.comments.length === 0) return;
      setComments((prev) => [...(prev ?? []), ...page.comments]);
      remember(key, page.total);
    });
  }, [comments, loadingMore, markerKey, remember, sort]);

  const dismissError = useCallback(() => setError(null), []);

  /* ── Writing actions ───────────────────────────────────────────────────────
     Every list update below is keyed by the comment's uuid through a functional
     update, so a reply that lands after the reader moved on simply matches
     nothing. Only the ones that also move the TOTAL — a marker-scoped number
     shared with the button — need to check which marker is on screen. */

  const post = useCallback(
    async (body: string, isSpoiler: boolean): Promise<boolean> => {
      const key = markerKey;
      if (!key) return false;
      setBusy(true);
      setError(null);
      const result = await postComment(key, body, isSpoiler);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }

      track(EVENTS.MARKER_COMMENT_POSTED, {
        spoiler: isSpoiler,
        length: body.trim().length,
      });
      remember(key, (total ?? 0) + 1);
      // Posted, but the reader has already opened another marker — the note is
      // saved and the badge knows; this list is not the one to put it in.
      if (shownKeyRef.current !== key) return true;

      // Straight to the top whatever the sort is: the reader just wrote it and
      // has to see that it landed. The next load puts it in its real place.
      setComments((prev) => [result.value, ...(prev ?? [])]);
      return true;
    },
    [markerKey, remember, total],
  );

  const edit = useCallback(
    async (id: string, body: string, isSpoiler: boolean): Promise<boolean> => {
      setBusy(true);
      setError(null);
      const result = await editComment(id, body, isSpoiler);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      setComments((prev) => prev?.map((c) => (c.id === id ? result.value : c)) ?? prev);
      return true;
    },
    [],
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      const key = markerKey;
      setBusy(true);
      setError(null);
      const result = await deleteComment(id);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      if (key) remember(key, Math.max(0, (total ?? 1) - 1));
      setComments((prev) => prev?.filter((c) => c.id !== id) ?? prev);
      return true;
    },
    [markerKey, remember, total],
  );

  const vote = useCallback(
    (id: string, clicked: 1 | -1) => {
      // Snapshotted BEFORE the optimistic write, and restored wholesale if the
      // call fails. Re-deriving the old vote from the new one cannot work: an
      // up-vote flipped to a down-vote and a first down-vote both end on -1, and
      // undoing them means two different things.
      const snapshot = comments?.find((comment) => comment.id === id);
      if (!snapshot) return;
      const target = nextVote(snapshot.myVote, clicked);

      setComments((prev) =>
        prev?.map((comment) => (comment.id === id ? applyVote(comment, target) : comment)) ?? prev,
      );

      // The optimistic number is a guess about a shared counter — another window,
      // or another player, may have moved it since this list loaded. The server's
      // answer replaces it rather than being checked against it.
      void voteComment(id, target).then((result) => {
        const settled = result.ok
          ? result.value
          : {
              likeCount: snapshot.likeCount,
              dislikeCount: snapshot.dislikeCount,
              myVote: snapshot.myVote,
            };
        if (!result.ok) setError(result.error);
        setComments(
          (prev) =>
            prev?.map((comment) => (comment.id === id ? { ...comment, ...settled } : comment)) ??
            prev,
        );
      });

      track(EVENTS.MARKER_COMMENT_VOTED, { direction: clicked === 1 ? "up" : "down" });
    },
    [comments],
  );

  const report = useCallback(async (id: string): Promise<boolean> => {
    setBusy(true);
    setError(null);
    const result = await reportComment(id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setReported((prev) => new Set(prev).add(id));
    track(EVENTS.MARKER_COMMENT_REPORTED);
    return true;
  }, []);

  const setHidden = useCallback(
    async (id: string, hidden: boolean): Promise<boolean> => {
      const key = markerKey;
      setBusy(true);
      setError(null);
      const result = await setCommentHidden(id, hidden);
      setBusy(false);
      if (!result.ok) {
        setError(result.error);
        return false;
      }
      // A hidden note stops counting for everyone else, so the badge moves too.
      if (key) remember(key, Math.max(0, (total ?? 0) + (hidden ? -1 : 1)));
      setComments(
        (prev) =>
          prev?.map((c) => (c.id === id ? { ...c, hidden } : c)) ?? prev,
      );
      return true;
    },
    [markerKey, remember, total],
  );

  const resolved = total === 0 ? NO_COMMENTS : comments;

  return {
    total,
    comments: resolved ?? NO_COMMENTS,
    sort,
    loading: resolved === null,
    busy,
    error,
    hasMore: total !== null && resolved !== null && resolved.length < total,
    reported,
    setSort,
    loadMore,
    dismissError,
    post,
    edit,
    remove,
    vote,
    report,
    setHidden,
  };
};
