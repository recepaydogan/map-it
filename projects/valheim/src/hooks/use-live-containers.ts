import { useEffect, useMemo, useState } from 'react'
import { ensureContainersFile, readContainersSnapshot } from '../lib/live-tracking/inventory-reader.ts'
import { containersToStock } from '../lib/live-tracking/container-payload.ts'
import {
  CONTAINERS_FRESHNESS_MS,
  type ContainerSourceSelection,
  type RememberedContainer,
} from '../lib/live-tracking/container-types.ts'
import { PREFERENCES_CHANGED_EVENT, readPreferences } from '../store/preferences'
import { useContainerMemoryStore } from '../store/container-memory-store'
import { isOverwolf } from '../utils/overwolf'
import { saveDiagnostic } from '../lib/valheim/save-diagnostics.ts'
import { selectContainerWorld } from '../lib/live-tracking/container-world.ts'

const POLL_INTERVAL_MS = 1_000

export type ContainerStatus =
  /** Nothing to read: no host, no tracker, or inventory sharing is off. */
  | 'off'
  /** Sharing is on but no snapshot arrived yet (mod too old, or no character). */
  | 'waiting'
  /** The last snapshot is fresh; loaded chests reflect the game right now. */
  | 'live'
  /** Reading remembered chests only; the game is not reporting. */
  | 'remembered'

export interface LiveContainersState {
  status: ContainerStatus
  /** Explicitly selected world; null while its identity is unresolved. */
  worldUid: string | null
  containers: RememberedContainer[]
  /** Owned amounts per lowercased prefab from the containers the settings allow. */
  stock: Record<string, number>
  sources: ContainerSourceSelection
  updatedAt: number | null
}

const emptyStock: Record<string, number> = {}
const noContainers: RememberedContainer[] = []

const readSettings = () => {
  const preferences = readPreferences()
  return {
    enabled: preferences.inventoryTrackingEnabled,
    directory: preferences.trackingInstallDirectory,
    sources: {
      ownContainers: preferences.inventorySources.ownContainers,
      friendContainers: true,
    } satisfies ContainerSourceSelection,
  }
}

/**
 * Reads the container snapshot the mod writes and folds it into the per-world
 * memory store. Rides on the inventory consent: nothing is read unless the
 * player enabled inventory sharing.
 */
export function useLiveContainers(selectedWorldUid: string | null): LiveContainersState {
  const [settings, setSettings] = useState(readSettings)
  const [liveWorldUid, setLiveWorldUid] = useState<string | null>(null)
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<number | null>(null)
  const [pollStatus, setPollStatus] = useState<ContainerStatus>('off')
  const worlds = useContainerMemoryStore((state) => state.worlds)
  const applySnapshot = useContainerMemoryStore((state) => state.applySnapshot)

  useEffect(() => {
    const sync = () => setSettings(readSettings())
    // Same-window writes (the settings panel) do not fire `storage`; the
    // preferences store announces them itself, so sharing turns on at once.
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  const { enabled, directory } = settings
  const pollable = enabled && isOverwolf() && Boolean(directory)

  useEffect(() => {
    saveDiagnostic('containers.poll-settings', { enabled, path: directory, pollable, overwolf: isOverwolf() })
    if (!pollable || !directory) {
      const reset = window.setTimeout(() => {
        setPollStatus('off')
        setLiveWorldUid(null)
        setLiveUpdatedAt(null)
      }, 0)
      return () => window.clearTimeout(reset)
    }
    let cancelled = false
    let timer = 0
    let lastApplied = -1
    const poll = async () => {
      let result = await readContainersSnapshot(directory)
      if (cancelled) return
      if (result.kind === 'missing') {
        saveDiagnostic('containers.snapshot-missing', { path: directory })
        await ensureContainersFile(directory).catch((error: unknown) => {
          saveDiagnostic('containers.ensure-file-failed', { path: directory }, error)
        })
        if (cancelled) return
        result = await readContainersSnapshot(directory)
        if (cancelled) return
      }
      if (result.kind === 'snapshot') {
        const fresh = Date.now() - result.snapshot.updatedAt <= CONTAINERS_FRESHNESS_MS
        saveDiagnostic('containers.snapshot', { path: directory, worldUid: result.snapshot.worldUid,
          fresh, count: result.snapshot.containers.length })
        if (result.snapshot.updatedAt !== lastApplied) {
          lastApplied = result.snapshot.updatedAt
          applySnapshot(result.snapshot)
        }
        setLiveWorldUid(result.snapshot.worldUid || null)
        setLiveUpdatedAt(result.snapshot.updatedAt)
        setPollStatus(fresh ? 'live' : 'remembered')
        return
      }
      saveDiagnostic('containers.no-snapshot', { path: directory, kind: result.kind,
        payloadVersion: result.kind === 'unsupported-payload' ? result.payloadVersion : undefined })
      setLiveWorldUid(null)
      setLiveUpdatedAt(null)
      setPollStatus(result.kind === 'sharing-off' ? 'off' : 'waiting')
    }
    const loop = async () => {
      await poll()
      if (!cancelled) timer = window.setTimeout(() => void loop(), POLL_INTERVAL_MS)
    }
    void loop()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [applySnapshot, directory, enabled, pollable])

  const { worldUid, world, matchesLiveWorld } = selectContainerWorld(worlds, selectedWorldUid, liveWorldUid)
  const rememberedMap = world?.containers
  const containers = useMemo(
    () => (rememberedMap ? Object.values(rememberedMap) : noContainers),
    [rememberedMap],
  )
  const status: ContainerStatus = enabled && matchesLiveWorld && pollStatus === 'live'
    ? 'live'
    : containers.length > 0 && enabled
      ? 'remembered'
      : !enabled || pollStatus === 'off' ? 'off' : 'waiting'
  const stock = useMemo(
    () => (enabled && containers.length > 0 ? containersToStock(containers, settings.sources) : emptyStock),
    [containers, enabled, settings.sources],
  )

  return {
    status,
    worldUid,
    containers: enabled ? containers : noContainers,
    stock,
    sources: settings.sources,
    updatedAt: (matchesLiveWorld ? liveUpdatedAt : null) ?? world?.updatedAt ?? null,
  }
}
