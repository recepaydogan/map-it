import { create } from "zustand";
import { useSupportStore } from "./support-store";
import {
  deleteComment,
  fetchAdminNoteCounts,
  fetchAdminNotes,
  markNoteReviewed,
  setCommentHidden,
  type AdminNote,
  type AdminNoteCounts,
  type AdminNoteFilter,
} from "../services/comments/comments-service";

/**
 * The moderation queue's state — every community note, and what has been done
 * about it.
 *
 * Staff-only, and the server treats it that way: every call underneath returns
 * nothing at all to a caller who is not an admin, so this store simply holds
 * zeros for everyone else. Whether the moderation button renders is decided by
 * the support store's `isAdmin`, which is already resolved once per window; a
 * second admin check would be the same answer fetched twice.
 */

interface NotesAdminStore {
  counts: AdminNoteCounts;
  notes: AdminNote[];
  total: number;
  filter: AdminNoteFilter;
  loading: boolean;
  /** A moderation write is in flight. */
  busy: boolean;
  refreshCounts: () => Promise<void>;
  load: (filter?: AdminNoteFilter) => Promise<void>;
  loadMore: () => Promise<void>;
  markReviewed: (id: string, reviewed: boolean) => Promise<void>;
  setHidden: (id: string, hidden: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const NO_COUNTS: AdminNoteCounts = { reported: 0, unreviewed: 0 };

export const useNotesAdminStore = create<NotesAdminStore>((set, get) => ({
  counts: NO_COUNTS,
  notes: [],
  total: 0,
  filter: "all",
  loading: false,
  busy: false,

  refreshCounts: async () => {
    if (!useSupportStore.getState().isAdmin) {
      set({ counts: NO_COUNTS });
      return;
    }
    const counts = await fetchAdminNoteCounts();
    if (!useSupportStore.getState().isAdmin) return;
    set({ counts });
  },

  load: async (filter) => {
    const next = filter ?? get().filter;
    set({ loading: true, filter: next });
    const page = await fetchAdminNotes(next, 0);
    // The filter may have moved on while this was in flight; a stale page must
    // not paint under the pile the moderator is now looking at.
    if (get().filter !== next) return;
    set({ notes: page.notes, total: page.total, loading: false });
  },

  loadMore: async () => {
    const { filter, notes, loading } = get();
    if (loading) return;
    const page = await fetchAdminNotes(filter, notes.length);
    if (get().filter !== filter) return;
    if (page.notes.length === 0) return;
    set({ notes: [...get().notes, ...page.notes], total: page.total });
  },

  markReviewed: async (id, reviewed) => {
    // Optimistic: reading a note is the most repeated action in this panel and
    // it must not wait on a round trip. The counts settle from the server after.
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, reviewed } : note)),
    }));
    const result = await markNoteReviewed(id, reviewed);
    if (!result.ok) {
      set((state) => ({
        notes: state.notes.map((note) =>
          note.id === id ? { ...note, reviewed: !reviewed } : note,
        ),
      }));
      return;
    }
    void get().refreshCounts();
  },

  setHidden: async (id, hidden) => {
    set({ busy: true });
    const result = await setCommentHidden(id, hidden);
    set({ busy: false });
    if (!result.ok) return;
    set((state) => ({
      notes: state.notes.map((note) => (note.id === id ? { ...note, hidden } : note)),
    }));
  },

  remove: async (id) => {
    set({ busy: true });
    const result = await deleteComment(id);
    set({ busy: false });
    if (!result.ok) return;
    set((state) => ({
      notes: state.notes.filter((note) => note.id !== id),
      total: Math.max(0, state.total - 1),
    }));
    void get().refreshCounts();
  },
}));
