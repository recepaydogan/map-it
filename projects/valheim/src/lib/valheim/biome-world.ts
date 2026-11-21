import type { ValheimWorldGenerator, ValheimBiome } from './world-generator.ts'
import { UnityRandom } from './unity-random.ts'
import { getStableHashCode } from './stable-hash.ts'

export interface AltBiomeRule {
  name: string; enabled: number; biome: number
  minDistanceFromCenter: number; minAmountSpawned: number; maxAmountSpawned: number; chance: number
  minEdgeSize: number; maxEdgeSize: number; minAvgHeight: number; maxAvgHeight: number
  aboveWorldX: number; belowWorldX: number; aboveWorldY: number; belowWorldY: number
  requireNeighbor: number; notNeighbor: number; incompatibleAltBiomes: string[]
  blockLocationNames: string[]; blockVegetationNames: string[]
}

export const BIOME_FLAGS: Record<ValheimBiome, number> = {
  meadows: 1, swamp: 2, mountain: 4, 'black-forest': 8, plains: 16,
  ashlands: 32, 'deep-north': 64, ocean: 256, mistlands: 512,
}
const FLAG_ORDER = [1, 2, 4, 8, 16, 32, 64, 256, 512]
const SIZE = 2048
const world = (n: number) => Math.fround(Math.fround(Math.fround(n - 1024) * 12) + 6)
const map = (n: number) => Math.trunc(Math.fround(Math.fround(Math.fround(n - 6) / 12) + 1024))
interface Sector {
  biome: number; edges: number; x: number; y: number; min: number; max: number
  height: number; distance: number; neighbors: Set<number>; alts: AltBiomeRule[]
}

/** Port of 1.0.7 AltBiomeWorldData; point insertion and flood order affect RNG indices. */
export class BiomeWorld {
  private readonly sectors: Sector[] = []
  private readonly pointSector = new Int32Array(SIZE * SIZE).fill(-1)
  private readonly points = new Map<number, number[]>()
  private readonly landPoints = new Map<number, number[]>()

  constructor(generator: ValheimWorldGenerator, rules: readonly AltBiomeRule[]) {
    const biomes = new Uint16Array(SIZE * SIZE)
    const heights = new Float32Array(SIZE * SIZE)
    const groups = new Map<number, number[]>()
    for (const flag of FLAG_ORDER) { this.points.set(flag, []); this.landPoints.set(flag, []); groups.set(flag, []) }
    const addSector = (biome: number) => {
      const id = this.sectors.length
      this.sectors.push({ biome, edges: 0, x: 0, y: 0, min: 99999, max: -99999, height: 0,
        distance: 0, neighbors: new Set(), alts: [] })
      groups.get(biome)!.push(id)
      return id
    }
    const special = new Map([[32, addSector(32)], [64, addSector(64)], [256, addSector(256)]])
    const addPoint = (p: number, flag: number) => {
      this.points.get(flag)!.push(p)
      if (heights[p] >= 30) this.landPoints.get(flag)!.push(p)
    }
    for (let y = 0; y < SIZE; y++) {
      const wy = world(y)
      for (let x = 0; x < SIZE; x++) {
        const wx = world(x), p = y * SIZE + x
        const outside = Math.fround(Math.fround(wx * wx) + Math.fround(wy * wy)) > 110250000
        const flag = outside ? 256 : BIOME_FLAGS[generator.getBiome(wx, wy)]
        biomes[p] = flag
        heights[p] = outside ? -1000 : generator.getHeightAndVegetation(wx, wy).height
        const id = special.get(flag)
        if (id !== undefined) { this.pointSector[p] = id; addPoint(p, flag) }
      }
    }
    const stack: number[] = []
    for (let p = 0; p < biomes.length; p++) {
      if (this.pointSector[p] !== -1) continue
      const flag = biomes[p], id = addSector(flag)
      this.pointSector[p] = id
      stack.push(p)
      // The game's seed point is not appended to AllPoints; only tryFill appends.
      const fill = (next: number) => {
        if (this.pointSector[next] === -1 && biomes[next] === flag) {
          this.pointSector[next] = id; addPoint(next, flag); stack.push(next)
        }
      }
      while (stack.length) {
        const next = stack.pop()!, x = next % SIZE, y = Math.trunc(next / SIZE)
        if (x + 1 < SIZE) fill(next + 1)
        if (x > 0) fill(next - 1)
        if (y + 1 < SIZE) fill(next + SIZE)
        if (y > 0) fill(next - SIZE)
      }
    }
    for (let y = 1; y < SIZE - 1; y++) for (let x = 1; x < SIZE - 1; x++) {
      const p = y * SIZE + x, id = this.pointSector[p]
      // C# || short-circuits: only the first different neighbor is recorded.
      const neighbor = [p - 1, p + 1, p - SIZE, p + SIZE].find((n) => this.pointSector[n] !== id)
      if (neighbor === undefined) continue
      const sector = this.sectors[id]
      sector.edges++
      sector.x = Math.fround(sector.x + x); sector.y = Math.fround(sector.y + y)
      sector.neighbors.add(this.pointSector[neighbor])
      sector.min = Math.min(sector.min, heights[p]); sector.max = Math.max(sector.max, heights[p])
    }
    for (const sector of this.sectors) {
      if (sector.edges) {
        sector.x = world(Math.fround(sector.x / sector.edges)); sector.y = world(Math.fround(sector.y / sector.edges))
        sector.height = Math.fround(Math.fround(sector.min + sector.max) / 2)
      }
      sector.distance = Math.fround(Math.sqrt(Math.fround(Math.fround(sector.x * sector.x) + Math.fround(sector.y * sector.y))))
    }
    const assigned = new Map<string, number>()
    for (const flag of FLAG_ORDER) for (const rule of rules.filter((r) => r.enabled && (r.biome & flag) === flag)) {
      const random = new UnityRandom((flag + getStableHashCode(rule.name) + generator.seed.seed) | 0)
      const sectors = groups.get(flag)!
      for (let i = sectors.length - 1; i > 0; i--) {
        const j = random.intRange(0, i + 1)
        ;[sectors[i], sectors[j]] = [sectors[j], sectors[i]]
      }
      for (const id of sectors) {
        const count = assigned.get(rule.name) ?? 0
        if (count >= rule.maxAmountSpawned) continue
        const chance = random.floatRange(0, 1)
        if ((count < rule.minAmountSpawned || rule.chance >= chance) && this.canAdd(this.sectors[id], rule)) {
          this.sectors[id].alts.push(rule); assigned.set(rule.name, count + 1)
        }
      }
    }
  }

  private canAdd(s: Sector, r: AltBiomeRule): boolean {
    if (s.distance < r.minDistanceFromCenter || s.edges < r.minEdgeSize || s.edges >= r.maxEdgeSize ||
      s.height < r.minAvgHeight || s.height >= r.maxAvgHeight) return false
    if ((r.aboveWorldX && s.x < r.aboveWorldX) || (r.belowWorldX && s.x > r.belowWorldX) ||
      (r.aboveWorldY && s.y < r.aboveWorldY) || (r.belowWorldY && s.y > r.belowWorldY)) return false
    if (s.alts.some((a) => a.incompatibleAltBiomes.includes(r.name) || r.incompatibleAltBiomes.includes(a.name))) return false
    // Preserve the shipped game's enum-index comparison, including its distinction from flags.
    for (const [i, flag] of [0, ...FLAG_ORDER].entries()) {
      const found = [...s.neighbors].some((id) => this.sectors[id].biome === i)
      if (r.requireNeighbor && (r.requireNeighbor & flag) === flag && !found) return false
      if (r.notNeighbor && (r.notNeighbor & flag) === flag && found) return false
    }
    return true
  }

  altBiomesAt(x: number, y: number): readonly AltBiomeRule[] {
    const gx = Math.max(0, Math.min(SIZE - 1, map(x))), gy = Math.max(0, Math.min(SIZE - 1, map(y)))
    return this.sectors[this.pointSector[gy * SIZE + gx]].alts
  }

  randomZone(random: UnityRandom, mask: number, aboveSea: boolean): { x: number; y: number } | null {
    let flag = mask
    if ((mask & (mask - 1)) !== 0) {
      const flags = FLAG_ORDER.filter((f) => (mask & f) !== 0)
      // RandomBiomeFromBiomes uses an exclusive upper bound count-1 in 1.0.7.
      let n = random.intRange(0, flags.length - 1)
      flag = 512
      for (const [f, result] of [[1, 1], [2, 2], [4, 4], [8, 8], [16, 8], [32, 32], [64, 64], [1, 256]]) {
        if ((mask & f) && n-- === 0) { flag = result; break }
      }
    }
    const land = this.landPoints.get(flag) ?? []
    const points = aboveSea && land.length ? land : this.points.get(flag) ?? []
    if (!points.length) return null
    const p = points[random.intRange(0, points.length)]
    return { x: Math.floor((world(p % SIZE) + 32) / 64), y: Math.floor((world(Math.trunc(p / SIZE)) + 32) / 64) }
  }
}
