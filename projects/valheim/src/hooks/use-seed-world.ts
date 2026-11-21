import { useEffect, useMemo, useState } from 'react'
import type { GeneratedLocationMarker, LocationGenerationProfile } from '../lib/valheim/location-generator'
import type { LocationRecord } from '../types/game-data'
import { locationGenerationRules } from '../lib/valheim/location-generation-rules.mjs'

interface SeedProgress {
  completed: number
  total: number
  prefabName: string
}

export function useSeedWorld(
  seedName: string,
  locations: LocationRecord[],
  enabled = true,
  profile: LocationGenerationProfile = 'current',
) {
  const [state, setState] = useState<{
    seedName: string
    markers: GeneratedLocationMarker[]
    progress: SeedProgress | null
    generating: boolean
    error: string | null
    profile: 'current' | 'legacy'
  }>({ seedName: '', markers: [], progress: null, generating: false, error: null, profile: 'current' })
  const rules = useMemo(
    () => locationGenerationRules(locations),
    [locations],
  )

  useEffect(() => {
    if (!enabled || rules.length === 0) return
    const worker = new Worker(
      new URL('../workers/seed-generator.worker.ts', import.meta.url),
      { type: 'module' },
    )
    worker.onmessage = (event) => {
      const message = event.data
      if (message.type === 'pregenerated') {
        setState({ seedName, markers: [], progress: null, generating: true, error: null, profile })
      } else if (message.type === 'progress') {
        setState({
          seedName,
          markers: [],
          progress: {
            completed: message.completed,
            total: message.total,
            prefabName: message.prefabName,
          },
          generating: true,
          error: null,
          profile,
        })
      } else if (message.type === 'complete') {
        setState({
          seedName,
          markers: message.markers,
          progress: null,
          generating: false,
          error: null,
          profile: message.profile === 'legacy' ? 'legacy' : 'current',
        })
      } else if (message.type === 'error') {
        setState({
          seedName,
          markers: [],
          progress: null,
          generating: false,
          error: message.message,
          profile,
        })
      }
    }
    worker.onerror = (event) => {
      setState({
        seedName,
        markers: [],
        progress: null,
        generating: false,
        error: event.message,
        profile,
      })
    }
    worker.postMessage({ seedName, locations: rules, profile })
    return () => worker.terminate()
  }, [enabled, rules, seedName, profile])

  if (!enabled) return { markers: [], progress: null, generating: false, error: null, profile }
  if (state.seedName !== seedName || state.profile !== profile) {
    return { markers: [], progress: null, generating: true, error: null, profile }
  }
  return state
}
