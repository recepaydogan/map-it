import { CHARACTER_PROFILE_CONFIG } from "../../game-config.ts";
import type { CharacterSearchResult } from "./character-profile-api.ts";

export const LAST_CHARACTER_KEY = "character-profiles:last-character";
export const CHARACTER_PROFILE_CHANGE_EVENT = "gm:character-profile-changed";
export const CHARACTER_PROFILE_RELOAD_EVENT = "gm:character-profile-reloaded";

export interface SavedCharacterProfile {
  character: CharacterSearchResult;
  viewedAt: number;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const normalizeSavedCharacterProfile = (value: unknown): SavedCharacterProfile | null => {
  if (!record(value)) return null;
  // Older versions stored the character directly, without a timestamp.
  const character = record(value.character) ? value.character : value;
  if (typeof character.characterId !== "string" || typeof character.name !== "string"
    || typeof character.serverId !== "number" || typeof character.serverName !== "string"
    || !CHARACTER_PROFILE_CONFIG.regions.some((region) => region === character.region)) return null;
  return {
    character: {
      characterId: character.characterId,
      name: character.name,
      level: typeof character.level === "number" ? character.level : 0,
      pcId: typeof character.pcId === "number" ? character.pcId : 0,
      race: typeof character.race === "number" ? character.race : 0,
      region: character.region as CharacterSearchResult["region"],
      serverId: character.serverId,
      serverName: character.serverName,
      profileImageUrl: typeof character.profileImageUrl === "string" ? character.profileImageUrl : undefined,
    },
    viewedAt: typeof value.viewedAt === "number" && Number.isFinite(value.viewedAt) && value.viewedAt > 0
      ? value.viewedAt : 0,
  };
};

export const readLastCharacter = (): SavedCharacterProfile | null => {
  try {
    const raw = localStorage.getItem(LAST_CHARACTER_KEY);
    return raw ? normalizeSavedCharacterProfile(JSON.parse(raw) as unknown) : null;
  } catch (error) {
    console.warn("Could not read the last character profile", error);
    return null;
  }
};

export const saveLastCharacter = (character: CharacterSearchResult): void => {
  localStorage.setItem(LAST_CHARACTER_KEY, JSON.stringify({ character, viewedAt: Date.now() }));
  window.dispatchEvent(new Event(CHARACTER_PROFILE_CHANGE_EVENT));
};
