import type { SavedCharacter } from "./types";

const KNOWN_CHARACTERS_KEY = "er-save-tracking-known-characters";

const identity = (character: SavedCharacter) => JSON.stringify([character.id, character.name]);

const restoreKnownCharacters = (): Set<string> | null => {
  try {
    const value = localStorage.getItem(KNOWN_CHARACTERS_KEY);
    if (value === null) return null;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string")
      ? new Set(parsed) : null;
  } catch (error) {
    console.warn("[save-tracking] Cannot restore known characters", error);
    return null;
  }
};

export const createCharacterDiscovery = () => {
  let known = restoreKnownCharacters();
  return (characters: SavedCharacter[], activeId: string | null): string | null => {
    const next = new Set(characters.map(identity));
    const added = known === null ? [] : characters.filter((character) => !known!.has(identity(character)));
    known = next;
    try { localStorage.setItem(KNOWN_CHARACTERS_KEY, JSON.stringify([...next])); }
    catch (error) { console.warn("[save-tracking] Cannot save known characters", error); }

    if (added.length === 1) return added[0].id;
    return added.find((character) => character.id === activeId)?.id ?? null;
  };
};
