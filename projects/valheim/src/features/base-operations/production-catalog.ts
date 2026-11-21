import { useEffect, useState } from 'react'

export interface ProductionConversionDefinition {
  inputAmount?: number
  fuelOnly?: boolean
  inputPrefab: string
  outputPrefab: string
  outputAmount: number
  cookTimeSeconds: number
}

export interface ProductionStationDefinition {
  prefabName: string
  icon?: string | null
  maxInput: number
  maxFuel: number
  secondsPerProduct: number
  fuelPrefab: string
  fuelPerProduct: number
  fermentationSeconds: number
  conversions: ProductionConversionDefinition[]
}

export type ProductionStationCatalog = Record<string, ProductionStationDefinition>

interface ProductionCatalogFile {
  schemaVersion: number
  gameBuild: string
  stations: ProductionStationCatalog
}

let catalogRequest: Promise<ProductionStationCatalog> | null = null

function loadProductionCatalog(): Promise<ProductionStationCatalog> {
  catalogRequest ??= fetch('/game-data/production-catalog.json')
    .then((response) => {
      if (!response.ok) throw new Error(`Production catalog request failed: ${response.status}`)
      return response.json() as Promise<ProductionCatalogFile>
    })
    .then((file) => file.stations ?? {})
    .catch(() => ({}))
  return catalogRequest
}

export function useProductionCatalog(): ProductionStationCatalog {
  const [catalog, setCatalog] = useState<ProductionStationCatalog>({})
  useEffect(() => {
    let active = true
    void loadProductionCatalog().then((loaded) => {
      if (active) setCatalog(loaded)
    })
    return () => { active = false }
  }, [])
  return catalog
}
