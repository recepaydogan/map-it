import { getSupabaseClient } from "../../data/supabase-client";
import { parseJourneyProgress, type JourneyProgress } from "./journey-progress";
import { asRevision, type ProgressResult } from "./player-progress-service";

export interface CloudJourneyProgress {
  worldId: string;
  rev: number;
  progress: JourneyProgress;
}

interface JourneyRow {
  world_id: string;
  rev: number | string;
  state: unknown;
}

const failed = (message: string): ProgressResult<never> => {
  console.warn("[Journey sync] Request failed:", message);
  return { ok: false, error: message.replace(/^sync:\s*/, "") };
};

export const pullJourneyProgress = async (worldIds: ReadonlySet<string>): Promise<ProgressResult<CloudJourneyProgress[]>> => {
  const client = getSupabaseClient();
  if (!client) return failed("sync: accounts are not configured in this build");
  const result: CloudJourneyProgress[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await client.from("user_journey_progress")
      .select("world_id, rev, state").order("world_id").range(offset, offset + pageSize - 1);
    if (error) return failed(error.message);
    const rows = (data ?? []) as JourneyRow[];
    for (const row of rows) {
      if (!worldIds.has(row.world_id)) continue;
      result.push({ worldId: row.world_id, rev: asRevision(row.rev),
        progress: parseJourneyProgress(row.state, row.world_id) });
    }
    if (rows.length < pageSize) return { ok: true, value: result };
  }
};

export const pushJourneyProgress = async (worldId: string, expectedRevision: number | null,
  progress: JourneyProgress): Promise<ProgressResult<CloudJourneyProgress>> => {
  const client = getSupabaseClient();
  if (!client) return failed("sync: accounts are not configured in this build");
  const { data, error } = await client.rpc("user_journey_progress_save", {
    p_world_id: worldId,
    p_expected_rev: expectedRevision,
    p_state: { v: 1, ...progress },
  });
  if (error) return failed(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Omit<JourneyRow, "world_id"> | undefined;
  if (!row) return failed("sync: the server returned no journey row");
  return { ok: true, value: { worldId, rev: asRevision(row.rev),
    progress: parseJourneyProgress(row.state, worldId) } };
};
