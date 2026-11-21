import { useEffect, useMemo, useState } from 'react'
import { buildRecipeGraph } from '../../../lib/crafting/build-recipe-graph.ts'
import { localizeDisplayFields } from '../../../lib/localize-display-fields.ts'
import type { PlannerCatalogFile, RecipeGraph } from '../../../lib/crafting/recipe-types.ts'
import type { MarkerIntelligence } from '../../../types/marker-intelligence'
import { useGameLocalization } from '../../../hooks/use-localization-table.ts'

export interface PlannerCatalogState {
  graph: RecipeGraph | null
  intelligence: MarkerIntelligence | null
  loading: boolean
  error: boolean
}

interface LoadedCatalog {
  graph: RecipeGraph
  intelligence: MarkerIntelligence
}

let catalogPromise: Promise<LoadedCatalog> | null = null
const localizedCatalogCache = new WeakMap<RecipeGraph, Map<string, LoadedCatalog>>()

const fetchJson = async <Value>(url: string): Promise<Value> => {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`${url} request failed: ${response.status}`)
  return await response.json() as Value
}

/**
 * Indexes are built once per app session and shared by every planner surface,
 * which keeps the recipe graph out of the render path.
 */
const loadCatalog = () => {
  catalogPromise ??= Promise.all([
    fetchJson<PlannerCatalogFile>('/game-data/planner-catalog.json'),
    fetchJson<MarkerIntelligence>('/game-data/marker-intelligence.json'),
  ])
    .then(([catalog, intelligence]) => ({
      graph: buildRecipeGraph(catalog, intelligence.items),
      intelligence,
    }))
    .catch((error: unknown) => {
      catalogPromise = null
      throw error
    })
  return catalogPromise
}

export function usePlannerCatalog(): PlannerCatalogState {
  const localization = useGameLocalization()
  const [state, setState] = useState<PlannerCatalogState>({
    graph: null,
    intelligence: null,
    loading: true,
    error: false,
  })

  useEffect(() => {
    let active = true
    loadCatalog()
      .then(({ graph, intelligence }) => {
        if (!active) return
        setState({ graph, intelligence, loading: false, error: false })
      })
      .catch((error: unknown) => {
        if (!active) return
        console.error('[Planner] Failed to load the planner catalog', error)
        setState({ graph: null, intelligence: null, loading: false, error: true })
      })
    return () => { active = false }
  }, [])

  return useMemo(() => {
    if (!localization || localization.language === 'en' || !state.graph || !state.intelligence) return state
    let variants = localizedCatalogCache.get(state.graph)
    if (!variants) {
      variants = new Map()
      localizedCatalogCache.set(state.graph, variants)
    }
    let translated = variants.get(localization.language)
    if (!translated) {
      const translate = localization.translateText
      translated = {
        graph: {
          ...state.graph,
          items: new Map([...state.graph.items].map(([key, item]) => [key, { ...item, name: translate(item.name) }])),
          stations: new Map([...state.graph.stations].map(([key, station]) => [key, { ...station, name: translate(station.name) }])),
        },
        intelligence: localizeDisplayFields(state.intelligence, translate),
      }
      variants.set(localization.language, translated)
    }
    return { ...state, ...translated }
  }, [state, localization])
}
