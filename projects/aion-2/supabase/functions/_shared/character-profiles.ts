import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { CHARACTER_PROFILE_CONFIG } from "../../../src/game-config.ts";

declare const Deno: { env: { get: (key: string) => string | undefined } };

export type Identity = { region: string; serverId: number; characterId: string };
export type StoredProfile = {
  info: Record<string, unknown>;
  equipment: Record<string, unknown>;
  snapshot: Record<string, unknown>;
  checkedAt: string;
};
type Claim = { region: string; server_id: number; character_id: string; token: string };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const readIdentity = (value: unknown): Identity | null => {
  if (!isRecord(value) || !CHARACTER_PROFILE_CONFIG.regions.some((region) => region === value.region)
    || !Number.isInteger(value.serverId) || Number(value.serverId) < 1
    || typeof value.characterId !== "string" || !/^[A-Za-z0-9_-]{20,100}={0,2}$/.test(value.characterId)) return null;
  return { region: value.region as string, serverId: value.serverId as number, characterId: value.characterId };
};

export const adminClient = (): SupabaseClient | null => {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
};

const argsFor = (identity: Identity) => ({
  p_region: identity.region, p_server_id: identity.serverId, p_character_id: identity.characterId,
});
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class ProfileUnavailable extends Error {
  constructor(public status: number, public retryAfter = 60) {
    super(`Character profile unavailable: ${status}`);
  }
}

export const retryAfterSeconds = (value: string | null, now = Date.now()): number => {
  const seconds = value && /^\d+$/.test(value) ? Number(value)
    : value ? Math.ceil((Date.parse(value) - now) / 1000) : 60;
  return Number.isFinite(seconds) ? Math.min(86_400, Math.max(60, seconds)) : 60;
};

const list = (value: unknown, name: string): unknown[] => {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`Invalid official profile ${name}`);
  return value;
};

// Validate the complete response before publishing either its profile or rank.
export const normalizeProfile = (info: unknown, equipment: unknown) => {
  if (!isRecord(info) || !isRecord(info.profile) || !isRecord(info.stat)
    || !isRecord(info.ranking) || !isRecord(info.title) || !isRecord(info.daevanion)
    || !isRecord(equipment) || !isRecord(equipment.equipment)
    || !isRecord(equipment.skill) || !isRecord(equipment.petwing)) throw new Error("Incomplete official profile");
  const profile = info.profile;
  const stats = list(info.stat.statList, "stats");
  const score = stats.find((stat) => isRecord(stat) && stat.type === CHARACTER_PROFILE_CONFIG.gearScoreStatType);
  if (score !== undefined && (!isRecord(score) || !Number.isInteger(score.value) || Number(score.value) < 0)
    || ![profile.characterName, profile.serverName, profile.className].every((value) =>
      typeof value === "string" && value.trim().length > 0 && value.length <= 100)
    || !Number.isInteger(profile.characterLevel) || Number(profile.characterLevel) < 0
    || !Number.isInteger(profile.combatPower) || Number(profile.combatPower) < 0) throw new Error("Invalid official profile metrics");
  return {
    summary: {
      name: profile.characterName, server_name: profile.serverName, class_name: profile.className,
      level: profile.characterLevel, gear_score: isRecord(score) ? score.value : 0, combat_power: profile.combatPower,
      profile_image_url: typeof profile.profileImage === "string" ? profile.profileImage : null,
    },
    snapshot: {
      profile, stats, rankings: list(info.ranking.rankingList, "rankings"),
      titles: list(info.title.titleList, "titles").filter((title) => isRecord(title)
        && typeof title.id === "number" && title.id > 0 && typeof title.name === "string" && title.name.trim()
        && typeof title.grade === "string" && typeof title.equipCategory === "string"),
      boards: list(info.daevanion.boardList, "boards"),
      equipment: list(equipment.equipment.equipmentList, "equipment"),
      skins: list(equipment.equipment.skinList, "skins"), skills: list(equipment.skill.skillList, "skills"),
      petWing: equipment.petwing,
    },
  };
};

const fetchOfficial = async (identity: Identity, action: "info" | "equipment") => {
  const url = new URL(`${CHARACTER_PROFILE_CONFIG.detailUrl}/${action}`);
  for (const [key, value] of Object.entries({ ...identity, lang: CHARACTER_PROFILE_CONFIG.locale })) {
    url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(12_000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new ProfileUnavailable(response.status, retryAfterSeconds(response.headers.get("Retry-After")));
  return response.json() as Promise<unknown>;
};

export const readStoredProfile = async (admin: SupabaseClient, identity: Identity): Promise<StoredProfile | null> => {
  const { data, error } = await admin.rpc("read_character_profile", argsFor(identity));
  if (error) throw error;
  return data as StoredProfile | null;
};

export const refreshNextProfile = async (admin: SupabaseClient, identity?: Identity): Promise<boolean> => {
  // The database grants one global lease, shared by scheduled and first-view requests.
  const { data, error } = await admin.rpc("claim_character_profile_job", identity ? argsFor(identity) : {});
  if (error) throw error;
  const claim = (Array.isArray(data) ? data[0] : null) as Claim | null;
  if (!claim) return false;
  const selected = { region: claim.region, serverId: claim.server_id, characterId: claim.character_id };
  try {
    const info = await fetchOfficial(selected, "info");
    await sleep(2000);
    const equipment = await fetchOfficial(selected, "equipment");
    const normalized = normalizeProfile(info, equipment);
    const { data: saved, error: saveError } = await admin.rpc("complete_character_profile_job", {
      p_token: claim.token, p_info: info, p_equipment: equipment,
      p_snapshot: normalized.snapshot, p_summary: normalized.summary,
    });
    if (saveError) throw saveError;
    if (!saved) throw new Error("Character profile refresh lease expired before publication");
    return true;
  } catch (reason) {
    const upstream = reason instanceof ProfileUnavailable ? reason : null;
    const { error: failError } = await admin.rpc("fail_character_profile_job", {
      p_token: claim.token,
      p_error: upstream ? `upstream-${upstream.status}` : "invalid-profile-or-storage-error",
      p_retry_after: upstream?.retryAfter ?? 60,
      p_pause_all: upstream?.status === 429 || (upstream?.status ?? 0) >= 500,
    });
    if (failError) console.error("Could not record character refresh failure", failError);
    throw reason;
  }
};

const pending = new Map<string, Promise<StoredProfile>>();

export const loadStoredProfile = async (admin: SupabaseClient, identity: Identity): Promise<StoredProfile> => {
  const stored = await readStoredProfile(admin, identity);
  if (stored) {
    // Also refresh public previews that have no account link and are therefore
    // outside the recurring queue. A failure keeps the last complete profile.
    if (Date.now() - Date.parse(stored.checkedAt) >= 3 * 60 * 60 * 1000) {
      try {
        if (await refreshNextProfile(admin, identity)) return await readStoredProfile(admin, identity) ?? stored;
      } catch (error) { console.error("Could not refresh an overdue profile; serving its last snapshot", error); }
    }
    return stored;
  }
  const key = JSON.stringify(identity);
  const existing = pending.get(key);
  if (existing) return existing;
  const task = (async () => {
    // Cold views get queue priority; allow an already-running official request
    // to finish before acquiring the shared lease rather than failing early.
    const deadline = Date.now() + 60_000;
    do {
      await refreshNextProfile(admin, identity);
      const result = await readStoredProfile(admin, identity);
      if (result) return result;
      await sleep(1000);
    } while (Date.now() < deadline);
    throw new ProfileUnavailable(503);
  })();
  pending.set(key, task);
  try { return await task; }
  finally { if (pending.get(key) === task) pending.delete(key); }
};
