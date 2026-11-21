import { useEffect, useState } from 'react'
import type { SeedResourcePoints } from '../lib/valheim/seed-resources.ts'
import type { LocationGenerationProfile } from '../lib/valheim/location-generator.ts'

interface SeedResourceState {
  worldKey: string
  points: SeedResourcePoints
  loading: boolean
  error: boolean
}
const EMPTY_POINTS: SeedResourcePoints = {}

export function useSeedResources(seedName: string, enabled: boolean, profile: LocationGenerationProfile): SeedResourceState {
  const worldKey = JSON.stringify([seedName, profile])
  const [state, setState] = useState<SeedResourceState>({ worldKey: '', points: EMPTY_POINTS, loading: false, error: false })
  useEffect(() => {
    if (!enabled) return
    let active = true
    const worker = new Worker(new URL('../workers/seed-resources.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ type: string; points?: SeedResourcePoints }>) => {
      if (!active || event.data.type === 'progress') return
      setState({ worldKey, points: event.data.points ?? EMPTY_POINTS, loading: false, error: event.data.type !== 'complete' })
      worker.terminate()
    }
    worker.onerror = () => {
      if (active) setState({ worldKey, points: EMPTY_POINTS, loading: false, error: true })
      worker.terminate()
    }
    worker.postMessage({ seedName, profile })
    return () => { active = false; worker.terminate() }
  }, [enabled, seedName, profile, worldKey])
  if (!enabled) return { worldKey, points: EMPTY_POINTS, loading: false, error: false }
  if (state.worldKey !== worldKey) return { worldKey, points: EMPTY_POINTS, loading: true, error: false }
  return state
}
