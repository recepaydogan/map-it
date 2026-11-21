import { getSupabaseClient } from "../../data/supabase-client";
import { isOverwolf } from "../../utils/overwolf";
import { accountUserId, deviceToken } from "./support-identity";
import { invalidateCache, readCached, type CacheEntry } from "./notification-cache";

export const NOTIFICATION_POLL_MS = 12 * 60 * 60 * 1000;

export interface NotificationSummary {
  is_admin: boolean;
  unread_replies: number;
  inbox_pending: number;
  reported: number;
  unreviewed: number;
}

interface NotificationEntry extends CacheEntry<NotificationSummary> {
  claimed?: boolean;
}

type NotificationHost = Window & {
  atlasNotifications?: Map<string, NotificationEntry>;
};

/** Overwolf's background window owns the cache across both UI windows. */
const entries = (): Map<string, NotificationEntry> => {
  const host: NotificationHost = isOverwolf()
    ? overwolf.windows.getMainWindow()
    : window;
  return host.atlasNotifications ??= new Map();
};

export const readNotificationSummary = async (): Promise<{
  userId: string | null;
  summary: NotificationSummary;
} | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const userId = await accountUserId();
  const token = deviceToken();
  const key = `${userId ?? "anonymous"}:${token}`;
  const cache = entries();
  let entry = cache.get(key);
  if (!entry) {
    entry = { expiresAt: 0 };
    cache.set(key, entry);
  }
  const current = entry;
  const summary = await readCached(current, async () => {
    if (userId && !current.claimed) {
      const { error } = await client.rpc("support_claim_threads", { p_token: token })
        .abortSignal(AbortSignal.timeout(15_000));
      if (error) throw error;
      current.claimed = true;
    }
    const { data, error } = await client.rpc("notification_summary", { p_token: token })
      .abortSignal(AbortSignal.timeout(15_000));
    if (error) throw error;
    if (await accountUserId() !== userId) {
      throw new Error("Account changed while reading notifications");
    }
    const row = (data as NotificationSummary[] | null)?.[0];
    if (!row) throw new Error("Notification summary returned no row");
    return row;
  }, NOTIFICATION_POLL_MS);
  return { userId, summary };
};

export const invalidateNotificationSummary = (): void => {
  for (const entry of entries().values()) invalidateCache(entry);
};
