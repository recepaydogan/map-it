import { memo } from 'react'
import {
  STRUCTURE_KIND_DETAIL,
  STRUCTURE_KIND_FLOOR,
  STRUCTURE_KIND_ROOF,
  STRUCTURE_KIND_WALL,
  STRUCTURE_MATERIAL_ASH,
  STRUCTURE_MATERIAL_MARBLE,
  STRUCTURE_MATERIAL_METAL,
  STRUCTURE_MATERIAL_OTHER,
  STRUCTURE_MATERIAL_STONE,
  STRUCTURE_MATERIAL_WOOD,
  STRUCTURE_MATERIAL_COUNT,
} from '../lib/valheim/structure-geometry.ts'

const WORLD_DIAMETER = 21_000
const MIN_STRUCTURE_ZOOM = 5
const materialFill = [
  'var(--map-structure-wood)',
  'var(--map-structure-stone)',
  'var(--map-structure-metal)',
  'var(--map-structure-marble)',
  'var(--map-structure-ash)',
  'var(--map-structure-other)',
] as const

const structureKinds = [STRUCTURE_KIND_FLOOR, STRUCTURE_KIND_DETAIL, STRUCTURE_KIND_WALL, STRUCTURE_KIND_ROOF] as const
const structureMaterials = [
  STRUCTURE_MATERIAL_WOOD,
  STRUCTURE_MATERIAL_STONE,
  STRUCTURE_MATERIAL_METAL,
  STRUCTURE_MATERIAL_MARBLE,
  STRUCTURE_MATERIAL_ASH,
  STRUCTURE_MATERIAL_OTHER,
] as const
const structureStyles = structureKinds.flatMap((kind) =>
  structureMaterials.map((material) => ({ kind, material })),
)

const kindOpacity = [0.78, 0.88, 0.96, 0.9] as const

const StructurePaths = memo(function StructurePaths({ paths }: { paths: readonly string[] }) {
  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[8] size-full"
      viewBox={`${-WORLD_DIAMETER / 2} ${-WORLD_DIAMETER / 2} ${WORLD_DIAMETER} ${WORLD_DIAMETER}`}
      preserveAspectRatio="none"
      opacity={0.98}
      shapeRendering="optimizeSpeed"
      aria-hidden="true"
    >
      {structureStyles.map(({ kind, material }) => {
        const path = paths[kind * STRUCTURE_MATERIAL_COUNT + material]
        return path ? (
          <path
            key={`${kind}:${material}`}
            d={path}
            fill={materialFill[material]}
            fillOpacity={kindOpacity[kind]}
            stroke="var(--map-structure-outline)"
            strokeWidth={kind === STRUCTURE_KIND_WALL ? 0.18 : 0.1}
            strokeLinejoin="round"
          />
        ) : null
      })}
    </svg>
  )
})

/**
 * Actual player-built piece layout as a handful of vector paths. A 20,000-piece
 * town still creates at most 24 SVG nodes instead of 20,000 React elements.
 */
export function StructureLayer({
  paths,
  zoom,
}: {
  paths: readonly string[]
  zoom: number
}) {
  // At world scale even a large house is sub-pixel. Skipping the SVG there
  // avoids making the browser tessellate thousands of invisible rectangles.
  if (zoom < MIN_STRUCTURE_ZOOM) return null

  return <StructurePaths paths={paths} />
}
