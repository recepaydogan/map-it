import { FAST_NOISE_CELL_VECTORS } from './fast-noise-cell-vectors.ts'

const GRADIENTS_2D = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
] as const

function fastFloor(value: number): number {
  return value >= 0 ? Math.trunc(value) : Math.trunc(value) - 1
}

function fastRound(value: number): number {
  return value >= 0 ? Math.trunc(value + 0.5) : Math.trunc(value - 0.5)
}

function hash2D(seed: number, x: number, y: number): number {
  let hash = seed | 0
  hash = (hash ^ Math.imul(1_619, x)) | 0
  hash = (hash ^ Math.imul(31_337, y)) | 0
  hash = Math.imul(Math.imul(Math.imul(hash, hash), hash), 60_493)
  return ((hash >> 13) ^ hash) | 0
}

function gradient2D(
  seed: number,
  x: number,
  y: number,
  offsetX: number,
  offsetY: number,
): number {
  const gradient = GRADIENTS_2D[hash2D(seed, x, y) & 7]
  return offsetX * gradient[0] + offsetY * gradient[1]
}

function simplex2D(seed: number, x: number, y: number): number {
  let skew = (x + y) * 0.3660254037844386
  const cellX = fastFloor(x + skew)
  const cellY = fastFloor(y + skew)
  skew = (cellX + cellY) * 0.21132486540518713
  const originX = cellX - skew
  const originY = cellY - skew
  const x0 = x - originX
  const y0 = y - originY
  const stepX = x0 > y0 ? 1 : 0
  const stepY = x0 > y0 ? 0 : 1
  const x1 = x0 - stepX + 0.21132486540518713
  const y1 = y0 - stepY + 0.21132486540518713
  const x2 = x0 - 1 + 0.42264973081037427
  const y2 = y0 - 1 + 0.42264973081037427

  const contribution = (
    latticeX: number,
    latticeY: number,
    offsetX: number,
    offsetY: number,
  ) => {
    let attenuation = 0.5 - offsetX * offsetX - offsetY * offsetY
    if (attenuation < 0) return 0
    attenuation *= attenuation
    return attenuation * attenuation * gradient2D(
      seed,
      latticeX,
      latticeY,
      offsetX,
      offsetY,
    )
  }

  return 50 * (
    contribution(cellX, cellY, x0, y0) +
    contribution(cellX + stepX, cellY + stepY, x1, y1) +
    contribution(cellX + 1, cellY + 1, x2, y2)
  )
}

/** The exact FastNoise settings initialized by Valheim's current WorldGenerator. */
export class ValheimFastNoise {
  getCellular(x: number, y: number): number {
    const scaledX = x * 0.01
    const scaledY = y * 0.01
    const centerX = fastRound(scaledX)
    const centerY = fastRound(scaledY)
    let closestDistance = 999_999

    for (let cellX = centerX - 1; cellX <= centerX + 1; cellX += 1) {
      for (let cellY = centerY - 1; cellY <= centerY + 1; cellY += 1) {
        const vector = FAST_NOISE_CELL_VECTORS[hash2D(0, cellX, cellY) & 255]
        const offsetX = cellX - scaledX + vector[0] * Math.fround(0.45)
        const offsetY = cellY - scaledY + vector[1] * Math.fround(0.45)
        closestDistance = Math.min(
          closestDistance,
          offsetX * offsetX + offsetY * offsetY,
        )
      }
    }

    return closestDistance
  }

  getSimplexFractal(x: number, y: number): number {
    let scaledX = x * 0.01
    let scaledY = y * 0.01
    let result = simplex2D(0, scaledX, scaledY)
    scaledX *= 2
    scaledY *= 2
    result += simplex2D(1, scaledX, scaledY) * 0.5
    return result * (2 / 3)
  }
}
