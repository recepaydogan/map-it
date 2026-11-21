import { EXPLORATION_PIXEL_SIZE, type ExploredMap } from './explored-map.ts'

/** One mask for terrain, resource coverage and building geometry, in world metres.
 * Consecutive cells share a rectangle; no per-cell DOM nodes. Feather only
 * inside the personal cells so smoothing cannot expose unexplored terrain.
 */
export function explorationMaskImage(map: ExploredMap): string {
  const size = map.textureSize
  const scale = map.pixelSize ?? EXPLORATION_PIXEL_SIZE
  const half = Math.trunc(size / 2)
  const paths: string[] = []
  let previousRuns: Array<[number, number]> = []
  let minX = 10500, minY = 10500, maxX = -10500, maxY = -10500
  for (let row = 0; row < size; row++) {
    const top = -(row - half + 0.5) * scale
    if (top > 10500 || top + scale < -10500) continue
    const runs: Array<[number, number]> = []
    let start = -1
    for (let col = 0; col <= size; col++) {
      const index = row * size + col
      const explored = col < size && Boolean(map.bits[index >> 3] & (1 << (index & 7)))
      if (explored && start < 0) start = col
      if (!explored && start >= 0) {
        const left = (start - half - 0.5) * scale
        const width = (col - start) * scale
        paths.push(`<rect x="${left}" y="${top}" width="${width}" height="${scale}" rx="${scale / 2}"/>`)
        runs.push([start, col])
        minX = Math.min(minX, left); maxX = Math.max(maxX, left + width)
        minY = Math.min(minY, top); maxY = Math.max(maxY, top + scale)
        start = -1
      }
    }
    // Join adjacent rows through their shared cells. These bridges remove
    // internal seams while the exposed convex corners stay rounded inward.
    let previousIndex = 0
    for (const [start, end] of runs) {
      while (previousIndex < previousRuns.length && previousRuns[previousIndex][1] <= start) previousIndex++
      for (let i = previousIndex; i < previousRuns.length && previousRuns[i][0] < end; i++) {
        const overlapStart = Math.max(start, previousRuns[i][0])
        const overlapEnd = Math.min(end, previousRuns[i][1])
        paths.push(`<rect x="${(overlapStart - half - 0.5) * scale}" y="${top + scale / 2}" width="${(overlapEnd - overlapStart) * scale}" height="${scale}"/>`)
      }
    }
    previousRuns = runs
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-10500 -10500 21000 21000" preserveAspectRatio="none"><defs><filter id="fog-edge" filterUnits="userSpaceOnUse" x="${minX - scale}" y="${minY - scale}" width="${Math.max(0, maxX - minX) + scale * 2}" height="${Math.max(0, maxY - minY) + scale * 2}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${scale * 0.4}"/><feComponentTransfer><feFuncA type="gamma" amplitude="1" exponent="2" offset="0"/></feComponentTransfer><feComposite in2="SourceGraphic" operator="in"/></filter></defs><g fill="white" filter="url(#fog-edge)">${paths.join('')}</g></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}
