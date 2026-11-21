import { PLAYER_VISIBLE_PIN_TYPES, type CharacterSave } from './character-save-format.ts'
import type { ValheimCharacterFile } from './world-save-service.ts'
import type { PlayedCharacter } from './character-save-recency.ts'

export interface LoadedCharacter {
  file: ValheimCharacterFile
  save: CharacterSave
}

/** A missing or ambiguous active character must never select somebody else's map. */
export function resolveCharacterPins(
  loaded: LoadedCharacter[], worldUid: string | null, trackedName: string | null, manualId: string | null,
  lastPlayed: PlayedCharacter | null = null,
) {
  const candidates = worldUid ? loaded.filter(entry => entry.save.worlds.get(worldUid)?.hasMapData) : []
  const manual = candidates.find(entry => entry.file.id === manualId)
  const matches = trackedName ? candidates.filter(entry => entry.save.playerName.toLowerCase() === trackedName.toLowerCase()) : []
  const playedAt = (entry: LoadedCharacter) => Math.max(entry.file.lastPlayedAt ?? 0,
    lastPlayed?.name.toLowerCase() === entry.save.playerName.toLowerCase() ? lastPlayed.updatedAt : 0)
  const latest = !trackedName ? [...candidates].sort((a, b) => playedAt(b) - playedAt(a))[0] : undefined
  const selected = manual ?? (trackedName ? (matches.length === 1 ? matches[0] : undefined) : latest)
  return {
    candidates,
    selectedCharacterId: selected?.file.id ?? null,
    manualCharacterId: manual?.file.id ?? null,
    characterName: selected?.save.playerName ?? trackedName,
    characterPlayerId: selected?.save.playerId ?? null,
    exploration: worldUid ? selected?.save.worlds.get(worldUid)?.exploration ?? null : null,
    pins: (worldUid ? selected?.save.worlds.get(worldUid)?.pins ?? [] : [])
      .filter(pin => PLAYER_VISIBLE_PIN_TYPES.has(pin.type)),
  }
}
