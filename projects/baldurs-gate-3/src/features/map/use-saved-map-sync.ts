import { track } from "../../services/analytics/analytics";
import { EVENTS } from "../../services/analytics/events";
import { useEffect } from "react";
import { SAVED_MAP_ACCOUNT_PREFIX, SAVED_MAP_CHANGE_EVENT } from "./saved-map-account-storage";
import { setSavedMapSyncStatus, syncSavedMapAccount } from "./saved-map-sync";

/** Debounced writes, periodic remote refresh, and retry after reconnect/focus. */
export const useSavedMapSync = (userId: string | undefined) => {
  useEffect(() => {
    if (!userId) { setSavedMapSyncStatus("idle"); return; }
    let disposed = false;
    let running = false;
    let pending = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const run = async () => {
      if (disposed) return;
      if (running) { pending = true; return; }
      running = true;
      pending = false;
      try {
        await syncSavedMapAccount(userId, () => disposed);
        if (!disposed && failures > 0) track(EVENTS.MAP_SYNC_RECOVERED, { failed_attempts: failures });
        failures = 0;
      } catch (error) {
        if (!disposed) {
          if (failures === 0) {
            // Never send server messages: they can contain user data or URLs.
            const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
            const reason = code === "PGRST205" ? "missing_table"
              : code === "42501" ? "permission_denied"
              : !navigator.onLine ? "offline" : "other";
            track(EVENTS.MAP_SYNC_FAILED, { reason });
          }
          failures++;
          setSavedMapSyncStatus("error");
          console.error("Saved map sync failed; local changes are retained.", error);
        }
      } finally {
        running = false;
        if (!disposed && (pending || failures)) {
          clearTimeout(timer);
          timer = setTimeout(() => void run(), failures ? Math.min(60000, 2000 * 2 ** failures) : 500);
        }
      }
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void run(), 500);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SAVED_MAP_ACCOUNT_PREFIX + userId) schedule();
    };
    const poll = setInterval(() => { if (document.visibilityState === "visible") schedule(); }, 30000);
    window.addEventListener(SAVED_MAP_CHANGE_EVENT, schedule);
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", schedule);
    window.addEventListener("focus", schedule);
    void run();
    return () => {
      disposed = true;
      clearTimeout(timer);
      clearInterval(poll);
      window.removeEventListener(SAVED_MAP_CHANGE_EVENT, schedule);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", schedule);
    };
  }, [userId]);
};
