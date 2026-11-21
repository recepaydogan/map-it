import { getSupabaseClient } from "../../data/supabase-client";
import { GAME_CONFIG } from "../../game-config";
import {
  activeSavedMapScope, notifySavedMapChange, readAccountBaseline, readAccountSnapshot,
  writeAccountSnapshot,
} from "./saved-map-account-storage";
import { emptySavedMapSnapshot, mergeSavedMapSnapshots, parseSavedMapSnapshot, sameSavedValue } from "./saved-map-merge";

export type SavedMapSyncStatus = "idle" | "syncing" | "synced" | "error";
let status: SavedMapSyncStatus = "idle";
const listeners = new Set<() => void>();
export const getSavedMapSyncStatus = () => status;
export const subscribeSavedMapSync = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const setSavedMapSyncStatus = (next: SavedMapSyncStatus) => {
  if (status === next) return;
  status = next;
  listeners.forEach((listener) => listener());
};

/** Optimistic concurrency prevents a second device from overwriting unseen changes. */
export const syncSavedMapAccount = async (userId: string, cancelled: () => boolean) => {
  const client = getSupabaseClient();
  if (!client) return;
  const current = () => !cancelled() && activeSavedMapScope() === userId;
  const run = async () => {
    if (!current()) return;
    setSavedMapSyncStatus("syncing");
    const session = await client.auth.getSession();
    if (session.error) throw session.error;
    if (session.data.session?.user.id !== userId || !current()) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data: remoteRow, error } = await client.from("map_saved_states")
        .select("payload,revision").eq("user_id", userId).eq("app_id", GAME_CONFIG.appSlug).maybeSingle();
      if (error) throw error;
      if (!current()) return;
      const captured = readAccountSnapshot(userId);
      const baseline = readAccountBaseline(userId);
      const remote = remoteRow ? parseSavedMapSnapshot(remoteRow.payload) : emptySavedMapSnapshot();
      const merged = mergeSavedMapSnapshots(remoteRow ? baseline : null, captured, remote);
      if (!remoteRow || !sameSavedValue(merged, remote)) {
        if (!current()) return;
        if (!remoteRow) {
          const result = await client.from("map_saved_states").insert({ user_id: userId, app_id: GAME_CONFIG.appSlug, payload: merged, revision: 1 });
          if (result.error?.code === "23505") continue;
          if (result.error) throw result.error;
        } else {
          const result = await client.from("map_saved_states")
            .update({ payload: merged, revision: Number(remoteRow.revision) + 1, updated_at: new Date().toISOString() })
            .eq("user_id", userId).eq("app_id", GAME_CONFIG.appSlug).eq("revision", remoteRow.revision)
            .select("revision");
          if (result.error) throw result.error;
          if (!result.data?.length) continue;
        }
      }
      if (!current()) return;
      // Preserve edits made while the request was in flight. They stay pending against merged.
      const latest = readAccountSnapshot(userId);
      const combined = mergeSavedMapSnapshots(captured, latest, merged);
      writeAccountSnapshot(userId, combined, merged);
      if (!sameSavedValue(latest, combined)) notifySavedMapChange();
      setSavedMapSyncStatus(sameSavedValue(combined, merged) ? "synced" : "syncing");
      return;
    }
    throw new Error("Map state changed concurrently; sync will retry.");
  };
  // Desktop and overlay share a storage origin and must not race on the local baseline.
  if (!navigator.locks) throw new Error("Cloud saves require Web Locks to protect multi-window edits.");
  await navigator.locks.request(`saved-map-sync:${userId}`, run);
};
