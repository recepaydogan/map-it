import type { CharacterSnapshot } from "./character-snapshot";
import type { CharacterSyncState } from "./character-sync-store";

/** Saved inventory/quest/recipe data has its own clock; GEP may supply newer basics. */
export function mergeSavedCharacter(previous: CharacterSnapshot | undefined, saved: CharacterSnapshot, restoreSavedBasics = false): CharacterSnapshot {
  if (!previous) return saved;
  if ((previous.savedAt ?? (previous.source === "gep" ? 0 : previous.updatedAt)) > saved.updatedAt) return previous;
  if (restoreSavedBasics) return saved;
  if (previous.source !== "gep" || previous.updatedAt <= saved.updatedAt) return saved;
  return { ...saved, ...previous, savedAt: saved.updatedAt, bags: saved.bags, bank: saved.bank, quests: saved.quests,
    completedQuests: saved.completedQuests,
    professions: saved.professions.map(profession => ({ ...profession,
      type: previous.professions.find(p => p.id === profession.id)?.type ?? profession.type })) };
}

export function mergeSavedCharacterBatch(state: CharacterSyncState, incoming: CharacterSnapshot[], savedCurrentId: string | null, capturedAt?: number): CharacterSyncState {
  const characters = { ...state.characters };
  const newerFile = capturedAt !== undefined && capturedAt > (state.savedCurrentAt ?? 0);
  const previousSavedId = state.savedCurrentId ?? state.currentId;
  const switched = newerFile && savedCurrentId !== previousSavedId && incoming.some(saved => saved.id === savedCurrentId);
  for (const saved of incoming) {
    // Nameless GEP packets between login and reload may belong to the next character.
    characters[saved.id] = mergeSavedCharacter(characters[saved.id], saved, switched && saved.id === previousSavedId);
  }
  let currentId = state.currentId;
  const current = currentId ? characters[currentId] : undefined;
  const candidate = savedCurrentId ? characters[savedCurrentId] : undefined;
  const anonymous = current?.source === "gep" && !current.guid && !current.name;
  if (candidate && (!current || anonymous || newerFile)) {
    currentId = candidate.id;
    if (anonymous && current.id !== candidate.id) delete characters[current.id];
  } else if (state.liveConnected && current?.source === "gep" && current.name) {
    // A name is only usable when exactly one known saved identity matches it.
    const matches = Object.values(characters).filter(c => c.guid && c.name === current.name &&
      (!current.realm || c.realm === current.realm) && (!current.classId || c.classId === current.classId));
    if (matches.length === 1) {
      const saved = matches[0]!;
      characters[saved.id] = mergeSavedCharacter({ ...current, id: saved.id, guid: saved.guid, realm: saved.realm,
        classId: current.classId || saved.classId, raceId: current.raceId || saved.raceId, faction: current.faction ?? saved.faction }, saved);
      currentId = saved.id;
    }
  } else if (!state.liveConnected && savedCurrentId && characters[savedCurrentId] &&
    (capturedAt === undefined || capturedAt >= (state.savedCurrentAt ?? 0))) {
    const candidate = characters[savedCurrentId]!;
    if (!current || (candidate.savedAt ?? candidate.updatedAt) >= (current.savedAt ?? current.updatedAt)) currentId = candidate.id;
  }
  return { ...state, characters, currentId,
    ...(candidate && capturedAt !== undefined && capturedAt >= (state.savedCurrentAt ?? 0)
      ? { savedCurrentId: candidate.id, savedCurrentAt: capturedAt } : {}),
    phase: state.liveConnected || incoming.length ? "synced" : state.phase };
}
