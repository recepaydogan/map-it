import { CHARACTER_PROFILE_CONFIG } from "../../game-config";
import { getSupabaseClient } from "../../data/supabase-client";
import type { CharacterSearchResult } from "../character-profiles/character-profile-api";

export type LeaderboardRegion = typeof CHARACTER_PROFILE_CONFIG.regions[number];

export interface LeaderboardEntry {
  rank: number;
  region: LeaderboardRegion;
  serverId: number;
  characterId: string;
  name: string;
  serverName: string;
  className: string;
  level: number;
  gearScore: number;
  combatPower: number;
  profileImageUrl?: string;
  checkedAt: string;
}

export const leaderboardCharacter = (entry: LeaderboardEntry): CharacterSearchResult => ({
  region: entry.region,
  serverId: entry.serverId,
  characterId: entry.characterId,
  name: entry.name,
  serverName: entry.serverName,
  level: entry.level,
  pcId: 0,
  race: 0,
  profileImageUrl: entry.profileImageUrl,
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseEntry = (value: unknown): LeaderboardEntry => {
  if (!isRecord(value) || !CHARACTER_PROFILE_CONFIG.regions.some((region) => region === value.region)
    || !Number.isInteger(value.rank) || Number(value.rank) < 1
    || !Number.isInteger(value.server_id) || typeof value.character_id !== "string"
    || typeof value.name !== "string" || typeof value.server_name !== "string"
    || typeof value.class_name !== "string" || !Number.isInteger(value.level)
    || !Number.isInteger(value.gear_score) || !Number.isInteger(value.combat_power)
    || typeof value.checked_at !== "string" || !Number.isFinite(Date.parse(value.checked_at))) {
    throw new Error("Invalid leaderboard entry");
  }
  return {
    rank: value.rank as number,
    region: value.region as LeaderboardRegion,
    serverId: value.server_id as number,
    characterId: value.character_id,
    name: value.name,
    serverName: value.server_name,
    className: value.class_name,
    level: value.level as number,
    gearScore: value.gear_score as number,
    combatPower: value.combat_power as number,
    profileImageUrl: typeof value.profile_image_url === "string" ? value.profile_image_url : undefined,
    checkedAt: value.checked_at,
  };
};

const functionUrl = (): string => {
  const base = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("Leaderboard service is not configured");
  return `${base}/functions/v1/character-leaderboard`;
};

export const LEADERBOARD_CACHE_INVALIDATED_EVENT = "gm:leaderboard-cache-invalidated";
export const clearLeaderboardPageCache = (): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(LEADERBOARD_CACHE_INVALIDATED_EVENT));
};

const accessTokenForUser = async (userId: string, signal: AbortSignal): Promise<string | null> => {
  const client = getSupabaseClient();
  if (!client) return null;
  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const session = sessionData.session;
  return session && session.user.id === userId && !signal.aborted ? session.access_token : null;
};

export const refreshLinkedLeaderboardEntry = async (
  character: CharacterSearchResult, userId: string, signal: AbortSignal,
): Promise<void> => {
  const token = await accessTokenForUser(userId, signal);
  if (!token) throw new Error("A signed-in account is required to refresh the leaderboard");
  const response = await fetch(`${functionUrl()}/refresh`, {
    method: "POST", signal, cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ region: character.region, serverId: character.serverId, characterId: character.characterId }),
  });
  if (!response.ok) throw new Error(`Leaderboard refresh: HTTP ${response.status}`);
  clearLeaderboardPageCache();
};

export const loadMyLeaderboardEntries = async (filters: {
  region: LeaderboardRegion | null;
  serverId: number | null;
  query: string;
}, userId: string, signal: AbortSignal): Promise<LeaderboardEntry[]> => {
  const url = new URL(functionUrl());
  url.searchParams.set("mine", "1");
  if (filters.region) url.searchParams.set("region", filters.region);
  if (filters.serverId !== null) url.searchParams.set("serverId", String(filters.serverId));
  if (filters.query) url.searchParams.set("query", filters.query);
  const token = await accessTokenForUser(userId, signal);
  if (!token) return [];
  const response = await fetch(url, {
    signal, cache: "no-store", headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Personal leaderboard: HTTP ${response.status}`);
  const raw: unknown = await response.json();
  if (!isRecord(raw) || !Array.isArray(raw.entries)) {
    throw new Error("Invalid personal leaderboard response");
  }
  return raw.entries.map(parseEntry);
};

export const loadLeaderboardPage = async (filters: {
  region: LeaderboardRegion | null;
  serverId: number | null;
  query: string;
  offset: number;
}, signal: AbortSignal): Promise<{ entries: LeaderboardEntry[]; total: number; syncing: boolean }> => {
  const url = new URL(functionUrl());
  if (filters.region) url.searchParams.set("region", filters.region);
  if (filters.serverId !== null) url.searchParams.set("serverId", String(filters.serverId));
  if (filters.query) url.searchParams.set("query", filters.query);
  url.searchParams.set("offset", String(filters.offset));
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`Leaderboard: HTTP ${response.status}`);
  const raw: unknown = await response.json();
  if (!isRecord(raw) || !Array.isArray(raw.entries) || !Number.isInteger(raw.total)
    || typeof raw.syncing !== "boolean") {
    throw new Error("Invalid leaderboard response");
  }
  return { entries: raw.entries.map(parseEntry), total: raw.total as number, syncing: raw.syncing };
};
