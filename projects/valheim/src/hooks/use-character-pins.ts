import { useEffect, useMemo, useState } from 'react'
import type { CharacterMapPin } from '../lib/valheim/character-save-format.ts'
import type { ExploredMap } from '../lib/valheim/explored-map.ts'
import { resolveCharacterPins, type LoadedCharacter } from '../lib/valheim/character-pin-selection.ts'
import { readLastPlayedCharacter, rememberPlayedCharacter, type PlayedCharacter } from '../lib/valheim/character-save-recency.ts'
import {
  discoverValheimCharacters,
  loadValheimCharacter,
  type ValheimCharacterFile,
} from '../lib/valheim/world-save-service.ts'
import { isOverwolf } from '../utils/overwolf'
import { saveDiagnostic } from '../lib/valheim/save-diagnostics.ts'
import { UnsupportedCharacterVersionError, type CharacterCompatibility } from '../lib/valheim/character-compatibility.ts'
import { characterCompatibility } from '../lib/valheim/character-compatibility-client.ts'

export interface CharacterPinsState {
  characters: Array<{ file: ValheimCharacterFile; playerName: string }>
  /** Player ids of every local character: what "own" means for a chest's creator. */
  playerIds: string[]
  /** Character whose pins are shown, or null when none has this world. */
  selectedCharacterId: string | null
  selectCharacter: (id: string | null) => void
  manualCharacterId: string | null
  characterName: string | null
  characterPlayerId: string | null
  refresh: () => void
  pins: CharacterMapPin[]
  exploration: ExploredMap | null
  loading: boolean
}

/**
 * Reload on character/world changes and explicit refresh. Automatic selection
 * requires a unique live character match; offline maps default to the most recent save.
 */
export function useCharacterPins(
  worldUid: string | null,
  trackedCharacterName: string | null,
  refreshToken: number,
  lastObserved: PlayedCharacter | null = null,
  refreshExploration = false,
): CharacterPinsState {
  const [loaded, setLoaded] = useState<LoadedCharacter[]>([])
  const [loadedContext, setLoadedContext] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const context = JSON.stringify([worldUid, trackedCharacterName?.toLowerCase() ?? null])
  const [manualSelection, setManualSelection] = useState<{ context: string; id: string } | null>(null)
  const [reload, setReload] = useState(0)
  const [compatibility, setCompatibility] = useState<CharacterCompatibility | null>(characterCompatibility.getSnapshot())

  useEffect(() => {
    if (!refreshExploration || !worldUid || !isOverwolf()) return
    const refresh = () => setReload(value => value + 1)
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [refreshExploration, worldUid])

  useEffect(() => {
    if (!isOverwolf()) return
    let cancelled = false
    void characterCompatibility.refresh().then(value => { if (!cancelled) setCompatibility(value) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (worldUid && trackedCharacterName) rememberPlayedCharacter(worldUid, trackedCharacterName)
  }, [worldUid, trackedCharacterName])

  useEffect(() => {
    if (!isOverwolf()) return
    let cancelled = false
    const timer = window.setTimeout(() => {
      setLoading(true)
      setManualSelection(current => current?.context === context ? current : null)
      void discoverValheimCharacters()
        .then((files) => Promise.all(files.map(async (file) => {
          const save = await loadValheimCharacter(file, compatibility).catch(async (error: unknown) => {
            saveDiagnostic('character.load-failed', { path: file.path, source: file.source }, error)
            // Overwolf can retain a hidden window across game sessions. Recheck
            // only on an unknown newer format; the store coalesces/throttles it.
            if (!cancelled && error instanceof UnsupportedCharacterVersionError && error.version > 47) {
              const updated = await characterCompatibility.refresh()
              if (!cancelled) setCompatibility(updated)
            }
            return null
          })
          saveDiagnostic('character.loaded', { path: file.path, parsed: Boolean(save),
            worlds: save ? [...save.worlds].map(([uid, map]) => ({ uid, hasMapData: map.hasMapData, pins: map.pins.length })) : [] })
          return save ? { file, save } : null
        })))
        .then((results) => {
          if (cancelled) return
          setLoaded(results.filter((entry): entry is LoadedCharacter => entry !== null))
          setLoadedContext(context)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setLoaded([])
          saveDiagnostic('character.scan-failed', {}, error)
        })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 0)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [refreshToken, context, reload, compatibility, refreshExploration])

  const { candidates, selectedCharacterId, manualCharacterId, characterName, characterPlayerId, pins, exploration } = useMemo(() => {
    const remembered = readLastPlayedCharacter(worldUid)
    const recent = lastObserved && (!remembered || lastObserved.updatedAt > remembered.updatedAt) ? lastObserved : remembered
    return resolveCharacterPins(loaded, worldUid, trackedCharacterName,
      manualSelection?.context === context ? manualSelection.id : null, recent)
  }, [loaded, worldUid, trackedCharacterName, manualSelection, context, lastObserved])

  const playerIds = useMemo(() => candidates.map((entry) => entry.save.playerId), [candidates])

  useEffect(() => {
    saveDiagnostic('character.match', { worldUid, loading, loadedCharacters: loaded.length,
      matchingCharacters: candidates.length, selectedCharacterId, ownPlayerIds: playerIds.length,
      trackedCharacterAvailable: Boolean(trackedCharacterName), pins: pins.length })
  }, [worldUid, loading, loaded.length, candidates.length, selectedCharacterId, playerIds.length, trackedCharacterName, pins.length])

  return {
    characters: candidates.map((entry) => ({ file: entry.file, playerName: entry.save.playerName })),
    playerIds,
    selectedCharacterId,
    manualCharacterId,
    characterName,
    characterPlayerId: loadedContext === context ? characterPlayerId : null,
    selectCharacter: id => setManualSelection(id ? { context, id } : null),
    refresh: () => setReload(value => value + 1),
    pins,
    exploration: loadedContext === context ? exploration : null,
    loading,
  }
}
