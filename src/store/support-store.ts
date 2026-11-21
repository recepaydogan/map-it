/**
 * In-app support state, shared by the support page, the admin inbox and the
 * unread dot in the title bar.
 *
 * Deliberately NOT persisted: the server is the only truth here, and a stale
 * cached copy of a conversation is worse than a spinner. The store's job is to
 * keep one fetch in flight, not to remember anything between runs.
 */

import { create } from "zustand";
import {
  claimDeviceThreads,
  setSupportIdentity,
  createThread,
  deleteThread,
  editMessage,
  fetchAllThreads,
  fetchMessages,
  fetchMyThreads,
  isSupportAdmin,
  markThreadRead,
  sendMessage,
  setThreadStatus,
  type SupportMessage,
  type SupportResult,
  type SupportStatus,
  type SupportThread,
} from "../services/support/support-service";

interface SupportState {
  /** Staff flag from the server (cosmetic gate for the inbox button). */
  isAdmin: boolean;
  /** The caller's own reports. */
  myThreads: SupportThread[];
  /** Every report — populated for staff only. */
  inboxThreads: SupportThread[];
  /** Messages per thread, loaded on demand. `undefined` = not fetched yet,
   *  `null` = the fetch failed (which must not look like an empty thread). */
  messages: Record<string, SupportMessage[] | null>;
  /** True while the first load of this session is still running. */
  loading: boolean;
  /** True once a refresh has completed at least once. The surfaces need to tell
   *  "nothing yet" from "nothing", and a later poll must not read as a first
   *  load — that is what turned a half-written report back into a spinner. */
  hasLoaded: boolean;
  /** Thread whose messages are being fetched right now, if any. */
  loadingThreadId: string | null;
  /** The unsent report being typed. It lives here rather than in the form so
   *  that nothing — a poll, a re-render, closing the panel by accident — can
   *  take someone's words away mid-sentence. `name` is null until the field is
   *  touched, which is what lets the account name prefill it and still be
   *  cleared to empty. */
  draft: { name: string | null; body: string; gameId: string };

  /** Re-read threads. Account changes also claim device reports and check staff
   *  access. A pending account change runs after an in-flight read. */
  refresh: (syncAccount?: boolean) => Promise<void>;
  loadMessages: (threadId: string) => Promise<void>;
  createReport: (
    displayName: string,
    body: string,
    gameId: string,
  ) => Promise<SupportResult<SupportThread>>;
  /** Add to a conversation. `asAdmin` is which surface is speaking — the inbox
   *  replies as support, the support page writes as the user. */
  post: (
    threadId: string,
    body: string,
    asAdmin: boolean,
  ) => Promise<SupportResult<SupportMessage>>;
  edit: (
    threadId: string,
    messageId: string,
    body: string,
  ) => Promise<SupportResult<SupportMessage>>;
  remove: (threadId: string) => Promise<SupportResult>;
  changeStatus: (threadId: string, status: SupportStatus) => Promise<SupportResult>;
  /** Stamp the thread as seen by this side and drop its unread flag locally. */
  markRead: (threadId: string) => Promise<void>;
  /** Keep the unsent report as it is typed. */
  setDraft: (patch: Partial<{ name: string | null; body: string; gameId: string }>) => void;
}

/** Guards against the poller and a screen refreshing over each other. */
let refreshing: Promise<void> | null = null;
let identity: string | null | undefined;
let epoch = 0;
export const resetSupportForAccount = (userId: string | null): void => {
  if (identity === userId) return;
  const hadAccount = Boolean(identity);
  identity = userId;
  epoch++;
  refreshing = null;
  setSupportIdentity(userId);
  useSupportStore.setState({ isAdmin: false, myThreads: [], inboxThreads: [], messages: {}, loading: false, hasLoaded: false, loadingThreadId: null,
    ...(hadAccount ? { draft: { name: null, body: "", gameId: "" } } : {}) });
};

export const useSupportStore = create<SupportState>()((set, get) => ({
  isAdmin: false,
  myThreads: [],
  inboxThreads: [],
  messages: {},
  loading: false,
  hasLoaded: false,
  loadingThreadId: null,
  draft: { name: null, body: "", gameId: "" },

  refresh: async (syncAccount = false) => {
    const current = epoch;
    if (refreshing) {
      await refreshing;
      if (current === epoch && syncAccount) return get().refresh(true);
      return;
    }
    const run = (async () => {
      set({ loading: true });
      try {
        if (syncAccount) await claimDeviceThreads();
        if (current !== epoch) return;
        const admin = syncAccount ? await isSupportAdmin() : get().isAdmin;
        if (current !== epoch) return;
        const [mine, inbox] = await Promise.all([
          fetchMyThreads(),
          admin ? fetchAllThreads() : Promise.resolve([]),
        ]);
        if (current !== epoch) return;
        set({ isAdmin: admin, myThreads: mine, inboxThreads: inbox });
      } finally {
        if (current === epoch) { set({ loading: false, hasLoaded: true }); refreshing = null; }
      }
    })();
    refreshing = run;
    return run;
  },

  loadMessages: async (threadId) => {
    set({ loadingThreadId: threadId });
    const current = epoch;
    const list = await fetchMessages(threadId);
    if (current !== epoch) return;
    set((state) => ({
      messages: { ...state.messages, [threadId]: list },
      loadingThreadId: state.loadingThreadId === threadId ? null : state.loadingThreadId,
    }));
  },

  createReport: async (displayName, body, gameId) => {
    const current = epoch;
    const result = await createThread(displayName, body, gameId);
    if (current !== epoch) return { ok: false, error: "" };
    if (result.ok) {
      // Only once it is safely filed — a failed send must leave the words alone.
      set({ draft: { name: null, body: "", gameId: "" } });
      await get().refresh();
      if (current === epoch) await get().loadMessages(result.value.id);
    }
    return result;
  },

  post: async (threadId, body, asAdmin) => {
    const current = epoch;
    const result = await sendMessage(threadId, body, asAdmin);
    if (current !== epoch) return { ok: false, error: "" };
    if (result.ok) {
      // Append locally so the message appears instantly, then re-read the
      // threads so status / sort order follow the server's trigger.
      set((state) => ({
        messages: {
          ...state.messages,
          [threadId]: [...(state.messages[threadId] ?? []), result.value],
        },
      }));
      await get().refresh();
    }
    return result;
  },

  edit: async (threadId, messageId, body) => {
    const current = epoch;
    const result = await editMessage(messageId, body);
    if (current !== epoch) return { ok: false, error: "" };
    if (result.ok) {
      set((state) => ({
        messages: {
          ...state.messages,
          [threadId]: (state.messages[threadId] ?? []).map((message) =>
            message.id === messageId ? result.value : message,
          ),
        },
      }));
    }
    return result;
  },

  remove: async (threadId) => {
    const current = epoch;
    const result = await deleteThread(threadId);
    if (current !== epoch) return { ok: false, error: "" };
    if (result.ok) {
      set((state) => {
        const messages = { ...state.messages };
        delete messages[threadId];
        return {
          messages,
          myThreads: state.myThreads.filter((thread) => thread.id !== threadId),
          inboxThreads: state.inboxThreads.filter((thread) => thread.id !== threadId),
        };
      });
    }
    return result;
  },

  changeStatus: async (threadId, status) => {
    const current = epoch;
    const result = await setThreadStatus(threadId, status);
    if (current !== epoch) return { ok: false, error: "" };
    if (result.ok) await get().refresh();
    return result;
  },

  markRead: async (threadId) => {
    const current = epoch;
    await markThreadRead(threadId);
    if (current !== epoch) return;
    // Reflect it locally right away — the dot should die on open, not on the
    // next poll. Which stamp moved depends on which side we are, so both are
    // advanced for the row we just opened; the next refresh replaces them with
    // the server's values anyway.
    const now = new Date().toISOString();
    const seen = (thread: SupportThread): SupportThread =>
      thread.id === threadId
        ? { ...thread, userLastReadAt: now, adminLastReadAt: now }
        : thread;
    set((state) => ({
      myThreads: state.myThreads.map(seen),
      inboxThreads: state.inboxThreads.map(seen),
    }));
  },

  setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
}));


