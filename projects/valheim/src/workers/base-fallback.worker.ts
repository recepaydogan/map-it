import type { BaseMemory } from '../lib/live-tracking/base-fallback.ts'
import type { BuildingCatalogFile } from '../lib/building/building-catalog.ts'
import { StructureGeometryBuilder } from '../lib/valheim/structure-geometry.ts'
import { clusterPlayerStructures } from '../lib/valheim/structure-clustering.ts'
import { buildStructureMapPaths } from '../lib/valheim/structure-map-paths.ts'

let catalogPromise: Promise<BuildingCatalogFile | null> | null = null
let previousSignature = ''
let request = 0
self.onmessage = async (event: MessageEvent<BaseMemory>) => {
  const current = ++request
  catalogPromise ??= fetch('/game-data/building-catalog.json').then(async response => {
    if (!response.ok) throw new Error('Building catalog unavailable')
    return await response.json() as BuildingCatalogFile
  }).catch(() => null)
  const catalog = await catalogPromise
  if (current !== request) return
  const definitions = new Map(catalog?.pieces.map(piece => [piece.prefabName, piece]))
  const pieces = Object.values(event.data.pieces).sort((a, b) => a.id.localeCompare(b.id))
  const signature = JSON.stringify([event.data.worldUid, pieces.map(piece => [piece.id, piece.prefabName, piece.x, piece.z, piece.yaw])])
  if (signature === previousSignature) return
  previousSignature = signature
  const geometry = new StructureGeometryBuilder()
  for (const piece of pieces) {
    const definition = definitions.get(piece.prefabName)
    geometry.push({ ...piece, material: definition?.material, bounds: definition?.bounds })
  }
  self.postMessage({ worldUid: event.data.worldUid, structures: clusterPlayerStructures(pieces),
    structurePaths: buildStructureMapPaths(geometry.build()) })
}
