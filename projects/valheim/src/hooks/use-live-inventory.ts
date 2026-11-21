import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ensureInventoryFile,
  readInventorySnapshot,
  setInventorySharing,
  snapshotToStock,
} from '../lib/live-tracking/inventory-reader.ts'
import {
  INVENTORY_FRESHNESS_MS,
  INVENTORY_MOD_GRACE_MS,
  type InventoryStatus,
  type LiveInventorySnapshot,
} from '../lib/live-tracking/inventory-types.ts'
import { PREFERENCES_CHANGED_EVENT, readPreferences, writePreferences, type InventorySourcePreferences } from '../store/preferences'
import { isOverwolf } from '../utils/overwolf'

const POLL_INTERVAL_MS = 1_000

export interface LiveInventoryState {
  status: InventoryStatus
  snapshot: LiveInventorySnapshot | null
  /** Owned amounts per lowercased prefab, already filtered by source settings. */
  stock: Record<string, number>
  /** True only when the counts may be treated as the player's current inventory. */
  authoritative: boolean
  updatedAt: number | null
  error: string | null
  enable: () => Promise<void>
  disable: () => Promise<void>
}

const emptyStock: Record<string, number> = {}

interface InventorySettings {
  enabled: boolean
  directory: string | null
  sources: InventorySourcePreferences
}

const readSettings = (): InventorySettings => {
  const preferences = readPreferences()
  return {
    enabled: preferences.inventoryTrackingEnabled,
    directory: preferences.trackingInstallDirectory,
    sources: preferences.inventorySources,
  }
}

/**
 * Reads the inventory snapshot the tracking mod writes. Every failure mode ends
 * in an explicit status the UI can explain, because the planner has to stay
 * usable when the tracker is missing, outdated, revoked, or stale.
 */
export function useLiveInventory(positionActive: boolean): LiveInventoryState {
  const [settings, setSettings] = useState<InventorySettings>(readSettings)
  const [pollStatus, setPollStatus] = useState<InventoryStatus | null>(null)
  const [snapshot, setSnapshot] = useState<LiveInventorySnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const waitingSince = useRef<number | null>(null)

  // Settings live in the shared preferences object, which other windows can
  // change, so the hook re-reads them instead of trusting its first snapshot.
  useEffect(() => {
    const syncPreferences = () => setSettings(readSettings())
    window.addEventListener(PREFERENCES_CHANGED_EVENT, syncPreferences)
    window.addEventListener('storage', syncPreferences)
    window.addEventListener('focus', syncPreferences)
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, syncPreferences)
      window.removeEventListener('storage', syncPreferences)
      window.removeEventListener('focus', syncPreferences)
    }
  }, [])

  const enable = useCallback(async () => {
    setError(null)
    try {
      const preferences = readPreferences()
      if (!preferences.trackingInstallDirectory) throw new Error('tracker-missing')
      await setInventorySharing(preferences.trackingInstallDirectory, true)
      writePreferences({ ...preferences, inventoryTrackingEnabled: true })
      waitingSince.current = Date.now()
      setSettings(readSettings())
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'unknown')
    }
  }, [])

  const disable = useCallback(async () => {
    const preferences = readPreferences()
    writePreferences({ ...preferences, inventoryTrackingEnabled: false })
    setSettings(readSettings())
    setSnapshot(null)
    setPollStatus(null)
    if (!preferences.trackingInstallDirectory) return
    try {
      await setInventorySharing(preferences.trackingInstallDirectory, false)
    } catch (reason) {
      // Revoking the app-side permission already stops every read. Tell the user
      // the game-side flag could not be cleared instead of failing silently.
      setError(reason instanceof Error ? reason.message : 'unknown')
    }
  }, [])

  const { enabled, directory, sources } = settings
  const hostSupported = isOverwolf()
  const pollable = enabled && hostSupported && Boolean(directory)

  // Keep the game-side sharing flag aligned with the saved preference. This is
  // also what activates the new default-on setting after the tracker has been
  // installed and its directory becomes available.
  useEffect(() => {
    if (!enabled || !hostSupported || !directory) return
    void setInventorySharing(directory, true).catch((reason) => {
      setError(reason instanceof Error ? reason.message : 'unknown')
    })
  }, [directory, enabled, hostSupported])

  useEffect(() => {
    if (!pollable || !directory) {
      waitingSince.current = null
      return
    }

    let cancelled = false
    let timer = 0
    waitingSince.current ??= Date.now()

    const poll = async () => {
      let result = await readInventorySnapshot(directory)
      if (cancelled) return
      if (result.kind === 'missing') {
        // Consent is on but the file was never created (mod installed before
        // the app started pre-creating it). Create it so the game can write.
        await ensureInventoryFile(directory).catch(() => undefined)
        if (cancelled) return
        result = await readInventorySnapshot(directory)
        if (cancelled) return
      }
      if (result.kind === 'snapshot') {
        waitingSince.current = null
        // The mod heartbeats even when nothing changed. Keeping the previous
        // object identity stops an unchanged snapshot from re-rendering the app.
        setSnapshot((current) => (
          current && current.updatedAt === result.snapshot.updatedAt ? current : result.snapshot
        ))
        setPollStatus(Date.now() - result.snapshot.updatedAt <= INVENTORY_FRESHNESS_MS ? 'live' : 'stale')
        return
      }
      setSnapshot(null)
      if (result.kind === 'unsupported-payload') {
        setPollStatus('unsupported-payload')
        return
      }
      if (result.kind === 'invalid') {
        setPollStatus('invalid')
        return
      }
      if (result.kind === 'sharing-off') {
        setPollStatus('sharing-off')
        return
      }
      // No file yet. While position tracking is already reporting, the installed
      // mod is simply too old to write inventory snapshots.
      const waiting = waitingSince.current ?? Date.now()
      waitingSince.current = waiting
      const waitedLongEnough = Date.now() - waiting > INVENTORY_MOD_GRACE_MS
      setPollStatus(positionActive && waitedLongEnough ? 'mod-update-required' : 'waiting')
    }

    const schedulePoll = async () => {
      await poll()
      if (!cancelled) timer = window.setTimeout(() => void schedulePoll(), POLL_INTERVAL_MS)
    }
    void schedulePoll()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [directory, pollable, positionActive])

  // Order matters: a player without the tracker installed needs to be pointed at
  // the installer, not at a permission switch that cannot do anything yet.
  const status: InventoryStatus = !hostSupported
    ? 'unsupported-host'
    : !directory
      ? 'tracker-missing'
      : !enabled
        ? 'disabled'
        : pollStatus ?? 'waiting'

  // The latest snapshot remains useful between game sessions. Stale counts are
  // always included as the player's last known inventory.
  const usable = status === 'live' || status === 'stale'
  const stock = useMemo(
    () => (snapshot && usable ? snapshotToStock(snapshot, sources) : emptyStock),
    [snapshot, sources, usable],
  )

  return {
    status,
    snapshot,
    stock,
    authoritative: status === 'live',
    updatedAt: snapshot?.updatedAt ?? null,
    error,
    enable,
    disable,
  }
}
