import { getSupabaseClient } from "../../data/supabase-client";

export const MOD_REQUEST_MAX_LENGTH = 1_000;

export type ModRequestResult =
  | { ok: true }
  | { ok: false; reason: "not-configured" | "invalid" | "failed" };

export const submitModRequest = async (
  request: string,
  userId: string | null,
): Promise<ModRequestResult> => {
  const normalized = request.trim();
  if (!normalized || normalized.length > MOD_REQUEST_MAX_LENGTH) {
    return { ok: false, reason: "invalid" };
  }

  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: "not-configured" };

  const { error } = await client.from("mod_requests").insert({
    request_text: normalized,
    user_id: userId,
    source: "mod-library",
  });

  if (error) {
    console.error("[Mod requests] Submission failed.", error);
    return { ok: false, reason: "failed" };
  }

  return { ok: true };
};
