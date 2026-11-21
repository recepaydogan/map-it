// Builds public/game-data/building-catalog.json from data/generated/building-data.json
// (see tools/extract-building-data.py): every hammer piece with a WearNTear
// component, its material class, health, wear flags, side-view bounds and the
// material constants from WearNTear.GetMaterialProperties.
import fs from 'node:fs'
import path from 'node:path'
import { createPieceIconResolver } from './piece-icons.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const generatedDirectory = path.join(projectRoot, 'data', 'generated')
const outputDirectory = path.join(projectRoot, 'public', 'game-data')

const readJson = (directory, filename) =>
  JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'))

const buildingData = readJson(generatedDirectory, 'building-data.json')
const localization = readJson(generatedDirectory, 'localization.json')
const markerDetails = readJson(generatedDirectory, 'marker-details.json')
const iconManifest = fs.existsSync(path.join(outputDirectory, 'icon-manifest.json'))
  ? readJson(outputDirectory, 'icon-manifest.json')
  : { icons: {} }

// WearNTear.MaterialType enum order; the values are the switch in
// WearNTear.GetMaterialProperties.
const MATERIALS = ['Wood', 'Stone', 'Iron', 'HardWood', 'Marble', 'Ashstone', 'Ancient']
const MATERIAL_PROPERTIES = {
  Wood: { maxSupport: 100, minSupport: 10, verticalLoss: 0.125, horizontalLoss: 0.2 },
  HardWood: { maxSupport: 140, minSupport: 10, verticalLoss: 0.1, horizontalLoss: 1 / 6 },
  Stone: { maxSupport: 1000, minSupport: 100, verticalLoss: 0.125, horizontalLoss: 1 },
  Iron: { maxSupport: 1500, minSupport: 20, verticalLoss: 1 / 13, horizontalLoss: 1 / 13 },
  Marble: { maxSupport: 1500, minSupport: 100, verticalLoss: 0.125, horizontalLoss: 0.5 },
  Ashstone: { maxSupport: 2000, minSupport: 100, verticalLoss: 0.1, horizontalLoss: 1 / 3 },
  Ancient: { maxSupport: 5000, minSupport: 100, verticalLoss: 1 / 15, horizontalLoss: 0.25 },
}
const COMFORT_GROUPS = ['None', 'Fire', 'Bed', 'Banner', 'Chair', 'Table', 'Carpet']

const localize = (value, fallback = '') => {
  if (typeof value !== 'string' || !value) return fallback
  const key = value.trim().replace(/^\$/, '')
  return localization.english?.[key] ?? (value.startsWith('$') ? fallback : value)
}

const formatPrefabName = (value) => value
  .replace(/^piece_/i, '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^./, (character) => character.toUpperCase())

const itemsByPrefab = new Map(markerDetails.items.map((item) => [item.prefabName.toLowerCase(), item]))
const itemName = (prefabName) => {
  const item = itemsByPrefab.get(prefabName.toLowerCase())
  return item?.displayName || localize(item?.displayNameKey, formatPrefabName(prefabName))
}

const pieceIcon = createPieceIconResolver(iconManifest)

const round = (value) => Math.round(value * 1000) / 1000
const unionBounds = (boxes) => {
  const usable = boxes.filter((box) => box.enabled)
  if (usable.length === 0) return null
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (const box of usable) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], box.bounds.min[axis])
      max[axis] = Math.max(max[axis], box.bounds.max[axis])
    }
  }
  return { min: min.map(round), max: max.map(round) }
}

const hammerPieces = new Set(buildingData.pieceTables._HammerPieceTable ?? [])
const pieces = []
for (const prefab of buildingData.prefabs) {
  if (!hammerPieces.has(prefab.prefabName) || !prefab.wearNTear || !prefab.piece) continue
  const wear = prefab.wearNTear
  const piece = prefab.piece
  const material = MATERIALS[wear.materialType] ?? 'Wood'
  const bounds = unionBounds(prefab.geometry.boxColliders)
  const boxes = prefab.geometry.boxColliders.filter((box) => box.enabled)
  pieces.push({
    prefabName: prefab.prefabName,
    name: localize(piece.name, formatPrefabName(prefab.prefabName)),
    icon: pieceIcon(prefab.prefabName, piece),
    category: piece.category ?? 0,
    enabled: Boolean(piece.enabled),
    material,
    health: wear.health,
    supports: Boolean(wear.supports),
    noRoofWear: Boolean(wear.noRoofWear),
    noSupportWear: Boolean(wear.noSupportWear),
    ashDamageImmune: Boolean(wear.ashDamageImmune),
    ashDamageResist: Boolean(wear.ashDamageResist),
    burnable: Boolean(wear.burnable),
    forceCorrectCom: Boolean(wear.forceCorrectCOMCalculation),
    comfort: piece.comfort ?? 0,
    comfortGroup: COMFORT_GROUPS[piece.comfortGroup ?? 0] ?? 'None',
    station: piece.craftingStation?.name ?? null,
    resources: (piece.resources ?? [])
      .filter((resource) => resource.resItem?.name)
      .map((resource) => ({
        prefabName: resource.resItem.name,
        name: itemName(resource.resItem.name),
        amount: resource.amount ?? 1,
      })),
    comOffset: [round(wear.comOffset?.x ?? 0), round(wear.comOffset?.y ?? 0), round(wear.comOffset?.z ?? 0)],
    bounds,
    // Whether the side-view rectangle is exact: only axis-aligned boxes and
    // no mesh/capsule colliders that the rectangle cannot represent.
    boxy: bounds !== null && boxes.every((box) => box.axisAligned) && prefab.geometry.otherColliders === 0,
    snapPoints: prefab.geometry.snapPoints.map((point) => point.position.map(round)),
  })
}
pieces.sort((a, b) => a.prefabName.localeCompare(b.prefabName))

const output = {
  schemaVersion: 1,
  materials: MATERIAL_PROPERTIES,
  pieces,
}
fs.mkdirSync(outputDirectory, { recursive: true })
fs.writeFileSync(path.join(outputDirectory, 'building-catalog.json'), `${JSON.stringify(output)}\n`)
const byMaterial = pieces.reduce((counts, piece) => {
  counts[piece.material] = (counts[piece.material] ?? 0) + 1
  return counts
}, {})
console.log(`building-catalog.json: ${pieces.length} pieces`, byMaterial, `icons missing: ${pieces.filter((piece) => !piece.icon).length}`)
