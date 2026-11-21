import { useSupportStore } from "../store/support-store";
import { useNotificationStore } from "../store/notification-store";

/**
 * The support surfaces (page, inbox) read everything through here so the store
 * stays the single copy of a conversation.
 */
export const useSupport = () => {
  const isAdmin = useSupportStore((state) => state.isAdmin);
  const myThreads = useSupportStore((state) => state.myThreads);
  const inboxThreads = useSupportStore((state) => state.inboxThreads);
  const messages = useSupportStore((state) => state.messages);
  const loading = useSupportStore((state) => state.loading);
  const hasLoaded = useSupportStore((state) => state.hasLoaded);
  const loadingThreadId = useSupportStore((state) => state.loadingThreadId);
  const draft = useSupportStore((state) => state.draft);
  const setDraft = useSupportStore((state) => state.setDraft);
  const refresh = useSupportStore((state) => state.refresh);
  const loadMessages = useSupportStore((state) => state.loadMessages);
  const createReport = useSupportStore((state) => state.createReport);
  const post = useSupportStore((state) => state.post);
  const edit = useSupportStore((state) => state.edit);
  const remove = useSupportStore((state) => state.remove);
  const changeStatus = useSupportStore((state) => state.changeStatus);
  const markRead = useSupportStore((state) => state.markRead);

  return {
    isAdmin,
    myThreads,
    inboxThreads,
    messages,
    loading,
    hasLoaded,
    loadingThreadId,
    draft,
    setDraft,
    refresh,
    loadMessages,
    createReport,
    post,
    edit,
    remove,
    changeStatus,
    markRead,
  };
};

export const useSupportBadges = () => {
  const isAdmin = useSupportStore((state) => state.isAdmin);
  const unreadReplies = useNotificationStore((state) => state.unreadReplies);
  const inboxPending = useNotificationStore((state) => state.inboxPending);
  return { isAdmin, unreadReplies, inboxPending };
};
