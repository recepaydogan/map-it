import { useEffect } from "react";
import { getSupabaseClient } from "../data/supabase-client";
import { invalidateNotificationSummary, NOTIFICATION_POLL_MS } from "../services/support/notification-service";
import { useNotificationStore } from "../store/notification-store";

/** Both windows consume one shared, bounded summary instead of polling lists. */
export const useNotificationWatch = (): void => {
  useEffect(() => {
    let disposed = false;
    let account: string | null | undefined;
    let deferred: ReturnType<typeof setTimeout> | undefined;
    const tick = () => {
      if (disposed || !navigator.onLine || document.visibilityState === "hidden") return;
      void useNotificationStore.getState().refresh();
    };
    const { data } = getSupabaseClient()?.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (next === account) return;
      account = next;
      // Leave Supabase's auth lock before issuing any RPC.
      clearTimeout(deferred);
      deferred = setTimeout(() => {
        if (disposed) return;
        useNotificationStore.getState().reset();
        tick();
      }, 0);
    }) ?? { data: null };
    const timer = setInterval(tick, NOTIFICATION_POLL_MS);
    window.addEventListener("online", tick);
    document.addEventListener("visibilitychange", tick);
    const changed = () => {
      invalidateNotificationSummary();
      tick();
    };
    window.addEventListener("atlas:notifications-changed", changed);
    return () => {
      disposed = true;
      clearTimeout(deferred);
      clearInterval(timer);
      data?.subscription.unsubscribe();
      window.removeEventListener("online", tick);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("atlas:notifications-changed", changed);
    };
  }, []);
};
