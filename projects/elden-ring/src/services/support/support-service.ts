import { accountUserId, deviceToken } from "./support-identity";
/**
 * In-app support — the Supabase layer over supabase/support.sql.
 *
 * A report is a THREAD (how the user wants to be addressed + status) plus its
 * MESSAGES. Only its author and the support admin can read one.
 *
 * SIGNING IN IS NOT REQUIRED, AND NO SESSION IS CREATED. Ownership is proven by
 * a DEVICE TOKEN — a random uuid this module keeps in localStorage and presents
 * on every call. The server stores only its SHA-256, and the support tables are
 * unreachable except through SECURITY DEFINER functions that authorise the
 * token first, so a caller can only ever see conversations they hold the token
 * for (or, for staff, all of them).
 *
 * That is why every function here is an rpc() and not a .from() — there is no
 * table-level access to lean on. Signing in is still worth something: the thread
 * is bound to the account as well, so it follows the user to another device, and
 * The notification service adopts reports filed before they had an account.
 */

import i18n from "i18next";
import { getSupabaseClient } from "../../data/supabase-client";

/** The answer time we promise on the compose form. */
export const SUPPORT_REPLY_HOURS = 12;
/** Mirrors the CHECK constraints in supabase/support.sql. */
export const SUPPORT_MAX_NAME = 40;
export const SUPPORT_MAX_BODY = 4000;

export type SupportSender = "user" | "admin";
/** open = waiting on us · answered = we replied last · closed = done. */
export type SupportStatus = "open" | "answered" | "closed";

export interface SupportThread {
  id: string;
  /** What the user asked to be called in the reply. Not an account name. */
  displayName: string;
  /** Null for a report filed without an account. */
  userEmail: string | null;
  status: SupportStatus;
  createdAt: string;
  lastMessageAt: string;
  lastSender: SupportSender;
  userLastReadAt: string | null;
  adminLastReadAt: string | null;
  /** Whether the author was signed in (or has claimed the thread since). */
  hasAccount: boolean;
}

export interface SupportMessage {
  id: string;
  threadId: string;
  /** Which side wrote it. Whether that side is "you" depends on the surface
   *  reading it (the support page vs. the inbox). */
  sender: SupportSender;
  body: string;
  createdAt: string;
  /** Set once the author changed their words after posting. */
  editedAt: string | null;
}

export type SupportResult<T = null> =
  | { ok: true; value: T }
  | { ok: false; error: string };

const ok = <T>(value: T): SupportResult<T> => ({ ok: true, value });
const fail = (error: string): SupportResult<never> => ({ ok: false, error });

/** Server-side errors (ceilings, ownership) → copy that matches the app. */
const FRIENDLY_ERRORS: Array<[match: RegExp, key: string]> = [
  [/too many reports open/i, "support.error.tooManyOpen"],
  [/too many new reports/i, "support.error.tooManyNew"],
  [/too many messages/i, "support.error.tooFast"],
  [/too many reports are coming in/i, "support.error.busy"],
  [/conversation is full/i, "support.error.threadFull"],
  [/no longer exists/i, "support.error.gone"],
  [/not yours to edit|reply as support/i, "support.error.notYours"],
  [/missing device token|is empty|are both required/i, "support.error.empty"],
  [/failed to fetch|network/i, "support.error.offline"],
];

const friendly = (raw: string): string => {
  // The shown copy is deliberately short, and several very different causes map
  // onto the same sentence (a ceiling, a deleted thread, a network drop). Keep
  // the server's own words in the console or every one of them looks identical
  // from the outside.
  console.warn("[support] request failed:", raw);
  const key = FRIENDLY_ERRORS.find(([match]) => match.test(raw))?.[1];
  // Server-side messages are prefixed to keep them greppable in logs; the user
  // doesn't need the namespace.
  return key ? i18n.t(key) : raw.replace(/^support:\s*/, "");
};

export const UNAVAILABLE_KEY = "support.unavailable";

/** False when the build has no Supabase credentials — support needs a server. */
export const isSupportAvailable = (): boolean => getSupabaseClient() !== null;

/* ── Rows ──────────────────────────────────────────────────────────────────── */

interface ThreadRow {
  id: string;
  display_name: string;
  user_email: string | null;
  status: string;
  created_at: string;
  last_message_at: string;
  last_sender: string;
  user_last_read_at: string | null;
  admin_last_read_at: string | null;
  has_account: boolean;
}

interface MessageRow {
  id: string;
  thread_id: string;
  sender: string;
  body: string;
  created_at: string;
  edited_at: string | null;
}

const asStatus = (value: string): SupportStatus =>
  value === "answered" || value === "closed" ? value : "open";

const asSender = (value: string): SupportSender => (value === "admin" ? "admin" : "user");

const toThread = (row: ThreadRow): SupportThread => ({
  id: row.id,
  displayName: row.display_name,
  userEmail: row.user_email,
  status: asStatus(row.status),
  createdAt: row.created_at,
  lastMessageAt: row.last_message_at,
  lastSender: asSender(row.last_sender),
  userLastReadAt: row.user_last_read_at,
  adminLastReadAt: row.admin_last_read_at,
  hasAccount: row.has_account,
});

const toMessage = (row: MessageRow): SupportMessage => ({
  id: row.id,
  threadId: row.thread_id,
  sender: asSender(row.sender),
  body: row.body,
  createdAt: row.created_at,
  editedAt: row.edited_at,
});

/* ── Unread ────────────────────────────────────────────────────────────────── */

const isAfter = (a: string, b: string | null): boolean =>
  b === null || Date.parse(a) > Date.parse(b);

/** A reply the user hasn't opened yet — drives the dot on the support button. */
export const hasUnreadReply = (thread: SupportThread): boolean =>
  thread.lastSender === "admin" && isAfter(thread.lastMessageAt, thread.userLastReadAt);

/** A report the admin hasn't opened since the user last wrote. */
export const needsAdminAttention = (thread: SupportThread): boolean =>
  thread.lastSender === "user" && isAfter(thread.lastMessageAt, thread.adminLastReadAt);

/* ── Reads ─────────────────────────────────────────────────────────────────── */

/** Whether the caller is support staff. Cosmetic — the server re-checks. */
export const isSupportAdmin = async (): Promise<boolean> => {
  const client = getSupabaseClient();
  if (!client) return false;
  if (!(await accountUserId())) return false; // staff always sign in
  const { data, error } = await client.rpc("is_support_admin");
  if (error) {
    console.warn("[support] admin check failed:", error.message);
    return false;
  }
  return data === true;
};

/** The caller's own reports, newest activity first. */
export const fetchMyThreads = async (): Promise<SupportThread[]> => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.rpc("support_list_threads", { p_token: deviceToken() });
  if (error) {
    console.warn("[support] thread fetch failed:", error.message);
    return [];
  }
  return (data as ThreadRow[]).map(toThread);
};

/** Every report, for the admin inbox. Returns nothing to anyone else. */
export const fetchAllThreads = async (): Promise<SupportThread[]> => {
  const client = getSupabaseClient();
  if (!client) return [];
  const { data, error } = await client.rpc("support_inbox_threads");
  if (error) {
    console.warn("[support] inbox fetch failed:", error.message);
    return [];
  }
  return (data as ThreadRow[]).map(toThread);
};

/** A conversation's messages, or NULL when the read itself failed.
 *
 *  The distinction matters: "this thread has no messages" and "we could not
 *  reach the server" both used to arrive as `[]`, and the conversation then
 *  rendered as a blank page that said nothing about which it was. */
export const fetchMessages = async (
  threadId: string,
): Promise<SupportMessage[] | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.rpc("support_thread_messages", {
    p_token: deviceToken(),
    p_thread_id: threadId,
  });
  if (error) {
    console.warn("[support] message fetch failed:", error.message);
    return null;
  }
  return (data as MessageRow[]).map(toMessage);
};

/* ── Writes ────────────────────────────────────────────────────────────────── */

/** File a new report: the thread plus its first message, in one server call so
 *  an inbox entry with nothing in it can never exist. */
export const createThread = async (
  displayName: string,
  body: string,
): Promise<SupportResult<SupportThread>> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t(UNAVAILABLE_KEY));
  const { data, error } = await client.rpc("support_start_thread", {
    p_token: deviceToken(),
    p_display_name: displayName.trim(),
    p_body: body.trim(),
  });
  if (error) return fail(friendly(error.message));
  const row = (data as ThreadRow[])[0];
  if (!row) return fail(friendly("support: the report could not be filed"));
  return ok(toThread(row));
};

/**
 * Add to a conversation. `asAdmin` is the surface speaking — the inbox replies
 * as support, the support page writes as the user — and the server verifies the
 * claim (only staff may set it) rather than inferring the side from ownership.
 */
export const sendMessage = async (
  threadId: string,
  body: string,
  asAdmin: boolean,
): Promise<SupportResult<SupportMessage>> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t(UNAVAILABLE_KEY));
  const { data, error } = await client.rpc("support_post_message", {
    p_token: deviceToken(),
    p_thread_id: threadId,
    p_body: body.trim(),
    p_as_admin: asAdmin,
  });
  if (error) return fail(friendly(error.message));
  const row = (data as MessageRow[])[0];
  if (!row) return fail(friendly("support: the message could not be sent"));
  return ok(toMessage(row));
};

/** Rewrite your own words; the server stamps it as edited. */
export const editMessage = async (
  messageId: string,
  body: string,
): Promise<SupportResult<SupportMessage>> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t(UNAVAILABLE_KEY));
  const { data, error } = await client.rpc("support_edit_message", {
    p_token: deviceToken(),
    p_message_id: messageId,
    p_body: body.trim(),
  });
  if (error) return fail(friendly(error.message));
  const row = (data as MessageRow[])[0];
  if (!row) return fail(friendly("support: the edit could not be saved"));
  return ok(toMessage(row));
};

/** Delete the whole conversation — messages cascade with it. */
export const deleteThread = async (threadId: string): Promise<SupportResult> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t(UNAVAILABLE_KEY));
  const { data, error } = await client.rpc("support_delete_thread", {
    p_token: deviceToken(),
    p_thread_id: threadId,
  });
  if (error) return fail(friendly(error.message));
  if (data !== true) return fail(friendly("support: that conversation no longer exists"));
  return ok(null);
};

/** Close or reopen. "answered" is staff vocabulary and is rejected for users. */
export const setThreadStatus = async (
  threadId: string,
  status: SupportStatus,
): Promise<SupportResult> => {
  const client = getSupabaseClient();
  if (!client) return fail(i18n.t(UNAVAILABLE_KEY));
  const { error } = await client.rpc("support_set_status", {
    p_token: deviceToken(),
    p_thread_id: threadId,
    p_status: status,
  });
  if (error) return fail(friendly(error.message));
  return ok(null);
};

/** Stamp this side's "seen it" marker (which side is decided server-side). */
export const markThreadRead = async (threadId: string): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) return;
  const { error } = await client.rpc("support_mark_read", {
    p_token: deviceToken(),
    p_thread_id: threadId,
  });
  if (error) console.warn("[support] mark read failed:", error.message);
};
