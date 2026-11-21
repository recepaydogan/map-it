import { readKnownWorlds, writeKnownWorlds } from '../store/known-worlds.ts'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { startWorldDiscovery } from '../lib/valheim/world-discovery.ts'
import { saveDiagnostic } from '../lib/valheim/save-diagnostics.ts'
import { mergeKnownWorlds, rememberWorlds, resolveSelectedWorld, worldIdentityKey, type WorldIdentity } from '../lib/valheim/known-worlds.ts'
import {
  discoverValheimWorlds,
  loadValheimWorldDatabase,
} from '../lib/valheim/world-save-service.ts'
import type {
  SavePrefabType,
  ValheimWorldDatabase,
  ValheimWorldSave,
} from '../types/world-save.ts'
import type { BuildingCatalogFile } from '../lib/building/building-catalog.ts'

interface WorldSaveState {
  worlds: ValheimWorldSave[]
  selectedWorld: ValheimWorldSave | null
  database: ValheimWorldDatabase | null
  discovering: boolean
  discoveryError: string | null
  readingDatabase: boolean
  error: string | null
  refreshWorlds: (reloadDatabase?: boolean) => void
  forgetSeed: (world: WorldIdentity) => void
}

interface DatabaseState {
  worldId: string | null
  database: ValheimWorldDatabase | null
  reading: boolean
  error: string | null
}

export function useWorldSaves(
  selectedWorldId: string | null,
  liveWorld: { worldName?: string; seedName?: string } | null = null,
): WorldSaveState {
  const [saves, setSaves] = useState<ValheimWorldSave[]>([])
  const [known, setKnown] = useState(readKnownWorlds)
  const knownRef = useRef(known)
  const databaseFailed = useRef(false)
  const scanner = useRef<ReturnType<typeof startWorldDiscovery> | null>(null)
  const remember = useCallback((incoming: WorldIdentity[]) => {
    const next = rememberWorlds(knownRef.current, incoming)
    if (next === knownRef.current) return
    knownRef.current = next
    setKnown(next)
    writeKnownWorlds(next)
  }, [])
  const forgetSeed = useCallback((world: WorldIdentity) => {
    const key = worldIdentityKey(world)
    const next = knownRef.current.filter(entry => worldIdentityKey(entry) !== key)
    if (next.length === knownRef.current.length) return
    knownRef.current = next
    setKnown(next)
    writeKnownWorlds(next)
  }, [])
  const worlds = useMemo(() => mergeKnownWorlds(saves, known), [saves, known])
  const [discovering, setDiscovering] = useState(true)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [databaseRefresh, setDatabaseRefresh] = useState(0)
  const [databaseState, setDatabaseState] = useState<DatabaseState>({
    worldId: null,
    database: null,
    reading: false,
    error: null,
  })
  const selectedWorld = useMemo(
    () => resolveSelectedWorld(worlds, known, selectedWorldId),
    [selectedWorldId, worlds, known],
  )

  useEffect(() => {
    const monitor = startWorldDiscovery({
      discover: discoverValheimWorlds,
      onWorlds: (found) => {
        setDiscoveryError(null)
        if (databaseFailed.current) setDatabaseRefresh(version => version + 1)
        // A save may be locked or between committed generations. Retain the
        // last successful entry until a later scan can replace it.
        setSaves(previous => {
          const next = new Map(previous.map(world => [world.id, world]))
          for (const world of found) next.set(world.id, world)
          const merged = [...next.values()]
          return JSON.stringify(previous) === JSON.stringify(merged) ? previous : merged
        })
        remember(found.map(world => ({ name: world.name, seedName: world.seedName, saveId: world.id })))
      },
      onError: (reason) => {
        saveDiagnostic('world.scan-failed', {}, reason)
        setDiscoveryError(reason instanceof Error ? reason.message : String(reason))
      },
      onBusy: setDiscovering,
    })
    scanner.current = monitor
    const onFocus = () => { void monitor.request() }
    const onVisibility = () => { if (document.visibilityState === 'visible') onFocus() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      monitor.stop()
      scanner.current = null
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [remember])

  const liveName = liveWorld?.worldName
  const liveSeed = liveWorld?.seedName
  useEffect(() => {
    if (!liveName?.trim() || !liveSeed?.trim()) return
    remember([{ name: liveName, seedName: liveSeed }])
    void scanner.current?.request()
  }, [liveName, liveSeed, remember])

  // Metadata scans must not repeatedly parse the potentially huge save DB.
  const databaseWorldId = selectedWorld?.id ?? null
  const databasePath = selectedWorld?.databasePath ?? null
  const chunksPath = selectedWorld?.chunksPath

  useEffect(() => {
    saveDiagnostic('world.selection', { requestedId: selectedWorldId, selectedId: selectedWorld?.id,
      uid: selectedWorld?.uid, source: selectedWorld?.source, databasePath: selectedWorld?.databasePath,
      chunksPath: selectedWorld?.chunksPath, availableWorlds: worlds.length })
  }, [selectedWorldId, selectedWorld, worlds.length])

  useEffect(() => {
    let cancelled = false
    databaseFailed.current = false
    if (!databasePath || !databaseWorldId) {
      saveDiagnostic('database.skipped', { worldId: databaseWorldId, path: databasePath, reason: 'no-selected-save-database' })
      queueMicrotask(() => {
        if (!cancelled) {
          setDatabaseState({ worldId: null, database: null, reading: false, error: null })
        }
      })
      return () => { cancelled = true }
    }

    queueMicrotask(() => {
      if (!cancelled) {
        setDatabaseState(previous => ({
          worldId: databaseWorldId,
          database: previous.worldId === databaseWorldId ? previous.database : null,
          reading: true,
          error: null,
        }))
      }
    })
    saveDiagnostic('database.start', { path: databasePath, chunksPath, worldId: databaseWorldId })
    void Promise.all([
      fetch('/game-data/prefab-types.json').then((response) => {
        if (!response.ok) throw new Error(`Prefab index request failed: ${response.status}`)
        return response.json() as Promise<{ prefabs: SavePrefabType[] }>
      }),
      fetch('/game-data/building-catalog.json').then((response) => {
        if (!response.ok) throw new Error(`Building catalog request failed: ${response.status}`)
        return response.json() as Promise<BuildingCatalogFile>
      }),
    ])
      .then(([{ prefabs }, catalog]) => {
        const pieces = new Map(catalog.pieces.map((piece) => [piece.prefabName, piece]))
        const enrichedPrefabs = prefabs.map((prefab) => {
          const piece = pieces.get(prefab.prefabName)
          return piece ? {
            ...prefab,
            pieceMaterial: piece.material,
            pieceBounds: piece.bounds,
          } : prefab
        })
        return loadValheimWorldDatabase({ databasePath, chunksPath }, enrichedPrefabs)
      })
      .then((worldDatabase) => {
        if (!cancelled) {
          saveDiagnostic('database.loaded', { path: databasePath, returnedDatabase: Boolean(worldDatabase),
            version: worldDatabase?.databaseVersion, containers: worldDatabase?.containers.length,
            structureClusters: worldDatabase?.structures.length, structurePaths: worldDatabase?.structurePaths.length,
            locations: worldDatabase?.locations.length, generatedZones: worldDatabase?.generatedZoneCount })
          setDatabaseState({
            worldId: databaseWorldId,
            database: worldDatabase,
            reading: false,
            error: null,
          })
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          saveDiagnostic('database.failed', { path: databasePath, chunksPath, worldId: databaseWorldId }, reason)
          databaseFailed.current = true
          setDatabaseState(previous => ({
            worldId: databaseWorldId,
            database: previous.worldId === databaseWorldId ? previous.database : null,
            reading: false,
            error: reason instanceof Error ? reason.message : String(reason),
          }))
        }
      })

    return () => { cancelled = true }
  }, [databaseWorldId, databasePath, chunksPath, databaseRefresh])

  return {
    worlds,
    selectedWorld,
    database: databaseState.worldId === selectedWorld?.id
      ? databaseState.database
      : null,
    discovering,
    discoveryError,
    // The first render of a newly selected save precedes the loading effect.
    // Report it as pending immediately so fallback consumers cannot race the read.
    readingDatabase: Boolean(selectedWorld?.databasePath)
      && (databaseState.worldId !== selectedWorld?.id || databaseState.reading),
    error: discoveryError ?? (
      databaseState.worldId === selectedWorld?.id ? databaseState.error : null
    ),
    refreshWorlds: (reloadDatabase = true) => {
      setDiscoveryError(null)
      setDiscovering(true)
      if (reloadDatabase) setDatabaseRefresh((version) => version + 1)
      void scanner.current?.request(true)
    },
    forgetSeed,
  }
}
