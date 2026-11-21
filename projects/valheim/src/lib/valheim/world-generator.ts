import type { BiomeWorld } from './biome-world.ts'
import { perlinNoise } from './perlin-noise.ts'
import { ValheimFastNoise } from './fast-noise.ts'
import type { ValheimWorldSeedState } from './world-seed.ts'

export type ValheimBiome =
  | 'ashlands'
  | 'black-forest'
  | 'deep-north'
  | 'meadows'
  | 'mistlands'
  | 'mountain'
  | 'ocean'
  | 'plains'
  | 'swamp'

export interface RiverInfluencePoint {
  x: number
  y: number
  width: number
}

const f32 = Math.fround

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function length(x: number, y: number): number {
  return f32(Math.sqrt(x * x + y * y))
}

function lerp(start: number, end: number, amount: number): number {
  if (amount <= 0) return start
  if (amount >= 1) return end
  return f32(start * (1 - amount) + end * amount)
}

function lerpStep(low: number, high: number, value: number): number {
  return f32(clamp01((value - low) / (high - low)))
}

function smoothStep(low: number, high: number, value: number): number {
  const amount = f32(clamp01((value - low) / (high - low)))
  return f32(amount * amount * (3 - 2 * amount))
}

function mathfLikeSmoothStep(from: number, to: number, value: number): number {
  let amount = clamp01(value)
  amount = -2 * amount * amount * amount + 3 * amount * amount
  return f32(to * amount + from * (1 - amount))
}

function blendOverlay(first: number, second: number): number {
  return first < 0.5
    ? 2 * first * second
    : 1 - 2 * (1 - first) * (1 - second)
}

function remap(
  value: number,
  inputLow: number,
  inputHigh: number,
  outputLow: number,
  outputHigh: number,
): number {
  return outputLow +
    clamp01((value - inputLow) / (inputHigh - inputLow)) *
      (outputHigh - outputLow)
}

function fbm(x: number, y: number, octaves: number, lacunarity: number, gain: number): number {
  let result = 0
  let amplitude = 1
  let sampleX = f32(x)
  let sampleY = f32(y)
  for (let octave = 0; octave < octaves; octave += 1) {
    result = f32(result + amplitude * perlinNoise(sampleX, sampleY))
    amplitude = f32(amplitude * gain)
    sampleX = f32(sampleX * lacunarity)
    sampleY = f32(sampleY * lacunarity)
  }
  return result
}

export function worldAngle(worldX: number, worldY: number): number {
  const angle = f32(Math.atan2(f32(worldX), f32(worldY)))
  return f32(Math.sin(f32(angle * 20)))
}

/**
 * WorldGenerator.GetAshlandsOceanGradient: how far a point lies past the
 * Ashlands boundary, in units of 300 m. The minimap uses it to tint the sea
 * around Ashlands; negative north of the boundary, positive inside it.
 */
export function getAshlandsOceanGradient(worldX: number, worldY: number): number {
  const shiftedY = worldY - 4_000
  const angle = worldAngle(worldX, shiftedY) * 100
  return (Math.hypot(worldX, shiftedY) - (12_000 + angle)) / 300
}

export class ValheimWorldGenerator {
  biomeWorld: BiomeWorld | null = null
  readonly seed: ValheimWorldSeedState
  private riverPoints = new Map<string, readonly RiverInfluencePoint[]>()
  private readonly fastNoise = new ValheimFastNoise()

  constructor(seed: ValheimWorldSeedState) {
    this.seed = seed
  }

  setRiverPoints(points: Map<string, readonly RiverInfluencePoint[]>): void {
    this.riverPoints = points
  }

  private addRivers(worldX: number, worldY: number, height: number): number {
    const gridX = Math.floor((worldX + 32) / 64)
    const gridY = Math.floor((worldY + 32) / 64)
    const points = this.riverPoints.get(`${gridX},${gridY}`)
    if (!points) return height

    let weight = 0
    let weightedWidth = 0
    let totalPointWeight = 0
    for (const point of points) {
      const distanceSquared =
        (point.x - worldX) ** 2 + (point.y - worldY) ** 2
      if (distanceSquared >= point.width ** 2) continue
      const pointWeight = Math.fround(1 - Math.sqrt(distanceSquared) / point.width)
      weight = Math.max(weight, pointWeight)
      weightedWidth = Math.fround(weightedWidth + point.width * pointWeight)
      totalPointWeight = Math.fround(totalPointWeight + pointWeight)
    }
    if (weight <= 0) return height

    const width = Math.fround(weightedWidth / totalPointWeight)
    const riverWidthWeight = lerpStep(20, 60, width)
    const upperHeight = lerp(0.14, 0.12, riverWidthWeight)
    const lowerHeight = lerp(0.139, 0.128, riverWidthWeight)
    let result = height
    if (result > upperHeight) result = lerp(result, upperHeight, weight)
    if (result > lowerHeight) {
      result = lerp(result, lowerHeight, lerpStep(0.85, 1, weight))
    }
    return result
  }

  isAshlands(worldX: number, worldY: number): boolean {
    const angularOffset = worldAngle(worldX, worldY) * 100
    return length(worldX, worldY - 4_000) > 12_000 + angularOffset
  }

  isDeepNorth(worldX: number, worldY: number): boolean {
    const angularOffset = f32(worldAngle(worldX, worldY) * 100)
    return length(worldX, worldY + 4_000) > 12_000 + angularOffset
  }

  getBaseHeight(worldX: number, worldY: number): number {
    const wx = f32(worldX)
    const wy = f32(worldY)
    const distance = length(wx, wy)
    const noiseX = wx + 100_000 + this.seed.offset0
    const noiseY = wy + 100_000 + this.seed.offset1

    let height = f32(
      perlinNoise(noiseX * 0.0010000000474974513, noiseY * 0.0010000000474974513) *
        perlinNoise(noiseX * 0.001500000013038516, noiseY * 0.001500000013038516),
    )
    height = f32(
      height +
        perlinNoise(noiseX * 0.0020000000949949026, noiseY * 0.0020000000949949026) *
          perlinNoise(noiseX * 0.003000000026077032, noiseY * 0.003000000026077032) *
          height *
          0.8999999761581421,
    )
    height = f32(
      height +
        perlinNoise(noiseX * 0.004999999888241291, noiseY * 0.004999999888241291) *
          perlinNoise(noiseX * 0.009999999776482582, noiseY * 0.009999999776482582) *
          0.5 *
          height,
    )
    height = f32(height - 0.07000000029802322)

    const oceanNoiseA = perlinNoise(
      noiseX * 0.0005000000237487257 + 0.12300000339746475,
      noiseY * 0.0005000000237487257 + 0.15123000741004944,
    )
    const oceanNoiseB = perlinNoise(
      noiseX * 0.0005000000237487257 + 0.32100000977516174,
      noiseY * 0.0005000000237487257 + 0.23100000619888306,
    )
    const oceanWeight = f32(
      f32(1 - lerpStep(0.02, 0.12, f32(Math.abs(f32(oceanNoiseA - oceanNoiseB))))) *
        smoothStep(744, 1_000, distance),
    )
    height = f32(height * (1 - oceanWeight))

    if (distance > 10_000) {
      height = lerp(height, -0.2, lerpStep(10_000, 10_500, distance))
      if (distance > 10_490) {
        height = lerp(height, -2, lerpStep(10_490, 10_500, distance))
      }
      return height
    }

    if (distance < 1_000 && height > 0.28) {
      const mountainWeight = f32(clamp01((height - 0.2800000011920929) / 0.09999999403953552))
      height = lerp(
        lerp(0.28, 0.38, mountainWeight),
        height,
        lerpStep(600, 1_000, distance),
      )
    }

    return height
  }

  getBiome(worldX: number, worldY: number): ValheimBiome {
    const wx = f32(worldX)
    const wy = f32(worldY)
    const distance = length(wx, wy)
    const baseHeight = this.getBaseHeight(wx, wy)
    const angularOffset = f32(worldAngle(wx, wy) * 100)

    if (this.isAshlands(wx, wy)) return 'ashlands'
    if (baseHeight <= 0.02) return 'ocean'
    if (this.isDeepNorth(wx, wy)) {
      return 'deep-north'
    }
    if (baseHeight > 0.4) return 'mountain'

    if (
      perlinNoise(
        f32(this.seed.offset0 + wx) * 0.0010000000474974513,
        f32(this.seed.offset0 + wy) * 0.0010000000474974513,
      ) > 0.6 &&
      distance > 2_000 &&
      distance < 6_000 &&
      baseHeight > 0.05 &&
      baseHeight < 0.25
    ) {
      return 'swamp'
    }

    if (
      perlinNoise(
        f32(this.seed.offset4 + wx) * 0.0010000000474974513,
        f32(this.seed.offset4 + wy) * 0.0010000000474974513,
      ) > 0.4 &&
      distance > 6_000 + angularOffset &&
      distance < 10_000
    ) {
      return 'mistlands'
    }

    if (
      perlinNoise(
        f32(this.seed.offset1 + wx) * 0.0010000000474974513,
        f32(this.seed.offset1 + wy) * 0.0010000000474974513,
      ) > 0.4 &&
      distance > 3_000 + angularOffset &&
      distance < 8_000
    ) {
      return 'plains'
    }

    if (
      perlinNoise(
        f32(this.seed.offset2 + wx) * 0.0010000000474974513,
        f32(this.seed.offset2 + wy) * 0.0010000000474974513,
      ) > 0.4 &&
      distance > 600 + angularOffset &&
      distance < 6_000
    ) {
      return 'black-forest'
    }

    return distance > 5_000 + angularOffset ? 'black-forest' : 'meadows'
  }

  getBiomeArea(worldX: number, worldY: number): 'edge' | 'median' {
    const biome = this.getBiome(worldX, worldY)
    const offsets = [
      [64, 64],
      [-64, 64],
      [-64, -64],
      [64, -64],
      [64, 0],
      [-64, 0],
      [0, 64],
      [0, -64],
    ] as const
    return offsets.every(([offsetX, offsetY]) =>
      this.getBiome(worldX + offsetX, worldY + offsetY) === biome)
      ? 'median'
      : 'edge'
  }

  getForestFactor(worldX: number, worldY: number): number {
    return fbm(
      f32(worldX * 0.004),
      f32(worldY * 0.004),
      3,
      1.6,
      0.7,
    )
  }

  getTerrainDelta(
    worldX: number,
    worldY: number,
    radius: number,
    random: { insideUnitCircle(): { x: number; y: number } },
  ): number {
    let minimumHeight = 999_999
    let maximumHeight = -999_999
    for (let sample = 0; sample < 10; sample += 1) {
      const offset = random.insideUnitCircle()
      const height = this.getHeightAndVegetation(
        f32(worldX + offset.x * radius),
        f32(worldY + offset.y * radius),
      ).height
      minimumHeight = Math.min(minimumHeight, height)
      maximumHeight = Math.max(maximumHeight, height)
    }
    return f32(maximumHeight - minimumHeight)
  }

  getPregenerationHeight(worldX: number, worldY: number, riverPreNorth = true): number {
    const biome = this.getBiome(worldX, worldY)
    return f32((biome === 'deep-north'
      ? this.getDeepNorthPregenerationHeight(f32(worldX), f32(worldY), riverPreNorth)
      : this.getPregenerationBiomeHeight(biome, f32(worldX), f32(worldY))) * 200)
  }

  getHeightAndVegetation(worldX: number, worldY: number): {
    height: number
    vegetation: number
  } {
    const wx = f32(worldX)
    const wy = f32(worldY)
    if (length(wx, wy) > 10500) return { height: -400, vegetation: 1 }
    const biome = this.getBiome(wx, wy)
    let vegetation = 1
    let biomeHeight: number

    if (biome === 'deep-north') {
      biomeHeight = this.getDeepNorthHeight(wx, wy)
      vegetation = 0
    } else if (biome === 'mistlands') {
      const result = this.getMistlandsHeight(wx, wy)
      biomeHeight = result.height
      vegetation = result.vegetation
    } else if (biome === 'ashlands') {
      const result = this.getAshlandsHeight(wx, wy)
      biomeHeight = result.height
      vegetation = result.vegetation
    } else {
      biomeHeight = this.getPregenerationBiomeHeight(biome, wx, wy)
    }

    const multiplier = f32(200 * this.createAshlandsGap(wx, wy) * this.createDeepNorthGap(wx, wy))
    return {
      height: f32(biomeHeight * multiplier),
      vegetation: f32(vegetation),
    }
  }

  private getPregenerationBiomeHeight(
    biome: ValheimBiome,
    worldX: number,
    worldY: number,
  ): number {
    if (length(worldX, worldY) > 10_500) return -2

    switch (biome) {
      case 'swamp':
        return this.getMarshHeight(worldX, worldY)
      case 'deep-north':
        return this.getDeepNorthHeight(worldX, worldY)
      case 'mountain':
        return this.getMountainHeight(worldX, worldY)
      case 'black-forest':
      case 'mistlands':
        return this.getForestHeight(worldX, worldY)
      case 'ocean':
        return this.getBaseHeight(worldX, worldY)
      case 'ashlands':
        return this.getAshlandsPregenerationHeight(worldX, worldY)
      case 'plains':
        return this.getPlainsHeight(worldX, worldY)
      case 'meadows':
        return this.getMeadowsHeight(worldX, worldY)
    }
  }

  private addDetailNoise(height: number, noiseX: number, noiseY: number): number {
    const medium = perlinNoise(
      noiseX * 0.10000000149011612,
      noiseY * 0.10000000149011612,
    )
    const fine = perlinNoise(
      noiseX * 0.4000000059604645,
      noiseY * 0.4000000059604645,
    )
    return f32(
      f32(height + medium * 0.009999999776482582) +
        fine * 0.003000000026077032,
    )
  }

  private getTerrainNoise(noiseX: number, noiseY: number): number {
    let noise = f32(
      perlinNoise(noiseX * 0.009999999776482582, noiseY * 0.009999999776482582) *
        perlinNoise(noiseX * 0.019999999552965164, noiseY * 0.019999999552965164),
    )
    noise = f32(
      noise +
        perlinNoise(noiseX * 0.05000000074505806, noiseY * 0.05000000074505806) *
          perlinNoise(noiseX * 0.10000000149011612, noiseY * 0.10000000149011612) *
          noise *
          0.5,
    )
    return noise
  }

  private getMarshHeight(worldX: number, worldY: number): number {
    const noiseX = f32(worldX + 100_000)
    const noiseY = f32(worldY + 100_000)
    const terrainNoise = f32(
      perlinNoise(noiseX * 0.03999999910593033, noiseY * 0.03999999910593033) *
        perlinNoise(noiseX * 0.07999999821186066, noiseY * 0.07999999821186066),
    )
    return this.addDetailNoise(
      this.addRivers(worldX, worldY, f32(0.137 + terrainNoise * 0.029999999329447746)),
      noiseX,
      noiseY,
    )
  }

  private getMeadowsHeight(worldX: number, worldY: number): number {
    const baseHeight = this.getBaseHeight(worldX, worldY)
    const noiseX = f32(worldX + 100_000 + this.seed.offset3)
    const noiseY = f32(worldY + 100_000 + this.seed.offset3)
    const terrainNoise = this.getTerrainNoise(noiseX, noiseY)
    let height = f32(baseHeight + terrainNoise * 0.10000000149011612)
    const excess = f32(height - 0.15)
    const baseWeight = f32(clamp01(baseHeight / 0.4000000059604645))
    if (excess > 0) {
      height = f32(height - excess * ((1 - baseWeight) * 0.75))
    }
    return this.addDetailNoise(this.addRivers(worldX, worldY, height), noiseX, noiseY)
  }

  private getPlainsHeight(worldX: number, worldY: number): number {
    return this.getMeadowsHeight(worldX, worldY)
  }

  private getForestHeight(worldX: number, worldY: number): number {
    const noiseX = f32(worldX + 100_000 + this.seed.offset3)
    const noiseY = f32(worldY + 100_000 + this.seed.offset3)
    const height = f32(
      this.getBaseHeight(worldX, worldY) +
        this.getTerrainNoise(noiseX, noiseY) * 0.10000000149011612,
    )
    return this.addDetailNoise(this.addRivers(worldX, worldY, height), noiseX, noiseY)
  }

  private getAshlandsPregenerationHeight(worldX: number, worldY: number): number {
    const noiseX = f32(worldX + 100_000 + this.seed.offset3)
    const noiseY = f32(worldY + 100_000 + this.seed.offset3)
    let height = f32(
      this.getBaseHeight(worldX, worldY) +
        this.getTerrainNoise(noiseX, noiseY) * 0.10000000149011612,
    )
    height = f32(height + 0.10000000149011612)
    height = this.addDetailNoise(height, noiseX, noiseY)
    return this.addRivers(worldX, worldY, height)
  }

  private getMountainHeight(worldX: number, worldY: number): number {
    const baseHeight = this.getBaseHeight(worldX, worldY)
    const tilt = f32(
      Math.abs(
        f32(
          this.getBaseHeight(f32(worldX + 1), worldY) -
            this.getBaseHeight(f32(worldX - 1), worldY),
        ),
      ) +
        Math.abs(
          f32(
            this.getBaseHeight(worldX, f32(worldY - 1)) -
              this.getBaseHeight(worldX, f32(worldY + 1)),
          ),
        ),
    )
    const noiseX = f32(worldX + 100_000 + this.seed.offset3)
    const noiseY = f32(worldY + 100_000 + this.seed.offset3)
    let height = f32(baseHeight + f32(baseHeight - 0.4000000059604645))
    height = f32(height + this.getTerrainNoise(noiseX, noiseY) * 0.20000000298023224)
    height = this.addDetailNoise(this.addRivers(worldX, worldY, height), noiseX, noiseY)
    return f32(
      height +
        perlinNoise(
          noiseX * 0.20000000298023224,
          noiseY * 0.20000000298023224,
        ) *
          2 *
          tilt,
    )
  }

  private getDeepNorthPregenerationHeight(worldX: number, worldY: number, riverPreNorth: boolean): number {
    const noiseX = f32(worldX + 100_000 + this.seed.offset3)
    const noiseY = f32(worldY + 100_000 + this.seed.offset3)
    let height = f32(this.getBaseHeight(worldX, worldY) + (riverPreNorth ? 0 : 0.10000000149011612))
    height = f32(height + Math.max(0, f32(height - 0.4000000059604645)))
    height = f32(height + this.getTerrainNoise(noiseX, noiseY) * 0.20000000298023224)
    height = f32(height * 1.2000000476837158)
    height = this.addRivers(worldX, worldY, height)
    height = f32(height + perlinNoise(f32(noiseX * f32(0.1)), f32(noiseY * f32(0.1))) * 0.009999999776482582)
    return f32(height + perlinNoise(f32(noiseX * f32(0.4)), f32(noiseY * f32(0.4))) * 0.003000000026077032)
  }

  private getDeepNorthHeight(worldX: number, worldY: number): number {
    const noiseX = f32(worldX + 100_000 + this.seed.offset3)
    const noiseY = f32(worldY + 100_000 + this.seed.offset3)
    const base = f32(this.getBaseHeight(worldX, worldY) + 0.10000000149011612)
    let height = f32(base + this.getTerrainNoise(noiseX, noiseY) * 0.10000000149011612)
    const excess = f32(height - 0.15000000596046448)
    const weight = f32(clamp01(base / 0.4000000059604645))
    if (excess > 0) height = f32(height - excess * ((1 - weight) * 0.75))
    return this.addDetailNoise(this.addRivers(worldX, worldY, height), noiseX, noiseY)
  }

  private createAshlandsGap(worldX: number, worldY: number): number {
    const threshold = 12_000 + worldAngle(worldX, worldY) * 100
    const value = clamp01(Math.abs(length(worldX, worldY - 4_000) - threshold) / 400)
    return mathfLikeSmoothStep(0, 1, f32(value))
  }

  private createDeepNorthGap(worldX: number, worldY: number): number {
    const threshold = 12_000 + worldAngle(worldX, worldY) * 100
    const value = clamp01(Math.abs(length(worldX, worldY + 4_000) - threshold) / 400)
    return mathfLikeSmoothStep(0, 1, f32(value))
  }

  private getMistlandsHeight(worldX: number, worldY: number): {
    height: number
    vegetation: number
  } {
    const noiseX = f32(worldX + 100_000 + this.seed.offset3)
    const noiseY = f32(worldY + 100_000 + this.seed.offset3)
    let terrainNoise = f32(
      perlinNoise(
        noiseX * 0.019999999552965164 * 0.699999988079071,
        noiseY * 0.019999999552965164 * 0.699999988079071,
      ) *
        perlinNoise(
          noiseX * 0.03999999910593033 * 0.699999988079071,
          noiseY * 0.03999999910593033 * 0.699999988079071,
        ),
    )
    terrainNoise = f32(
      terrainNoise +
        perlinNoise(
          noiseX * 0.029999999329447746 * 0.699999988079071,
          noiseY * 0.029999999329447746 * 0.699999988079071,
        ) *
          perlinNoise(
            noiseX * 0.05000000074505806 * 0.699999988079071,
            noiseY * 0.05000000074505806 * 0.699999988079071,
          ) *
          terrainNoise *
          0.5,
    )
    if (terrainNoise > 0) terrainNoise = f32(Math.pow(terrainNoise, 1.5))
    let height = f32(
      this.getBaseHeight(worldX, worldY) +
        terrainNoise * 0.4000000059604645,
    )
    height = this.addRivers(worldX, worldY, height)
    const terrainWeight = f32(clamp01(terrainNoise * 7))
    height = f32(
      height +
        perlinNoise(
          noiseX * 0.10000000149011612,
          noiseY * 0.10000000149011612,
        ) *
          0.029999999329447746 *
          terrainWeight,
    )
    height = f32(
      height +
        perlinNoise(
          noiseX * 0.4000000059604645,
          noiseY * 0.4000000059604645,
        ) *
          0.009999999776482582 *
          terrainWeight,
    )
    let vegetation = f32(1 - terrainWeight * 1.2000000476837158)
    vegetation = f32(
      vegetation - (1 - lerpStep(0.1, 0.3, terrainWeight)),
    )
    const unsteppedHeight = f32(
      height +
        perlinNoise(
          noiseX * 0.4000000059604645,
          noiseY * 0.4000000059604645,
        ) *
          0.0020000000949949026,
    )
    const steppedHeight = f32(Math.ceil(f32(height * 400)) / 400)
    height = lerp(unsteppedHeight, steppedHeight, terrainWeight)
    return { height, vegetation }
  }

  private getAshlandsHeight(worldX: number, worldY: number): {
    height: number
    vegetation: number
  } {
    let noiseX = worldX
    let noiseY = worldY
    const baseHeight = this.getBaseHeight(f32(noiseX), f32(noiseY))
    const angularOffset = worldAngle(f32(noiseX), f32(noiseY)) * 100
    let boundaryWeight = Math.abs(
      length(noiseX, noiseY - 2_800) - (12_000 + angularOffset),
    ) / 1_000
    boundaryWeight = mathfLikeSmoothStep(0.1, 1, 1 - clamp01(boundaryWeight))
    boundaryWeight *= 1 - clamp01(Math.abs(noiseX) / 7_500)
    let edgeWeight = length(noiseX, noiseY) - 10_150
    edgeWeight = 1 - clamp01(edgeWeight / 600)
    noiseX += 100_000 + this.seed.offset3
    noiseY += 100_000 + this.seed.offset3

    let cellularTerrain = 0
    let amplitude = 1
    let frequency = 0.33000001311302185
    for (let octave = 0; octave < 5; octave += 1) {
      cellularTerrain += amplitude * mathfLikeSmoothStep(
        0,
        1,
        this.fastNoise.getCellular(noiseX * frequency, noiseY * frequency),
      )
      frequency *= 2
      amplitude *= 0.5
    }
    cellularTerrain = remap(cellularTerrain, -1, 1, 0, 1)
    const blendedBoundary = lerp(
      boundaryWeight,
      blendOverlay(boundaryWeight, cellularTerrain),
      0.5,
    )
    let height = lerp(baseHeight, 0.15000000596046448, 0.75)
    height += blendedBoundary * 0.5
    height = lerp(-1, height, mathfLikeSmoothStep(0, 1, edgeWeight))

    let detailCellular = 0
    amplitude = 1
    frequency = 8
    for (let octave = 0; octave < 3; octave += 1) {
      detailCellular += amplitude * this.fastNoise.getCellular(
        noiseX * frequency,
        noiseY * frequency,
      )
      frequency *= 2
      amplitude *= 0.5
    }
    detailCellular = clamp01(Math.pow(remap(detailCellular, -1, 1, 0, 1), 4) * 2)
    let simplex = this.fastNoise.getSimplexFractal(noiseX * 0.075, noiseY * 0.075)
    simplex = Math.pow(remap(simplex, -1, 1, 0, 1), 1.399999976158142)
    height *= simplex
    let vegetation = fbm(
      f32(noiseX * 0.009999999776482582),
      f32(noiseY * 0.009999999776482582),
      3,
      2,
      0.5,
    )
    vegetation *= clamp01(remap(boundaryWeight, 0, 0.5, 0.5, 1))
    vegetation = Math.pow(lerpStep(0.699999988079071, 1, vegetation), 2)
    vegetation = blendOverlay(vegetation, detailCellular)
    vegetation *= clamp01((height - 0.15 - 0.02) / 0.01)
    let erosion = perlinNoise(noiseX * 0.05 + 5_124, noiseY * 0.05 + 5_000)
    erosion = remap(Math.pow(erosion, 2), 0, 1, 0.009999999776482582, 0.054999999701976776)
    const erodedHeight = Math.min(5_000, Math.max(0.15 + 0.009999999776482582, height - erosion))
    height = lerp(height, erodedHeight, vegetation)
    return {
      height: f32(height),
      vegetation: f32(vegetation),
    }
  }
}
