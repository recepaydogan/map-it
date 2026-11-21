import { ROCK_PREFAB, type BuildingCatalog, type PlacedPiece, type Yaw } from '../../lib/building/building-catalog.ts'
import type { Vec3 } from '../../lib/building/support-solver.ts'

/**
 * Guided scenes. Positions are transform origins the way the hammer places
 * them (pole and wall origins at their centre, floors and beams at snap
 * height), so the scenes match what a player would build with auto-snap.
 */
export interface LessonPlacement {
  prefab: string
  x: number
  y: number
  z: number
  yaw?: Yaw
  size?: Vec3
}

export interface LessonDefinition {
  id: string
  icon: 'palette' | 'layers' | 'move-horizontal' | 'bridge' | 'grid' | 'mountain-snow' | 'mountain' | 'anvil' | 'home'
  build: () => LessonPlacement[]
}

const at = (prefab: string, x: number, y: number, z: number, yaw: Yaw = 0): LessonPlacement => ({ prefab, x, y, z, yaw })
const rock = (x: number, y: number, z: number, size: Vec3): LessonPlacement => ({ prefab: ROCK_PREFAB, x, y, z, size })

/** Poles stacked from the ground; 2 m poles have their origin at mid-height. */
const tower = (prefab: string, x: number, z: number, count: number, height = 2): LessonPlacement[] =>
  Array.from({ length: count }, (_, index) => at(prefab, x, index * height + height / 2, z))

/** Beams laid end to end along +X starting at `x0`, origin at the beam centre. */
const beamRun = (prefab: string, x0: number, y: number, z: number, count: number, length = 2): LessonPlacement[] =>
  Array.from({ length: count }, (_, index) => at(prefab, x0 + length / 2 + index * length, y, z))

/** A 4 × 4 m wood storey: corner posts, eight wall panels, four floor tiles on top. */
const woodStorey = (base: number, postPrefab = 'wood_pole2'): LessonPlacement[] => [
  ...[-2, 2].flatMap((x) => [-2, 2].map((z) => at(postPrefab, x, base + 1, z))),
  ...[-1, 1].flatMap((x) => [-2, 2].map((z) => at('woodwall', x, base + 1, z, 0))),
  ...[-1, 1].flatMap((z) => [-2, 2].map((x) => at('woodwall', x, base + 1, z, 1))),
  ...[-1, 1].flatMap((x) => [-1, 1].map((z) => at('wood_floor', x, base + 2, z))),
]

export const LESSONS: readonly LessonDefinition[] = [
  {
    // Blue → green → red on one tower; the 9th pole is already gone.
    id: 'colours',
    icon: 'palette',
    build: () => tower('wood_pole2', 0, 0, 9),
  },
  {
    // Same height, four materials side by side.
    id: 'materials',
    icon: 'layers',
    build: () => [
      ...tower('wood_pole2', 0, 0, 10),
      ...tower('wood_pole_log', 4, 0, 13),
      ...tower('woodiron_pole', 8, 0, 13),
      ...tower('stone_pillar', 12, 0, 9),
    ],
  },
  {
    // A single post with beams cantilevered off its top.
    id: 'sideways',
    icon: 'move-horizontal',
    build: () => [
      ...tower('wood_pole2', 0, 0, 2),
      ...beamRun('wood_beam', 0, 4, 0, 6),
    ],
  },
  {
    // The same 8 m of beams: hanging off one post vs. held between two.
    id: 'bridge',
    icon: 'bridge',
    build: () => [
      ...tower('wood_pole2', 0, 0, 2),
      ...beamRun('wood_beam', 0, 4, 0, 4),
      ...tower('wood_pole2', 0, 6, 2),
      ...tower('wood_pole2', 8, 6, 2),
      ...beamRun('wood_beam', 0, 4, 6, 4),
    ],
  },
  {
    // Three rows of floor between two walls share the load; the same tiles past the wall fade out.
    id: 'floors',
    icon: 'grid',
    build: () => [
      ...[-1, 1].map((x) => at('woodwall', x, 1, -3, 0)),
      ...[-1, 1].map((x) => at('woodwall', x, 1, 3, 0)),
      ...[-1, 1].flatMap((x) => [-2, 0, 2].map((z) => at('wood_floor', x, 2, z))),
      ...[-1, 1].flatMap((x) => [-4, -6, -8, -10, -12].map((z) => at('wood_floor', x, 2, z))),
    ],
  },
  {
    // Stone: a column stands, anything beside it falls, anything on it holds.
    id: 'stone',
    icon: 'mountain-snow',
    build: () => [
      ...Array.from({ length: 4 }, (_, index) => at('stone_wall_2x1', 0, index + 0.5, 0)),
      at('stone_floor_2x2', 0, 4.5, 0),
      at('stone_wall_2x1', 2, 3.5, 0),
      ...Array.from({ length: 4 }, (_, index) => at('stone_wall_2x1', 8, index + 0.5, 0)),
      at('woodiron_beam', 10, 3.85, 0),
      at('stone_wall_2x1', 11, 4.5, 0),
    ],
  },
  {
    // Whatever touches a rock is fully supported, wherever the rock is.
    id: 'rock',
    icon: 'mountain',
    build: () => [
      rock(0, 4, 0, { x: 4, y: 2, z: 4 }),
      at('wood_pole2', -1, 6, 0),
      at('wood_pole2', 1, 6, 0),
      at('wood_beam', 0, 7, 0),
      ...beamRun('wood_beam', 2, 5.1, 0, 3),
      ...tower('wood_pole2', 8, 0, 3),
    ],
  },
  {
    // A wood beam touching iron reads iron's support (then caps at wood's 100).
    id: 'iron',
    icon: 'anvil',
    build: () => [
      ...tower('woodiron_pole', 0, 0, 8),
      ...beamRun('wood_beam', 0.15, 16, 0, 3),
      ...beamRun('wood_beam', 0.15, 8, 0, 3),
      ...tower('wood_pole2', 0, 8, 8),
      ...beamRun('wood_beam', 0.2, 16, 8, 3),
      ...beamRun('wood_beam', 0.2, 8, 8, 3),
    ],
  },
  {
    // A four-storey wood house: three storeys hold, the fourth turns yellow/orange.
    id: 'house',
    icon: 'home',
    build: () => [
      ...woodStorey(0),
      ...woodStorey(2),
      ...woodStorey(4),
      ...woodStorey(6),
    ],
  },
]

export const lessonById = (id: string) => LESSONS.find((lesson) => lesson.id === id) ?? null

export const buildLessonScene = (lesson: LessonDefinition, catalog: BuildingCatalog): PlacedPiece[] =>
  lesson.build().flatMap((placement, index) => {
    if (placement.prefab !== ROCK_PREFAB && !catalog.pieces.get(placement.prefab)?.bounds) return []
    return [{
      id: `${lesson.id}-${index}`,
      prefabName: placement.prefab,
      x: placement.x,
      y: placement.y,
      z: placement.z,
      yaw: placement.yaw ?? 0,
      size: placement.size,
    }]
  })
