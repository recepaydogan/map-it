import { useEffect, useState } from 'react'
import {
  ensureNearbyCreaturesFile,
  readNearbyCreaturesSnapshot,
} from '../lib/live-tracking/inventory-reader.ts'
import {
  NEARBY_CREATURE_TRACKING_ENABLED,
  NEARBY_CREATURES_FRESHNESS_MS,
  type NearbyCreature,
} from '../lib/live-tracking/creature-types.ts'
import { PREFERENCES_CHANGED_EVENT, readPreferences } from '../store/preferences'
import { isOverwolf } from '../utils/overwolf'

// The game publishes only once every three minutes. A 1 Hz file check catches
// the initial/periodic snapshot promptly without causing React updates between them.
const POLL_INTERVAL_MS = 1_000
const noCreatures: NearbyCreature[] = []

export interface NearbyCreaturesState {
  status: 'off' | 'waiting' | 'live'
  worldUid: string | null
  radius: number
  creatures: NearbyCreature[]
  updatedAt: number | null
}

/** Reads an immediate snapshot, then keeps it unchanged until the 3-minute refresh. */
export function useNearbyCreatures(enabled = true): NearbyCreaturesState {
  const [directory, setDirectory] = useState(() => readPreferences().trackingInstallDirectory)
  const [state, setState] = useState<NearbyCreaturesState>({
    status: 'off',
    worldUid: null,
    radius: 200,
    creatures: noCreatures,
    updatedAt: null,
  })

  useEffect(() => {
    const sync = () => setDirectory(readPreferences().trackingInstallDirectory)
    window.addEventListener(PREFERENCES_CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    window.addEventListener('focus', sync)
    return () => {
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  useEffect(() => {
    if (!NEARBY_CREATURE_TRACKING_ENABLED || !enabled || !directory || !isOverwolf()) {
      const reset = window.setTimeout(() => setState((current) => ({ ...current, status: 'off', creatures: noCreatures })), 0)
      return () => window.clearTimeout(reset)
    }
    let cancelled = false
    let timer = 0
    let lastApplied = -1
    const markWaiting = () => setState((current) =>
      current.status === 'waiting' && current.creatures.length === 0
        ? current
        : { ...current, status: 'waiting', creatures: noCreatures })
    const poll = async () => {
      let result = await readNearbyCreaturesSnapshot(directory)
      if (cancelled) return
      if (result.kind === 'missing') {
        await ensureNearbyCreaturesFile(directory).catch(() => undefined)
        if (cancelled) return
        result = await readNearbyCreaturesSnapshot(directory)
      }
      if (cancelled) return
      if (result.kind === 'snapshot') {
        const fresh = Date.now() - result.snapshot.updatedAt <= NEARBY_CREATURES_FRESHNESS_MS
        if (fresh && result.snapshot.updatedAt !== lastApplied) {
          lastApplied = result.snapshot.updatedAt
          setState({
            status: 'live',
            worldUid: result.snapshot.worldUid || null,
            radius: result.snapshot.radius,
            creatures: result.snapshot.creatures,
            updatedAt: result.snapshot.updatedAt,
          })
        } else if (!fresh && lastApplied >= 0) {
          markWaiting()
        }
      } else if (lastApplied < 0 || Date.now() - lastApplied > NEARBY_CREATURES_FRESHNESS_MS) {
        // No successful frame yet. Once live, a transient missing/partial read
        // must retain the last known positions instead of blinking every pin.
        markWaiting()
      }
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
  }, [directory, enabled])

  return state
}
