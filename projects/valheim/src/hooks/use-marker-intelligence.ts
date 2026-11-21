import { useEffect, useMemo, useState } from 'react'
import { localizeDisplayFields } from '../lib/localize-display-fields'
import type { MarkerIntelligence } from '../types/marker-intelligence'
import { useGameLocalization } from './use-localization-table'

let catalogPromise: Promise<MarkerIntelligence> | null = null

const loadCatalog = () => {
  catalogPromise ??= fetch('/game-data/marker-intelligence.json')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Marker intelligence request failed: ${response.status}`)
      }
      return response.json() as Promise<MarkerIntelligence>
    })
    .catch((error: unknown) => {
      catalogPromise = null
      throw error
    })
  return catalogPromise
}

export function useMarkerIntelligence() {
  const [catalog, setCatalog] = useState<MarkerIntelligence | null>(null)
  const [error, setError] = useState(false)
  const localization = useGameLocalization()

  useEffect(() => {
    let active = true
    loadCatalog()
      .then((payload) => {
        if (!active) return
        setCatalog(payload)
        setError(false)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        console.error(loadError)
        setError(true)
      })
    return () => {
      active = false
    }
  }, [])

  const displayedCatalog = useMemo(
    () => catalog && localization && localization.language !== 'en'
      ? localizeDisplayFields(catalog, localization.translateText)
      : catalog,
    [catalog, localization],
  )
  return { catalog: displayedCatalog, error, loading: !catalog && !error }
}
