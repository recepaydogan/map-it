import { CHARACTER_PROFILE_CONFIG } from "../../game-config";

export type CharacterRegion = typeof CHARACTER_PROFILE_CONFIG.regions[number];

export interface CharacterServer {
  serverId: number;
  serverName: string;
}

export interface CharacterSearchResult {
  characterId: string;
  name: string;
  level: number;
  pcId: number;
  race: number;
  region: CharacterRegion;
  serverId: number;
  serverName: string;
  profileImageUrl?: string;
}

export interface CharacterProfile {
  characterId: string;
  characterName: string;
  characterLevel: number;
  className: string;
  combatPower: number;
  profileImage?: string;
  raceName: string;
  serverName: string;
  titleName?: string;
  regionName?: string;
}

export interface CharacterStat {
  name: string;
  type: string;
  value: number;
  statSecondList?: string[] | null;
}

export interface CharacterItem {
  id: number;
  name?: string | null;
  icon?: string;
  grade: string;
  enchantLevel: number;
  exceedLevel: number;
  slotPos: number;
  slotPosName: string;
}

export interface CharacterSkill {
  id: number;
  name: string;
  icon?: string;
  category: string;
  skillLevel: number;
  needLevel: number;
  acquired: number;
  equip: number;
}

export interface CharacterBoard {
  id: number;
  name: string;
  icon?: string;
  open: number;
  openNodeCount: number;
  totalNodeCount: number;
  openPercent: number;
}

export interface CharacterTitle {
  id: number;
  name: string;
  grade: string;
  equipCategory: string;
  ownedCount: number;
  totalCount: number;
}

/** The profile API also returns empty category slots with null title fields. */
export const isCharacterTitle = (value: unknown): value is CharacterTitle =>
  isRecord(value) && typeof value.id === "number" && value.id > 0
  && typeof value.name === "string" && value.name.trim().length > 0
  && typeof value.grade === "string" && typeof value.equipCategory === "string";

export interface CharacterPetWing {
  pet?: { id: number; name?: string | null; icon?: string; level?: number } | null;
  wing?: { id: number; name?: string | null; icon?: string; grade?: string } | null;
  wingSkin?: { id: number; name?: string | null; icon?: string; grade?: string } | null;
}

export interface CharacterProfileData {
  profile: CharacterProfile;
  stats: CharacterStat[];
  rankings: unknown[];
  titles: CharacterTitle[];
  boards: CharacterBoard[];
  equipment: CharacterItem[];
  skins: CharacterItem[];
  skills: CharacterSkill[];
  petWing: CharacterPetWing;
}

const proxyBase = (): string => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim().replace(/\/+$/, "");
  if (!supabaseUrl) throw new Error("Character profile proxy is not configured");
  return `${supabaseUrl}/functions/v1/character-profile`;
};

const request = async (action: string, params: Record<string, string>, signal: AbortSignal, fresh = false): Promise<unknown> => {
  const url = new URL(`${proxyBase()}/${action}`, window.location.href);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  if (fresh) url.searchParams.set("_t", String(Date.now()));
  const response = await fetch(url, { signal, cache: fresh ? "no-store" : "default" });
  if (!response.ok) throw new Error(`Character profile ${action}: HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The official search highlights matching text with HTML tags. Render plain text only. */
const plainName = (value: string): string => value.replace(/<[^>]*>/g, "");

export const loadCharacterServers = async (region: CharacterRegion, signal: AbortSignal): Promise<CharacterServer[]> => {
  const raw = await request("servers", { region, lang: CHARACTER_PROFILE_CONFIG.locale }, signal);
  if (!isRecord(raw) || !Array.isArray(raw.serverList)) throw new Error("Invalid character server response");
  return raw.serverList.map((entry): CharacterServer => {
    if (!isRecord(entry) || typeof entry.serverId !== "number" || typeof entry.serverName !== "string") {
      throw new Error("Invalid character server");
    }
    return { serverId: entry.serverId, serverName: entry.serverName };
  });
};

export const searchCharacters = async (keyword: string, region: CharacterRegion, signal: AbortSignal, page = 1, serverId: number | null = null): Promise<{
  results: CharacterSearchResult[];
  total: number;
  hasMore: boolean;
}> => {
  const raw = await request("search", {
    keyword, region, localeInfo: CHARACTER_PROFILE_CONFIG.locale,
    page: String(page), size: String(CHARACTER_PROFILE_CONFIG.searchPageSize),
    ...(serverId === null ? {} : { serverId: String(serverId) }),
  }, signal);
  if (!isRecord(raw) || !Array.isArray(raw.list) || !isRecord(raw.pagination)) {
    throw new Error("Invalid character search response");
  }
  const results = raw.list.map((entry): CharacterSearchResult => {
    if (!isRecord(entry) || typeof entry.characterId !== "string" || typeof entry.name !== "string"
      || typeof entry.serverId !== "number" || typeof entry.serverName !== "string"
      || typeof entry.level !== "number" || typeof entry.pcId !== "number" || typeof entry.race !== "number") {
      throw new Error("Invalid character search result");
    }
    return {
      characterId: decodeURIComponent(entry.characterId),
      name: plainName(entry.name),
      level: entry.level,
      pcId: entry.pcId,
      race: entry.race,
      region,
      serverId: entry.serverId,
      serverName: entry.serverName,
      profileImageUrl: typeof entry.profileImageUrl === "string" ? entry.profileImageUrl : undefined,
    };
  });
  const total = typeof raw.pagination.total === "number" ? raw.pagination.total : results.length;
  const hasMore = typeof raw.pagination.endPage === "number"
    ? page < raw.pagination.endPage
    : page * CHARACTER_PROFILE_CONFIG.searchPageSize < total;
  return { results, total, hasMore };
};

// A short UI cache must not hide the shared server's three-hour updates.
const PROFILE_CACHE_MS = 60_000;
const profileCache = new Map<string, { data: CharacterProfileData; expiresAt: number }>();

const profileCacheKey = (character: CharacterSearchResult): string =>
  JSON.stringify([character.region, character.serverId, character.characterId, CHARACTER_PROFILE_CONFIG.locale]);

export const readCachedCharacterProfile = (character: CharacterSearchResult): CharacterProfileData | null => {
  const key = profileCacheKey(character);
  const cached = profileCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    profileCache.delete(key);
    return null;
  }
  return cached.data;
};

export const isCharacterProfileData = (value: unknown): value is CharacterProfileData =>
  isRecord(value) && isRecord(value.profile)
  && typeof value.profile.characterName === "string"
  && typeof value.profile.characterLevel === "number"
  && typeof value.profile.className === "string"
  && typeof value.profile.combatPower === "number"
  && Array.isArray(value.stats) && Array.isArray(value.rankings)
  && Array.isArray(value.titles) && Array.isArray(value.boards)
  && Array.isArray(value.equipment) && Array.isArray(value.skins)
  && Array.isArray(value.skills) && isRecord(value.petWing);

const fetchCharacterProfile = async (character: CharacterSearchResult, signal: AbortSignal, fresh: boolean): Promise<CharacterProfileData> => {
  const params = {
    characterId: character.characterId,
    serverId: String(character.serverId),
    region: character.region,
    lang: CHARACTER_PROFILE_CONFIG.locale,
  };
  const data = await request("snapshot", params, signal, fresh);
  if (!isCharacterProfileData(data)) throw new Error("Invalid character profile response");
  return { ...data, titles: data.titles.filter(isCharacterTitle) };
};

export const loadCharacterProfile = async (character: CharacterSearchResult, signal: AbortSignal, fresh = false): Promise<CharacterProfileData> => {
  if (signal.aborted) throw new DOMException("Character profile request was aborted", "AbortError");
  if (!fresh) {
    const cached = readCachedCharacterProfile(character);
    if (cached) return cached;
  }
  const data = await fetchCharacterProfile(character, signal, fresh);
  if (!signal.aborted) profileCache.set(profileCacheKey(character), { data, expiresAt: Date.now() + PROFILE_CACHE_MS });
  return data;
};
