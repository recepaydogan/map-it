import { getSupabaseClient } from "../../data/supabase-client";
import {
  parsePlayerProgress,
  type CloudProgress,
  type PlayerProgress,
} from "./player-progress";

export type ProgressResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string };

interface ProgressRow {
  rev: number | string;
  state: unknown;
}

export const asRevision = (value: number | string): number =>
  typeof value === "number" ? value : Number.parseInt(value, 10) || 0;

const failed = (message: string): ProgressResult<never> => {
  console.warn("[Progress sync] Request failed:", message);
  return { ok: false, error: message.replace(/^sync:\s*/, "") };
};

export const isProgressSyncAvailable = (): boolean => getSupabaseClient() !== null;

export const pullPlayerProgress = async (): Promise<ProgressResult<CloudProgress | null>> => {
  const client = getSupabaseClient();
  if (!client) return failed("sync: accounts are not configured in this build");
  const { data, error } = await client
    .from("user_progress")
    .select("rev, state")
    .maybeSingle();
  if (error) return failed(error.message);
  if (!data) return { ok: true, value: null };
  const row = data as ProgressRow;
  return {
    ok: true,
    value: { rev: asRevision(row.rev), progress: parsePlayerProgress(row.state) },
  };
};

export const pushPlayerProgress = async (
  expectedRevision: number | null,
  progress: PlayerProgress,
): Promise<ProgressResult<CloudProgress>> => {
  const client = getSupabaseClient();
  if (!client) return failed("sync: accounts are not configured in this build");
  const { data, error } = await client.rpc("user_progress_save", {
    p_expected_rev: expectedRevision,
    p_state: { v: 1, ...progress },
  });
  if (error) return failed(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as ProgressRow | undefined;
  if (!row) return failed("sync: the server returned no progress row");
  return {
    ok: true,
    value: { rev: asRevision(row.rev), progress: parsePlayerProgress(row.state) },
  };
};
