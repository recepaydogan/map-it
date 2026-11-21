import { getSupabaseClient } from "../../data/supabase-client";
import { CHARACTER_PROFILE_CONFIG } from "../../game-config";
import { isCharacterProfileData, type CharacterProfileData, type CharacterSearchResult } from "./character-profile-api";
import { readLastCharacter } from "./character-profile-store";
import { clearLeaderboardPageCache } from "../leaderboard/leaderboard-api";

export const LINKED_CHARACTERS_KEY = "character-profiles:linked-characters";
export const LINKED_CHARACTERS_CHANGE_EVENT = "gm:linked-characters-changed";

export interface LinkedCharacter {
  character: CharacterSearchResult;
  linkedAt: number;
  profileSnapshot?: CharacterProfileData;
}

interface CharacterRow {
  user_id: string;
  region: CharacterSearchResult["region"];
  server_id: number;
  character_id: string;
  name: string;
  server_name: string;
  level: number;
  pc_id: number;
  race: number;
  profile_image_url: string | null;
  linked_at: string;
  profile_snapshot: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const characterKey = (character: CharacterSearchResult): string =>
  JSON.stringify([character.region, character.serverId, character.characterId]);

const normalizeLinkedCharacters = (value: unknown): LinkedCharacter[] => {
  if (!Array.isArray(value)) return [];
  const byKey = new Map<string, LinkedCharacter>();
  for (const entry of value) {
    if (!isRecord(entry) || !isRecord(entry.character)) continue;
    const character = entry.character;
    if (typeof character.characterId !== "string" || !character.characterId
      || typeof character.name !== "string" || !character.name
      || typeof character.serverName !== "string" || !character.serverName
      || typeof character.serverId !== "number" || !Number.isInteger(character.serverId)
      || !CHARACTER_PROFILE_CONFIG.regions.some((region) => region === character.region)) continue;
    const normalized: LinkedCharacter = {
      character: {
        characterId: character.characterId,
        name: character.name,
        serverName: character.serverName,
        serverId: character.serverId,
        region: character.region as CharacterSearchResult["region"],
        level: typeof character.level === "number" ? character.level : 0,
        pcId: typeof character.pcId === "number" ? character.pcId : 0,
        race: typeof character.race === "number" ? character.race : 0,
        profileImageUrl: typeof character.profileImageUrl === "string" ? character.profileImageUrl : undefined,
      },
      linkedAt: typeof entry.linkedAt === "number" && Number.isFinite(entry.linkedAt) ? entry.linkedAt : 0,
      profileSnapshot: isCharacterProfileData(entry.profileSnapshot) ? entry.profileSnapshot : undefined,
    };
    const key = characterKey(normalized.character);
    if (!byKey.has(key) || byKey.get(key)!.linkedAt < normalized.linkedAt) byKey.set(key, normalized);
  }
  return [...byKey.values()].sort((a, b) => b.linkedAt - a.linkedAt);
};

/** A missing new key imports the one-character store from older releases. */
export const readGuestLinkedCharacters = (importLegacy = true): LinkedCharacter[] => {
  try {
    const raw = localStorage.getItem(LINKED_CHARACTERS_KEY);
    if (raw !== null) return normalizeLinkedCharacters(JSON.parse(raw) as unknown);
  } catch (error) {
    console.error("Could not read linked characters", error);
    return [];
  }
  const legacy = importLegacy ? readLastCharacter() : null;
  const imported = legacy ? [{ character: legacy.character, linkedAt: legacy.viewedAt }] : [];
  // The last viewed profile is not a link. Migrate it at most once so a later
  // account unlink cannot be undone by a saved profile or a new sign-in.
  localStorage.setItem(LINKED_CHARACTERS_KEY, JSON.stringify(imported));
  return imported;
};

const writeGuest = (characters: LinkedCharacter[]) => {
  localStorage.setItem(LINKED_CHARACTERS_KEY, JSON.stringify(characters));
  window.dispatchEvent(new Event(LINKED_CHARACTERS_CHANGE_EVENT));
};

export const addGuestCharacter = (character: CharacterSearchResult): LinkedCharacter[] => {
  const current = readGuestLinkedCharacters();
  if (current.some((entry) => characterKey(entry.character) === characterKey(character))) return current;
  const next = normalizeLinkedCharacters([{ character, linkedAt: Date.now() }, ...current]);
  writeGuest(next);
  return next;
};

export const removeGuestCharacter = (character: CharacterSearchResult): LinkedCharacter[] => {
  const next = readGuestLinkedCharacters().filter((entry) => characterKey(entry.character) !== characterKey(character));
  writeGuest(next);
  return next;
};

export const saveGuestCharacterProfile = (character: CharacterSearchResult, profile: CharacterProfileData): void => {
  const current = readGuestLinkedCharacters();
  const key = characterKey(character);
  if (!current.some((entry) => characterKey(entry.character) === key)) return;
  writeGuest(current.map((entry) => characterKey(entry.character) === key
    ? { ...entry, profileSnapshot: profile } : entry));
};

const toRow = (userId: string, entry: LinkedCharacter) => ({
  user_id: userId,
  region: entry.character.region,
  server_id: entry.character.serverId,
  character_id: entry.character.characterId,
  name: entry.character.name,
  server_name: entry.character.serverName,
  level: entry.character.level,
  pc_id: entry.character.pcId,
  race: entry.character.race,
  profile_image_url: entry.character.profileImageUrl ?? null,
  profile_snapshot: entry.profileSnapshot ?? null,
  profile_refreshed_at: entry.profileSnapshot ? new Date().toISOString() : null,
  linked_at: entry.linkedAt > 0 ? new Date(entry.linkedAt).toISOString() : new Date().toISOString(),
});

const fromRow = (row: CharacterRow): LinkedCharacter => ({
  character: {
    characterId: row.character_id,
    name: row.name,
    serverId: row.server_id,
    serverName: row.server_name,
    region: row.region,
    level: row.level,
    pcId: row.pc_id,
    race: row.race,
    profileImageUrl: row.profile_image_url ?? undefined,
  },
  linkedAt: Date.parse(row.linked_at),
  profileSnapshot: isCharacterProfileData(row.profile_snapshot) ? row.profile_snapshot : undefined,
});

const accountCache = new Map<string, LinkedCharacter[]>();
const accountLoads = new Map<string, Promise<LinkedCharacter[]>>();

const cacheAccount = (userId: string, characters: LinkedCharacter[]) => {
  accountCache.set(userId, characters);
};

const fetchAccountLinkedCharacters = async (userId: string, guest: LinkedCharacter[]): Promise<LinkedCharacter[]> => {
  const client = getSupabaseClient();
  if (!client) throw new Error("Character storage is unavailable");
  if (guest.length > 0) {
    const { error } = await client.from("user_characters").upsert(guest.map((entry) => toRow(userId, entry)), {
      onConflict: "user_id,region,server_id,character_id", ignoreDuplicates: true,
    });
    if (error) throw error;
    clearLeaderboardPageCache();
    // An explicit empty list prevents older lastCharacter data from being
    // imported again after the merge succeeds.
    writeGuest([]);
  }
  const { data, error } = await client.from("user_characters").select("*")
    .eq("user_id", userId).order("linked_at", { ascending: false });
  if (error) throw error;
  const characters = (data as CharacterRow[]).map(fromRow);
  cacheAccount(userId, characters);
  return characters;
};

export const loadAccountLinkedCharacters = (userId: string): Promise<LinkedCharacter[]> => {
  const pending = accountLoads.get(userId);
  if (pending) return pending;
  const guest = readGuestLinkedCharacters(false);
  const cached = accountCache.get(userId);
  if (guest.length === 0 && cached) return Promise.resolve(cached);
  const promise = fetchAccountLinkedCharacters(userId, guest);
  accountLoads.set(userId, promise);
  void promise.then(() => accountLoads.delete(userId), () => accountLoads.delete(userId));
  return promise;
};

export const addAccountCharacter = async (userId: string, character: CharacterSearchResult): Promise<LinkedCharacter> => {
  const client = getSupabaseClient();
  if (!client) throw new Error("Character storage is unavailable");
  const linked = { character, linkedAt: Date.now() };
  const { error } = await client.from("user_characters").upsert(toRow(userId, linked), {
    onConflict: "user_id,region,server_id,character_id", ignoreDuplicates: true,
  });
  if (error) throw error;
  clearLeaderboardPageCache();
  const cached = accountCache.get(userId);
  if (cached && !cached.some((entry) => characterKey(entry.character) === characterKey(character))) {
    cacheAccount(userId, [linked, ...cached]);
  }
  return linked;
};

export const removeAccountCharacter = async (userId: string, character: CharacterSearchResult): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) throw new Error("Character storage is unavailable");
  const { data, error } = await client.from("user_characters").delete()
    .eq("user_id", userId).eq("region", character.region)
    .eq("server_id", character.serverId).eq("character_id", character.characterId)
    .select("character_id");
  if (error) throw error;
  if (data?.length !== 1) throw new Error("Linked character was not removed");
  clearLeaderboardPageCache();
  const cached = accountCache.get(userId);
  if (cached) cacheAccount(userId, cached.filter((entry) => characterKey(entry.character) !== characterKey(character)));
};

export const saveAccountCharacterProfile = async (userId: string, character: CharacterSearchResult, profile: CharacterProfileData): Promise<void> => {
  const client = getSupabaseClient();
  if (!client) throw new Error("Character storage is unavailable");
  const { error } = await client.from("user_characters")
    .update({ profile_snapshot: profile, profile_refreshed_at: new Date().toISOString() })
    .eq("user_id", userId).eq("region", character.region)
    .eq("server_id", character.serverId).eq("character_id", character.characterId);
  if (error) throw error;
  const cached = accountCache.get(userId);
  if (cached) cacheAccount(userId, cached.map((entry) => characterKey(entry.character) === characterKey(character)
    ? { ...entry, profileSnapshot: profile } : entry));
};
