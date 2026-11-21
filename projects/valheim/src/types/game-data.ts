export interface DataSummary {
  extraction: {
    assets: number
    locations: number
    characters: number
    bosses: number
    items: number
    recipes: number
    pieces: number
    traders: number
    typedPrefabs: number
  }
  locations: {
    rules: number
    active: number
    withContents: number
  }
  languages: string[]
}

export interface GameReference {
  name?: string
  path?: string
  category?: string
}

export interface SemanticComponent {
  kind: string
  objectName: string
  objectPath: string
  localPosition?: Record<string, number>
  script?: Record<string, unknown>
  data: Record<string, unknown>
}

export interface LocationItemSource {
  itemPrefab: string
  kind: 'trader' | 'creature' | 'boss' | 'loot' | 'pickable' | 'destructible'
  sourcePrefab: string
}

export interface LocationRecord {
  id: string
  prefabName: string
  enabled: boolean
  detailPath?: string
  /** Names and prefabs obtainable here, including possible dungeon room loot. */
  searchTerms?: string[]
  itemSources?: LocationItemSource[]
  placement: {
    /** The location list entry's own name; differs from prefabName when a prefab is reused (BogWitch_Camp → Hildir_camp). */
    name?: string
    prefabName?: string
    biomes?: string[]
    biomeArea?: number
    quantity?: number
    prioritized?: number
    centerFirst?: number
    unique?: number
    group?: string
    groupMax?: string
    minDistanceFromSimilar?: number
    maxDistanceFromSimilar?: number
    interiorRadius?: number
    exteriorRadius?: number
    minTerrainDelta?: number
    maxTerrainDelta?: number
    minimumVegetation?: number
    maximumVegetation?: number
    surroundCheckVegetation?: number
    surroundCheckDistance?: number
    surroundCheckLayers?: number
    surroundBetterThanAverage?: number
    inForest?: number
    forestTresholdMin?: number
    forestTresholdMax?: number
    minDistanceFromCenter?: number
    maxDistanceFromCenter?: number
    minDistance?: number
    maxDistance?: number
    minAltitude?: number
    maxAltitude?: number
    sourceList?: string
    altBiomeParent?: string
    biome?: number
  }
  contents: null | {
    assetPath?: string
    bundle?: string
    hierarchyObjectCount: number
    objectNameCounts?: Record<string, number>
    componentKindCounts: Record<string, number>
    semanticComponents: SemanticComponent[]
    referencedAssets: Array<{
      name: string
      count: number
      candidates: GameReference[]
    }>
  }
}

export interface LocationIndex {
  locations: LocationRecord[]
}
