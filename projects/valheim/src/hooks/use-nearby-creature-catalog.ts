import { useEffect, useMemo, useState } from 'react'
import {
  cleanCreatureLabel,
  createNearbyCreatureCatalog,
  type NearbyCreatureCatalogEntry,
} from '../lib/live-tracking/creature-catalog.ts'
import { useGameLocalization } from './use-localization-table.ts'

const emptyCatalog: readonly NearbyCreatureCatalogEntry[] = []
let cachedCatalog: readonly NearbyCreatureCatalogEntry[] | null = null
let catalogRequest: Promise<readonly NearbyCreatureCatalogEntry[]> | null = null

function loadCatalog() {
  if (cachedCatalog) return Promise.resolve(cachedCatalog)
  catalogRequest ??= fetch('/game-data/nearby-creature-catalog.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Prefab index request failed: ${response.status}`)
      return response.json() as Promise<{
        schemaVersion: number
        creatures: Array<{ prefab: string; nameToken: string | null; label: string | null }>
      }>
    })
    .then(({ creatures }) => {
      cachedCatalog = createNearbyCreatureCatalog(creatures)
      return cachedCatalog
    })
    .catch((error) => {
      catalogRequest = null
      throw error
    })
  return catalogRequest
}

/** Loads the small, static list once; opening the creature section does no parsing. */
export function useNearbyCreatureCatalog(): readonly NearbyCreatureCatalogEntry[] {
  const localization = useGameLocalization()
  const [catalog, setCatalog] = useState<readonly NearbyCreatureCatalogEntry[]>(
    () => cachedCatalog ?? emptyCatalog,
  )

  useEffect(() => {
    let cancelled = false
    void loadCatalog()
      .then((next) => { if (!cancelled) setCatalog(next) })
      .catch(() => { /* Fail closed: without the allowlist, no creature is drawn. */ })
    return () => { cancelled = true }
  }, [])

  return useMemo(() => {
    if (!localization || localization.language === 'en') return catalog
    return catalog.map((creature) => ({
      ...creature,
      label: cleanCreatureLabel(
        (creature.nameToken && localization.table[creature.nameToken.replace(/^\$/, '')])
        || localization.translateText(creature.label),
      ),
    })).sort((first, second) => first.label.localeCompare(second.label, localization.language))
  }, [catalog, localization])
}
