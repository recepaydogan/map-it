/** The shipped Minimap prefab uses 12 world metres per exploration pixel. */
export const EXPLORATION_PIXEL_SIZE = 12

export interface ExploredMap {
  textureSize: number
  /** Personal exploration only, packed least-significant bit first. */
  bits: Uint8Array
  /** Live maps use the game's actual scale, including supported map-size mods. */
  pixelSize?: number
}

export function packExploredMap(textureSize: number, own: Uint8Array): ExploredMap {
  const count = textureSize * textureSize
  if (!Number.isInteger(textureSize) || textureSize <= 0 || textureSize > 4096
    || own.length !== count) throw new Error('Invalid explored map size')
  const bits = new Uint8Array(Math.ceil(count / 8))
  for (let i = 0; i < count; i++) {
    if (own[i]) bits[i >> 3] |= 1 << (i & 7)
  }
  return { textureSize, bits }
}

export function isMapPointExplored(map: ExploredMap | null, x: number, z: number): boolean {
  if (!map || !Number.isFinite(x) || !Number.isFinite(z)) return false
  // Current Minimap.WorldToPixel calls Utils.RoundToInt, including its float32
  // 64000.5 offset. +z is the increasing texture row.
  const pixel = (value: number) => Math.trunc(Math.fround(
    Math.fround(Math.fround(value / (map.pixelSize ?? EXPLORATION_PIXEL_SIZE)) + Math.trunc(map.textureSize / 2)) + 64000.5,
  )) - 64000
  const px = pixel(x), py = pixel(z)
  if (px < 0 || py < 0 || px >= map.textureSize || py >= map.textureSize) return false
  const index = py * map.textureSize + px
  return Boolean(map.bits[index >> 3] & (1 << (index & 7)))
}

/** undefined = unrestricted; null = restricted, with no readable personal map. */
export type ExplorationRestriction = ExploredMap | null | undefined

export const isMapPointVisible = (map: ExplorationRestriction, x: number, z: number): boolean =>
  map === undefined || isMapPointExplored(map, x, z)

export function filterExploredPoints<T extends { x: number; z: number }>(points: T[], map: ExplorationRestriction): T[]
export function filterExploredPoints<T extends { x: number; z: number }>(points: readonly T[], map: ExplorationRestriction): readonly T[]
export function filterExploredPoints<T extends { x: number; z: number }>(points: readonly T[], map: ExplorationRestriction): readonly T[] {
  return map === undefined ? points : points.filter(point => isMapPointVisible(map, point.x, point.z))
}
