import { EXPLORATION_PIXEL_SIZE, type ExploredMap } from './explored-map.ts'

export interface SmallExploration {
  x: number
  z: number
  width: number
  height: number
  cells: number
}

/** Focus only genuinely small initial maps; a scattered, well-travelled map keeps its camera. */
export function smallPersonalExploration(map: ExploredMap | null | undefined): SmallExploration | null {
  if (!map) return null
  const scale = map.pixelSize ?? EXPLORATION_PIXEL_SIZE
  const half = Math.trunc(map.textureSize / 2)
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, cells = 0
  for (let byte = 0; byte < map.bits.length; byte++) {
    const value = map.bits[byte]
    if (!value) continue
    for (let bit = 0; bit < 8; bit++) {
      if (!(value & (1 << bit))) continue
      const index = byte * 8 + bit
      if (index >= map.textureSize ** 2) break
      const x = (index % map.textureSize - half) * scale
      const z = (Math.floor(index / map.textureSize) - half) * scale
      if (Math.hypot(x, z) > 10500) continue
      cells++
      if (cells * scale * scale > 1_000_000) return null
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
    }
  }
  const width = maxX - minX + scale, height = maxZ - minZ + scale
  if (!cells || Math.max(width, height) > 2000) return null
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, width, height, cells }
}

const seenInSession = new Set<string>()
const key = (context: string) => `valheim-companion:personal-exploration-intro:v1:${encodeURIComponent(context)}`
export function hasSeenExplorationIntro(context: string): boolean {
  if (seenInSession.has(context)) return true
  try { return localStorage.getItem(key(context)) === '1' } catch { return false }
}
export function markExplorationIntroSeen(context: string): void {
  seenInSession.add(context)
  try { localStorage.setItem(key(context), '1') } catch { /* Keep the session-only acknowledgement. */ }
}
