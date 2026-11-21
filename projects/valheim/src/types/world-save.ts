export interface ValheimWorldSave {
  id: string
  fileName: string
  name: string
  seedName: string
  seed: number
  uid: string
  worldVersion: number
  worldGenVersion: number
  needsDatabase: boolean
  fwlPath: string
  databasePath: string | null
  /** Mapping for a committed 1.0 chunked save; absent for legacy worlds. */
  chunksPath?: string
  /** Elapsed world clock read from the small .db header; null when unavailable. */
  worldTimeSeconds?: number | null
  source: 'local' | 'steam-cloud' | 'remembered'
}

export interface SavedLocation {
  prefabName: string
  x: number
  y: number
  height: number
  placed: boolean
}

/** A player-placed chest as the save file has it (the last time the world was saved). */
export interface SavedContainer {
  prefabName: string
  x: number
  y: number
  height: number
  /** Player id of who placed it; "0" for world-generated pieces. */
  creator: string
  items: Array<{ prefab: string; amount: number; quality: number }>
}

export interface SavedWorldObject {
  prefabName: string
  componentKinds: string[]
  x: number
  y: number
  height: number
  properties: Record<string, unknown>
}

/** A player-built portal reconstructed from its saved ZDO snapshot. */
export interface SavedPortal {
  /** Live fallback pairs confirmed endpoints by position, independent of session ZDO ids. */
  connectionKey?: string | null
  prefabName: string
  x: number
  y: number
  height: number
  /** Saved Unity Y rotation in degrees; determines arrival position and facing. */
  yaw: number
  creator: string
  tag: string
  author: string
  /** Portal (1) or Portal|Target (17) in ZDOExtraData.ConnectionType. */
  connectionType: number | null
  /** Both endpoints of a connected portal pair persist the same hash. */
  connectionHash: number | null
}

/** The small subset of a production-piece ZDO that is useful to players. */
export interface SavedProductionStation {
  /** Fallback stations keep their observation clock when the player leaves the area. */
  observedWorldTimeTicks?: number
  prefabName: string
  x: number
  y: number
  height: number
  creator: string
  fuel: number
  queued: number
  level: number
  /** Fractional progress used by passive producers such as beehives and sap collectors. */
  productProgress: number
  /** Finished stacked output still waiting at stations such as windmills. */
  processedOutputPrefab: string
  processedOutputAmount: number
  content: string
  bakeTimer: number
  startTimeTicks: number
  lastTimeTicks: number
  queueItems: string[]
  /** Optional for compatibility with snapshots parsed before cooking slots were added. */
  slotStatuses?: number[]
  /** Elapsed cook time for each occupied cooking slot. */
  slotCookTimes?: number[]
}

export interface SavedBaseOperations {
  portals: SavedPortal[]
  stations: SavedProductionStation[]
}

/** A compact group of connected player-placed Piece ZDOs. */
export interface SavedStructureCluster {
  id: string
  x: number
  z: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
  pieceCount: number
}

/**
 * Compact top-down geometry for player-placed pieces. Parallel typed arrays
 * keep even very large bases cheap to transfer out of the save worker.
 */
export interface SavedStructureGeometry {
  count: number
  x: Float32Array
  z: Float32Array
  width: Float32Array
  depth: Float32Array
  yaw: Float32Array
  kind: Uint8Array
  material: Uint8Array
}

/**
 * Column-per-field arrays for every harvestable world object retained from the
 * save. Kept as typed arrays so a large world (hundreds of thousands of trees,
 * bushes, and deposits) transfers out of the parser worker without copying and
 * stays compact in memory.
 */
export interface SaveResourceNodes {
  count: number
  prefabHashes: Int32Array
  /** World x coordinate (matches map marker space). */
  x: Float32Array
  /** World z coordinate (the save's third position component). */
  z: Float32Array
  /** 1 when the ZDO carries picked=true. */
  picked: Uint8Array
  /** ZNet game-clock ticks at pick time; 0 when never picked. */
  pickedTimeTicks: Float64Array
  /** 1 when the ZDO carries any health value (damaged tree, partially mined rock). */
  damaged: Uint8Array
  /** 1 when the ZDO carries enabled=false. */
  disabled: Uint8Array
}

export interface SaveResourceState {
  /** World game clock in seconds, straight from the save header. */
  netTimeSeconds: number
  /** The same clock in .NET ticks, the unit picked_time is stored in. */
  worldTimeTicks: number
  /** Flat [zx0, zy0, zx1, zy1, ...] pairs of zones the game has generated. */
  generatedZones: Int32Array
  nodes: SaveResourceNodes
}

export interface ValheimWorldDatabase {
  databaseVersion: number
  globalKeys: string[]
  generatedZoneCount: number
  locationsGenerated: boolean
  locations: SavedLocation[]
  trackedObjects: SavedWorldObject[]
  containers: SavedContainer[]
  /** Player-built portal and production state from the last world save. */
  baseOperations: SavedBaseOperations
  /** Player structures grouped in the parser worker for counts and filtering. */
  structures: SavedStructureCluster[]
  /** Actual piece footprints pre-combined into a bounded number of SVG paths in the worker. */
  structurePaths: string[]
  prefabCounts: Record<string, number>
  resourceState: SaveResourceState
}

export interface SavePrefabType {
  prefabName: string
  componentKinds: string[]
  pieceMaterial?: string
  pieceBounds?: { min: [number, number, number]; max: [number, number, number] } | null
}
