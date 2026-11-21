import { useEffect, useMemo, useState } from 'react'
import {
  indexBuildingCatalog,
  type BuildingCatalog,
  type BuildingCatalogFile,
} from '../../../lib/building/building-catalog.ts'
import { useGameLocalization } from '../../../hooks/use-localization-table.ts'

export interface BuildingCatalogState {
  catalog: BuildingCatalog | null
  loading: boolean
  error: boolean
}

let catalogPromise: Promise<BuildingCatalog> | null = null

const loadCatalog = () => {
  catalogPromise ??= fetch('/game-data/building-catalog.json')
    .then(async (response) => {
      if (!response.ok) throw new Error(`building-catalog.json request failed: ${response.status}`)
      return indexBuildingCatalog(await response.json() as BuildingCatalogFile)
    })
    .catch((error: unknown) => {
      catalogPromise = null
      throw error
    })
  return catalogPromise
}

/** The hammer piece catalog with WearNTear data, fetched once per session. */
export function useBuildingCatalog(): BuildingCatalogState {
  const localization = useGameLocalization()
  const [state, setState] = useState<BuildingCatalogState>({ catalog: null, loading: true, error: false })

  useEffect(() => {
    let active = true
    loadCatalog()
      .then((catalog) => {
        if (active) setState({ catalog, loading: false, error: false })
      })
      .catch((error: unknown) => {
        if (!active) return
        console.error('[Building] Failed to load the building catalog', error)
        setState({ catalog: null, loading: false, error: true })
      })
    return () => { active = false }
  }, [])

  return useMemo(() => {
    if (!localization || localization.language === 'en' || !state.catalog) return state
    const translate = localization.translateText
    return {
      ...state,
      catalog: {
        ...state.catalog,
        pieces: new Map([...state.catalog.pieces].map(([key, piece]) => [key, {
          ...piece,
          name: translate(piece.name),
          resources: piece.resources.map((resource) => ({ ...resource, name: translate(resource.name) })),
        }])),
      },
    }
  }, [state, localization])
}
