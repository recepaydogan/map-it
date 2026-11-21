import { ROCK_PREFAB, type BuildingCatalog, type PlacedPiece, type Yaw } from '../../lib/building/building-catalog.ts'
import type { Vec3 } from '../../lib/building/support-solver.ts'

export interface BlueprintPlacement {
  prefab: string
  x: number
  y: number
  z: number
  yaw?: Yaw
  size?: Vec3
}

export interface BlueprintDefinition {
  id: string
  titleKey: string
  descriptionKey: string
  category: 'house' | 'tower' | 'bridge' | 'bastion'
  icon: string
  build: () => BlueprintPlacement[]
}

const at = (prefab: string, x: number, y: number, z: number, yaw: Yaw = 0): BlueprintPlacement => ({ prefab, x, y, z, yaw })
const rock = (x: number, y: number, z: number, size: Vec3): BlueprintPlacement => ({ prefab: ROCK_PREFAB, x, y, z, size })

/** Beam run along X */
const beamRunX = (prefab: string, x0: number, y: number, z: number, count: number, length = 2): BlueprintPlacement[] =>
  Array.from({ length: count }, (_, index) => at(prefab, x0 + length / 2 + index * length, y, z, 0))

export const BLUEPRINTS: readonly BlueprintDefinition[] = [
  {
    id: 'longhouse_frame',
    titleKey: 'building.blueprints.longhouse.title',
    descriptionKey: 'building.blueprints.longhouse.desc',
    category: 'house',
    icon: 'home',
    build: () => [
      // Floor grid 4x8m (-2 to 2 in X, -4 to 4 in Z)
      ...[-1, 1].flatMap((x) => [-3, -1, 1, 3].map((z) => at('wood_floor', x, 0.05, z))),
      // Perimeter wood walls
      ...[-3, -1, 1, 3].flatMap((z) => [at('woodwall', -2, 1, z, 1), at('woodwall', 2, 1, z, 1)]),
      ...[-1, 1].flatMap((x) => [at('woodwall', x, 1, -4, 0), at('woodwall', x, 1, 4, 0)]),
      // Corner & mid posts
      ...[-2, 2].flatMap((x) => [-4, -2, 0, 2, 4].map((z) => at('wood_pole2', x, 1, z))),
      // Core wood central spine pillars (4m high)
      at('wood_pole_log_4', 0, 2, -4),
      at('wood_pole_log_4', 0, 2, 0),
      at('wood_pole_log_4', 0, 2, 4),
      // Central roof ridge log beams
      at('wood_wall_log_4x0.5', 0, 4, -2, 1),
      at('wood_wall_log_4x0.5', 0, 4, 2, 1),
      // Perimeter top perimeter beams
      ...[-3, -1, 1, 3].flatMap((z) => [at('wood_beam', -2, 2, z, 1), at('wood_beam', 2, 2, z, 1)]),
      ...[-1, 1].flatMap((x) => [at('wood_beam', x, 2, -4, 0), at('wood_beam', x, 2, 4, 0)]),
    ],
  },
  {
    id: 'iron_spire',
    titleKey: 'building.blueprints.ironSpire.title',
    descriptionKey: 'building.blueprints.ironSpire.desc',
    category: 'tower',
    icon: 'anvil',
    build: () => [
      // 4 Stone base pillars (6m high = 3 stacked 2x1 stone walls)
      ...[-2, 2].flatMap((x) => [-2, 2].flatMap((z) => [
        at('stone_wall_2x1', x, 0.5, z, 0),
        at('stone_wall_2x1', x, 1.5, z, 0),
        at('stone_wall_2x1', x, 2.5, z, 0),
      ])),
      // Stone floor platform at 3m
      ...[-1, 1].flatMap((x) => [-1, 1].map((z) => at('stone_floor_2x2', x, 3, z))),
      // 4 Iron core poles reaching from 3m up to 15m (6 iron poles each)
      ...[-2, 2].flatMap((x) => [-2, 2].flatMap((z) =>
        Array.from({ length: 6 }, (_, index) => at('woodiron_pole', x, 3 + index * 2 + 1, z)),
      )),
      // Top lookout deck at 15m
      ...[-1, 1].flatMap((x) => [-1, 1].map((z) => at('wood_floor', x, 15, z))),
      // Top perimeter walls
      ...[-1, 1].flatMap((x) => [at('wood_wall_half', x, 15.5, -2, 0), at('wood_wall_half', x, 15.5, 2, 0)]),
      ...[-1, 1].flatMap((z) => [at('wood_wall_half', -2, 15.5, z, 1), at('wood_wall_half', 2, 15.5, z, 1)]),
    ],
  },
  {
    id: 'arch_bridge',
    titleKey: 'building.blueprints.archBridge.title',
    descriptionKey: 'building.blueprints.archBridge.desc',
    category: 'bridge',
    icon: 'bridge',
    build: () => [
      // Natural rock abutments on left and right
      rock(-6, 2, 0, { x: 4, y: 4, z: 6 }),
      rock(6, 2, 0, { x: 4, y: 4, z: 6 }),
      // Stone pillars on the bridge abutments
      at('stone_pillar', -4.2, 4.5, -1.5),
      at('stone_pillar', -4.2, 4.5, 1.5),
      at('stone_pillar', 4.2, 4.5, -1.5),
      at('stone_pillar', 4.2, 4.5, 1.5),
      // Iron span beams across the 8m gorge
      ...beamRunX('woodiron_beam', -4, 4.2, -1.5, 4),
      ...beamRunX('woodiron_beam', -4, 4.2, 1.5, 4),
      // Bridge wooden deck
      ...[-3, -1, 1, 3].flatMap((x) => [-0.5, 0.5].map((z) => at('wood_floor_1x1', x, 4.3, z))),
      // Guardrails
      ...beamRunX('wood_beam', -4, 5.1, -1.5, 4),
      ...beamRunX('wood_beam', -4, 5.1, 1.5, 4),
    ],
  },
  {
    id: 'marble_bastion',
    titleKey: 'building.blueprints.marbleBastion.title',
    descriptionKey: 'building.blueprints.marbleBastion.desc',
    category: 'bastion',
    icon: 'layers',
    build: () => [
      // 4 Black marble solid corner bases
      ...[-3, 3].flatMap((x) => [-3, 3].map((z) => at('blackmarble_2x2x2', x, 1, z))),
      // Marble columns stacked 2-high on corners
      ...[-3, 3].flatMap((x) => [-3, 3].flatMap((z) => [
        at('blackmarble_column_2', x, 2.5, z),
        at('blackmarble_column_2', x, 3.5, z),
      ])),
      // Upper marble floor at 4.5m
      ...[-2, 0, 2].flatMap((x) => [-2, 0, 2].map((z) => at('blackmarble_floor', x, 4.5, z))),
      // Central elevated altar
      at('blackmarble_2x1x1', 0, 5, 0),
    ],
  },
]

export const blueprintById = (id: string) => BLUEPRINTS.find((bp) => bp.id === id) ?? null

export const buildBlueprintScene = (blueprint: BlueprintDefinition, catalog: BuildingCatalog): PlacedPiece[] =>
  blueprint.build().flatMap((placement, index) => {
    if (placement.prefab !== ROCK_PREFAB && !catalog.pieces.get(placement.prefab)?.bounds) return []
    return [{
      id: `${blueprint.id}-${index}`,
      prefabName: placement.prefab,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      yaw: placement.yaw ?? 0,
      size: placement.size,
    }]
  })
