import { useEffect, useMemo } from "react";
import { hasUnreadReply, needsAdminAttention } from "../services/support/support-service";
import { useSupportStore } from "../store/support-store";
import { useAuth } from "./use-auth";

/** How often the title bar re-checks for a reply while the app is open. */
const POLL_MS = 12 * 60 * 60 * 1000;

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

/**
 * Counts behind the title-bar dots: replies the user hasn't opened, and (for
 * staff) reports still waiting on an answer.
 */
export const useSupportBadges = () => {
  const isAdmin = useSupportStore((state) => state.isAdmin);
  const myThreads = useSupportStore((state) => state.myThreads);
  const inboxThreads = useSupportStore((state) => state.inboxThreads);

  return useMemo(
    () => ({
      isAdmin,
      unreadReplies: myThreads.filter(hasUnreadReply).length,
      inboxPending: inboxThreads.filter(needsAdminAttention).length,
    }),
    [isAdmin, myThreads, inboxThreads],
  );
};

/**
 * Keeps the badges honest while the app is open. Mounted ONCE (the dashboard
 * chrome): polls slowly, and re-reads immediately whenever the account changes
 * — signing in can adopt reports filed anonymously, and signing out must drop
 * the previous account's inbox.
 *
 * A slow poll keeps the badge current eventually; opening support reads the
 * latest threads immediately. Account checks only run when the session changes.
 */
export const useSupportWatch = (): void => {
  const refresh = useSupportStore((state) => state.refresh);
  const { status, user } = useAuth();

  useEffect(() => {
    if (status === "loading") return;
    const tick = (syncAccount = false) => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      void refresh(syncAccount);
    };
    tick(true);
    const timer = setInterval(() => tick(), POLL_MS);
    const onOnline = () => tick(true);
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [refresh, status, user?.id]);
};

