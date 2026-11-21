/**
 * Community notes on markers — the Supabase layer over supabase/comments.sql.
 *
 * Reading is open to everyone; writing needs an account. That asymmetry is the
 * whole security model: with auth.uid() on every write, a note has an owner, one
 * person gets one vote (it is the votes table's primary key), and a ban means
 * something. The tables themselves carry no client privileges at all, so every
 * function here is an rpc() — there is no table-level access to lean on.
 *
 * The server owns the vote totals. Callers may render an optimistic guess, but
 * they must settle on the numbers voteComment() returns: two windows of this app
 * can be looking at the same note, and only one of them did the arithmetic.
 */

import i18n from "i18next";
import { getSupabaseClient } from "../../data/supabase-client";

/** Mirrors marker_comment_limits() in supabase/comments.sql. */
export const COMMENT_MAX_BODY = 1500;
export const COMMENT_MIN_BODY = 2;
export const COMMENT_PAGE_SIZE = 20;

/** "top" = most upvoted first · "new" = newest first. */
export type CommentSort = "top" | "new";
/** 1 = up, -1 = down, 0 = no vote / taken back. */
export type CommentVote = -1 | 0 | 1;

export interface MarkerComment {
  id: string;
  markerKey: string;
  body: string;
  /** Rendered blurred until the reader opts in. */
  isSpoiler: boolean;
  likeCount: number;
  dislikeCount: number;
  /** Taken out of circulation by reports or staff. Only its author and staff
   *  ever receive one, so a hidden note needs a visible explanation, not a gap. */
  hidden: boolean;
  createdAt: string;
  editedAt: string | null;
  authorName: string;
  isMine: boolean;
  myVote: CommentVote;
}

export interface CommentPage {
  comments: MarkerComment[];
  /** How many the marker has in total, not how many came back. */
  total: number;
}

export interface CommentTotals {
  likeCount: number;
  dislikeCount: number;
  myVote: CommentVote;
}

export type CommentResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): CommentResult<T> => ({ ok: true, value });
const fail = (error: string): CommentResult<never> => ({ ok: false, error });

/** Server-side errors (ceilings, ownership) → copy that matches the app. */
const FRIENDLY_ERRORS: Array<[match: RegExp, key: string]> = [
  [/already said your piece/i, "comments.error.perMarker"],
  [/already posted that note/i, "comments.error.duplicate"],
  [/too many notes/i, "comments.error.tooFast"],
  [/today's limit|today''s limit/i, "comments.error.dailyLimit"],
  [/note is too long/i, "comments.error.tooLong"],
  [/note is empty/i, "comments.error.empty"],
  [/not yours to edit/i, "comments.error.notYours"],
  [/no longer exists/i, "comments.error.gone"],
  [/sign in/i, "comments.error.signIn"],
  [/only staff/i, "comments.error.notYours"],
  [/failed to fetch|network/i, "comments.error.offline"],
];

const friendly = (raw: string): string => {
  // The shown copy is deliberately short and several different causes collapse
  // onto the same sentence, so keep the server's own words in the console or
  // every one of them looks identical from the outside.
  console.warn("[comments] request failed:", raw);
  const key = FRIENDLY_ERRORS.find(([match]) => match.test(raw))?.[1];
  return key ? i18n.t(key) : raw.replace(/^comments:\s*/, "");
};

/** False when the build has no Supabase credentials — notes need a server. */
export const areCommentsAvailable = (): boolean => getSupabaseClient() !== null;

/* ── Rows ──────────────────────────────────────────────────────────────────── */

interface CommentRow {
  id: string;
  marker_key: string;
  body: string;
  is_spoiler: boolean;
  like_count: number;
  dislike_count: number;
  hidden: boolean;
  created_at: string;
  edited_at: string | null;
  author_name: string;
  is_mine: boolean;
  my_vote: number;
  total_count: number;
}

const asVote = (value: unknown): CommentVote =>
  value === 1 || value === -1 ? value : 0;

const toComment = (row: CommentRow): MarkerComment => ({
  id: row.id,
  markerKey: row.marker_key,
  body: row.body,
  isSpoiler: row.is_spoiler,
  likeCount: row.like_count,
  dislikeCount: row.dislike_count,
  hidden: row.hidden,
  createdAt: row.created_at,
  editedAt: row.edited_at,
  authorName: row.author_name,
  isMine: row.is_mine,
  myVote: asVote(row.my_vote),
});

/* ── Reads ─────────────────────────────────────────────────────────────────── */

/**
 * How many notes each of these markers has. Batched by design: the panel asks
 * about one marker, but the same call answers for a screenful when the map grows
 * a note badge. Markers with nothing to say are absent from the map, not zero.
 */
export const fetchCommentCounts = async (
  markerKeys: string[],
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  const client = getSupabaseClient();
  if (!client || markerKeys.length === 0) return counts;

  const { data, error } = await client.rpc("marker_comments_counts", {
    p_marker_keys: markerKeys,
  });
  if (error) {
    console.warn("[comments] count fetch failed:", error.message);
    return counts;
  }
  for (const row of (data ?? []) as Array<{ marker_key: string; comment_count: number }>) {
    counts.set(row.marker_key, row.comment_count);
  }
  return counts;
};

/** One marker's notes, one page at a time. */
export const fetchComments = async (
  markerKey: string,
  sort: CommentSort,
  offset = 0,
): Promise<CommentPage> => {
  const client = getSupabaseClient();
  if (!client) return { comments: [], total: 0 };

  const { data, error } = await client.rpc("marker_comments_list", {
    p_marker_key: markerKey,
    p_sort: sort,
    p_limit: COMMENT_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) {
    console.warn("[comments] list fetch failed:", error.message);
    return { comments: [], total: 0 };
  }

  const rows = (data ?? []) as CommentRow[];
  return {
    comments: rows.map(toComment),
    // The window function puts the same total on every row; an empty page is a
    // genuine zero only when the offset was zero, so the caller keeps its own
    // total when a later page comes back short.
    total: rows[0]?.total_count ?? 0,
  };
};

/* ── Writes ────────────────────────────────────────────────────────────────── */

export const postComment = async (
  markerKey: string,
  body: string,
  isSpoiler: boolean,
): Promise<CommentResult<MarkerComment>> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t("comments.unavailable"));

  const { data, error } = await client.rpc("marker_comment_post", {
    p_marker_key: markerKey,
    p_body: body.trim(),
    p_is_spoiler: isSpoiler,
  });
  if (error) return fail(friendly(error.message));
  const row = (data as CommentRow[])[0];
  if (!row) return fail(friendly("comments: the note could not be posted"));
  return ok(toComment(row));
};

export const editComment = async (
  commentId: string,
  body: string,
  isSpoiler: boolean,
): Promise<CommentResult<MarkerComment>> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t("comments.unavailable"));

  const { data, error } = await client.rpc("marker_comment_edit", {
    p_comment_id: commentId,
    p_body: body.trim(),
    p_is_spoiler: isSpoiler,
  });
  if (error) return fail(friendly(error.message));
  const row = (data as CommentRow[])[0];
  if (!row) return fail(friendly("comments: the edit could not be saved"));
  return ok(toComment(row));
};

export const deleteComment = async (commentId: string): Promise<CommentResult> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t("comments.unavailable"));

  const { data, error } = await client.rpc("marker_comment_delete", {
    p_comment_id: commentId,
  });
  if (error) return fail(friendly(error.message));
  if (data !== true) return fail(friendly("comments: that note no longer exists"));
  return ok(null);
};

/** Vote up (1), down (-1) or take it back (0); returns the settled totals. */
export const voteComment = async (
  commentId: string,
  vote: CommentVote,
): Promise<CommentResult<CommentTotals>> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t("comments.unavailable"));

  const { data, error } = await client.rpc("marker_comment_vote", {
    p_comment_id: commentId,
    p_vote: vote,
  });
  if (error) return fail(friendly(error.message));
  const row = (data as Array<{ like_count: number; dislike_count: number; my_vote: number }>)[0];
  if (!row) return fail(friendly("comments: that note no longer exists"));
  return ok({
    likeCount: row.like_count,
    dislikeCount: row.dislike_count,
    myVote: asVote(row.my_vote),
  });
};

/* ── Moderation queue (staff only) ─────────────────────────────────────────── */

/** Which pile the moderator is working through. */
export type AdminNoteFilter = "all" | "reported" | "unreviewed";

export interface AdminNote {
  id: string;
  markerKey: string;
  body: string;
  isSpoiler: boolean;
  likeCount: number;
  dislikeCount: number;
  /** Distinct players who flagged it. Three is the auto-hide threshold. */
  reportCount: number;
  hidden: boolean;
  createdAt: string;
  editedAt: string | null;
  authorName: string;
  /** This moderator has already looked at it. */
  reviewed: boolean;
}

export interface AdminNotePage {
  notes: AdminNote[];
  total: number;
}

export interface AdminNoteCounts {
  reported: number;
  unreviewed: number;
}

const ADMIN_PAGE_SIZE = 30;

interface AdminNoteRow extends CommentRow {
  report_count: number;
  reviewed: boolean;
}

/** Every note, worst first — reported, then unread, then newest. */
export const fetchAdminNotes = async (
  filter: AdminNoteFilter,
  offset = 0,
): Promise<AdminNotePage> => {
  const client = getSupabaseClient();
  if (!client) return { notes: [], total: 0 };

  const { data, error } = await client.rpc("marker_comments_admin_feed", {
    p_filter: filter,
    p_limit: ADMIN_PAGE_SIZE,
    p_offset: offset,
  });
  if (error) {
    console.warn("[comments] admin feed failed:", error.message);
    return { notes: [], total: 0 };
  }

  const rows = (data ?? []) as AdminNoteRow[];
  return {
    notes: rows.map((row) => ({
      id: row.id,
      markerKey: row.marker_key,
      body: row.body,
      isSpoiler: row.is_spoiler,
      likeCount: row.like_count,
      dislikeCount: row.dislike_count,
      reportCount: row.report_count,
      hidden: row.hidden,
      createdAt: row.created_at,
      editedAt: row.edited_at,
      authorName: row.author_name,
      reviewed: row.reviewed,
    })),
    total: rows[0]?.total_count ?? 0,
  };
};

/** The two numbers behind the moderation badge. Returns zeros for non-staff —
 *  the server answers nothing at all to anyone else, which is the same thing. */
export const fetchAdminNoteCounts = async (): Promise<AdminNoteCounts> => {
  const client = getSupabaseClient();
  if (!client) return { reported: 0, unreviewed: 0 };

  const { data, error } = await client.rpc("marker_comments_admin_counts");
  if (error) {
    console.warn("[comments] admin counts failed:", error.message);
    return { reported: 0, unreviewed: 0 };
  }
  const row = (data as AdminNoteCounts[] | null)?.[0];
  return { reported: row?.reported ?? 0, unreviewed: row?.unreviewed ?? 0 };
};

export const markNoteReviewed = async (
  commentId: string,
  reviewed: boolean,
): Promise<CommentResult> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t("comments.unavailable"));

  const { error } = await client.rpc("marker_comment_mark_reviewed", {
    p_comment_id: commentId,
    p_reviewed: reviewed,
  });
  if (error) return fail(friendly(error.message));
  return ok(null);
};

/**
 * Staff only: take a note out of circulation, or put an auto-hidden one back.
 *
 * Hiding rather than deleting is what moderation should default to — the note is
 * still there to look at, its author still sees it (marked), and restoring it is
 * one click. Deleting someone else's note is also allowed (deleteComment lets
 * staff through), but it is not undoable, so this is the softer instrument.
 */
export const setCommentHidden = async (
  commentId: string,
  hidden: boolean,
): Promise<CommentResult> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t("comments.unavailable"));

  const { error } = await client.rpc("marker_comment_set_hidden", {
    p_comment_id: commentId,
    p_hidden: hidden,
  });
  if (error) return fail(friendly(error.message));
  return ok(null);
};

/** Flag a note. Reporting the same one twice is a no-op, not an error. */
export const reportComment = async (
  commentId: string,
  reason?: string,
): Promise<CommentResult> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t("comments.unavailable"));

  const { error } = await client.rpc("marker_comment_report", {
    p_comment_id: commentId,
    p_reason: reason?.trim() || null,
  });
  if (error) return fail(friendly(error.message));
  return ok(null);
};
