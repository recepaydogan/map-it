import { useCallback, useEffect, useState } from "react";

export interface MapCharacterProfession { id: string; skill: number | null }
export interface MapCharacterProfile {
  id: string;
  name: string;
  raceId: string;
  classId: string;
  faction: "alliance" | "horde";
  level: number;
  professions: MapCharacterProfession[];
}
export type MapCharacterDraft = Omit<MapCharacterProfile, "id">;

const CHARACTERS_KEY = "gta6-app:map-characters:v1";
const SELECTED_KEY = "gta6-app:map-selected-character:v1";
const UPDATED_EVENT = "gta6-app:map-characters-updated";

const readCharacters = (): MapCharacterProfile[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CHARACTERS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MapCharacterProfile =>
      typeof item?.id === "string" && typeof item?.name === "string" &&
      typeof item?.raceId === "string" && typeof item?.classId === "string" &&
      (item?.faction === "alliance" || item?.faction === "horde") &&
      Number.isInteger(item?.level) && item.level >= 1 && item.level <= 60 &&
      Array.isArray(item?.professions));
  } catch { return []; }
};

const readSelectedId = (characters: MapCharacterProfile[]) => {
  const stored = localStorage.getItem(SELECTED_KEY);
  return characters.some((character) => character.id === stored) ? stored : null;
};

export function useMapCharacterProfiles() {
  const [characters, setCharacters] = useState(readCharacters);
  const [selectedId, setSelectedId] = useState(() => readSelectedId(readCharacters()));
  useEffect(() => {
    const sync = () => {
      const next = readCharacters();
      setCharacters(next);
      setSelectedId(readSelectedId(next));
    };
    const onStorage = (event: StorageEvent) => {
      if (!event.key || event.key === CHARACTERS_KEY || event.key === SELECTED_KEY) sync();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(UPDATED_EVENT, sync);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(UPDATED_EVENT, sync);
    };
  }, []);

  const select = useCallback((id: string | null) => {
    const next = id && readCharacters().some((character) => character.id === id) ? id : null;
    if (next) localStorage.setItem(SELECTED_KEY, next);
    else localStorage.removeItem(SELECTED_KEY);
    setSelectedId(next);
    window.dispatchEvent(new Event(UPDATED_EVENT));
  }, []);

  const save = useCallback((draft: MapCharacterDraft, existingId?: string) => {
    const profile: MapCharacterProfile = { ...draft, id: existingId ?? crypto.randomUUID(),
      name: draft.name.trim(), professions: draft.professions.map((profession) => ({ ...profession })) };
    const next = existingId
      ? readCharacters().map((character) => character.id === existingId ? profile : character)
      : [...readCharacters(), profile];
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(next));
    localStorage.setItem(SELECTED_KEY, profile.id);
    setCharacters(next);
    setSelectedId(profile.id);
    window.dispatchEvent(new Event(UPDATED_EVENT));
    return profile;
  }, []);

  const remove = useCallback((id: string) => {
    const next = readCharacters().filter((character) => character.id !== id);
    localStorage.setItem(CHARACTERS_KEY, JSON.stringify(next));
    if (localStorage.getItem(SELECTED_KEY) === id) localStorage.removeItem(SELECTED_KEY);
    const filterPrefix = `gta6-app:character-filters:v1:${id}:`;
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (key?.startsWith(filterPrefix) || key === `gta6-app:filter-rail:open-group:${id}`) localStorage.removeItem(key);
    }
    setCharacters(next);
    setSelectedId(readSelectedId(next));
    window.dispatchEvent(new Event(UPDATED_EVENT));
  }, []);

  return { characters, selectedId, selectedCharacter: characters.find((character) => character.id === selectedId) ?? null,
    select, save, remove };
}
