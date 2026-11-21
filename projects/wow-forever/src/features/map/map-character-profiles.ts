import { useCallback, useEffect, useState, useSyncExternalStore } from "react";

export interface MapCharacterProfession { id: string; skill: number | null }
export interface MapCharacterProfile {
  id: string;
  name: string;
  raceId: string;
  classId: string;
  faction: "alliance" | "horde" | null;
  level: number | null;
  professions: MapCharacterProfession[];
  professionsKnown?: boolean;
  source?: "addon" | "gep";
  realm?: string;
  syncedAt?: number;
}
export type MapCharacterDraft = Omit<MapCharacterProfile, "id">;

const CHARACTERS_KEY = "gm:map-characters:v1";
const SELECTED_KEY = "gm:map-selected-character:v1";
const SAVED_CURRENT_KEY = "gm:map-saved-current-character:v1";
const SAVED_CURRENT_AT_KEY = "gm:map-saved-current-character-at:v1";
const REMOVED_CHARACTERS_KEY = "gm:map-removed-characters:v1";
const UPDATED_EVENT = "gm:map-characters-updated";

const subscribeSelection = (listener: () => void) => {
  const changed = (event: Event) => {
    if (!(event instanceof StorageEvent) || !event.key || event.key === SELECTED_KEY) listener();
  };
  window.addEventListener("storage", changed);
  window.addEventListener(UPDATED_EVENT, changed);
  return () => {
    window.removeEventListener("storage", changed);
    window.removeEventListener(UPDATED_EVENT, changed);
  };
};
const selectedSnapshot = () => {
  try { return localStorage.getItem(SELECTED_KEY) || null; } catch { return null; }
};
/** Read-only consumers need only the selection, not a parsed copy of every profile. */
export const useSelectedMapCharacterId = () => useSyncExternalStore(subscribeSelection, selectedSnapshot, () => null);

function readRemovedCharacters(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(REMOVED_CHARACTERS_KEY) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : []);
  } catch { return new Set(); }
}

/** Keep manual profiles intact; imported identities are stable across reloads. */
export function importAddonCharacters(profiles: MapCharacterProfile[], currentId: string | null, previousCurrentId: string | null, savedCurrentId?: string | null, savedCurrentAt?: number) {
  const existing = readCharacters();
  const removed = readRemovedCharacters();
  const visibleProfiles = profiles.filter(profile => !removed.has(profile.id) && (profile.source !== "gep" || Boolean(profile.name.trim())));
  const imported = new Map(visibleProfiles.map(profile => [profile.id, profile]));
  const merged = existing.map(profile => imported.get(profile.id) ?? profile);
  for (const profile of visibleProfiles) if (!existing.some(item => item.id === profile.id)) merged.push(profile);
  const serialized = JSON.stringify(merged);
  if (localStorage.getItem(CHARACTERS_KEY) !== serialized) localStorage.setItem(CHARACTERS_KEY, serialized);
  const selectedId = localStorage.getItem(SELECTED_KEY);
  const selected = merged.find(profile => profile.id === selectedId);
  const savedCurrent = savedCurrentId ? imported.get(savedCurrentId) : undefined;
  const freshSave = typeof savedCurrentAt === "number" && Number.isFinite(savedCurrentAt) &&
    savedCurrentAt > Number(localStorage.getItem(SAVED_CURRENT_AT_KEY) ?? 0);
  if (savedCurrent && (freshSave || savedCurrent.id !== localStorage.getItem(SAVED_CURRENT_KEY))) {
    // A new saved snapshot confirms the played character even when its identity is unchanged.
    if (freshSave || !selected || selected.source) localStorage.setItem(SELECTED_KEY, savedCurrent.id);
    localStorage.setItem(SAVED_CURRENT_KEY, savedCurrent.id);
    if (freshSave) localStorage.setItem(SAVED_CURRENT_AT_KEY, String(savedCurrentAt));
  } else if (currentId && merged.some(profile => profile.id === currentId) && (!selected || selected.id === previousCurrentId)) {
    if (selectedId !== currentId) localStorage.setItem(SELECTED_KEY, currentId);
  }
  window.dispatchEvent(new Event(UPDATED_EVENT));
}

const readCharacters = (): MapCharacterProfile[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CHARACTERS_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MapCharacterProfile =>
      typeof item?.id === "string" && typeof item?.name === "string" &&
      (item.source !== "gep" || Boolean(item.name.trim())) &&
      typeof item?.raceId === "string" && typeof item?.classId === "string" &&
      (item?.faction === "alliance" || item?.faction === "horde" || (item.source === "gep" && item.faction === null)) &&
      ((Number.isInteger(item?.level) && item.level >= 1 && item.level <= 100) || (item.source === "gep" && item.level === null)) &&
      Array.isArray(item?.professions));
  } catch { return []; }
};

const readSelectedId = (characters: MapCharacterProfile[]) => {
  const stored = localStorage.getItem(SELECTED_KEY);
  return characters.some((character) => character.id === stored) ? stored : null;
};

export function removeMapCharacter(id: string) {
  const characters = readCharacters();
  if (!characters.some(character => character.id === id)) return;
  // SavedVariables and the sync cache still contain imported profiles. Remember
  // this choice so background imports cannot recreate a removed dropdown entry.
  const removed = readRemovedCharacters();
  removed.add(id);
  localStorage.setItem(REMOVED_CHARACTERS_KEY, JSON.stringify([...removed]));
  const next = characters.filter(character => character.id !== id);
  localStorage.setItem(CHARACTERS_KEY, JSON.stringify(next));
  if (localStorage.getItem(SELECTED_KEY) === id) {
    const replacement = next.find(character => character.source === "addon") ?? next[0];
    if (replacement) localStorage.setItem(SELECTED_KEY, replacement.id);
    else localStorage.removeItem(SELECTED_KEY);
  }
  const filterPrefix = `gm:character-filters:v1:${id}:`;
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key?.startsWith(filterPrefix) || key === `gm:filter-rail:open-group:${id}`) localStorage.removeItem(key);
  }
  window.dispatchEvent(new Event(UPDATED_EVENT));
}

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
    else localStorage.setItem(SELECTED_KEY, "");
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
    removeMapCharacter(id);
    const next = readCharacters();
    setCharacters(next);
    setSelectedId(readSelectedId(next));
  }, []);

  return { characters, selectedId, selectedCharacter: characters.find((character) => character.id === selectedId) ?? null,
    select, save, remove };
}
