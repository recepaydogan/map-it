import { create } from "zustand";
import { accountUserId } from "../services/support/support-identity";
import { readNotificationSummary } from "../services/support/notification-service";
import { useSupportStore } from "./support-store";
import { useNotesAdminStore } from "./notes-admin-store";

interface NotificationState {
  unreadReplies: number;
  inboxPending: number;
  refresh: () => Promise<void>;
  reset: () => void;
}

let generation = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadReplies: 0,
  inboxPending: 0,
  reset: () => {
    generation += 1;
    set({ unreadReplies: 0, inboxPending: 0 });
    useSupportStore.setState({
      isAdmin: false, myThreads: [], inboxThreads: [], messages: {}, hasLoaded: false,
    });
    useNotesAdminStore.setState({ counts: { reported: 0, unreviewed: 0 }, notes: [], total: 0 });
  },
  refresh: async () => {
    const expected = generation;
    try {
      const result = await readNotificationSummary();
      if (!result) return;
      const userId = await accountUserId();
      if (expected !== generation || userId !== result.userId) return;
      const { summary } = result;
      set({ unreadReplies: Number(summary.unread_replies), inboxPending: Number(summary.inbox_pending) });
      useSupportStore.setState({ isAdmin: summary.is_admin });
      useNotesAdminStore.setState({
        counts: { reported: summary.reported, unreviewed: summary.unreviewed },
      });
    } catch (error) {
      // Keep the last successful badges; retry on the next scheduled check.
      console.warn("[notifications] refresh failed:", error);
    }
  },
}));
