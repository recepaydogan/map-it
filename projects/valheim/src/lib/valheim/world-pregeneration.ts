import {
  ValheimWorldGenerator,
  type RiverInfluencePoint,
} from './world-generator.ts'
import { UnityRandom } from './unity-random.ts'

export interface WorldPoint {
  x: number
  y: number
}

export interface WorldRiver {
  start: WorldPoint
  end: WorldPoint
  center: WorldPoint
  widthMin: number
  widthMax: number
  curveWidth: number
  curveWavelength: number
}

function distance(first: WorldPoint, second: WorldPoint): number {
  const x = first.x - second.x
  const y = first.y - second.y
  return Math.fround(Math.sqrt(x * x + y * y))
}

function findClosest(
  points: readonly WorldPoint[],
  target: WorldPoint,
  maxDistance: number,
): number {
  let result = -1
  let closestDistance = 99_999

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (point.x === target.x && point.y === target.y) continue
    const pointDistance = distance(target, point)
    if (pointDistance < maxDistance && pointDistance < closestDistance) {
      result = index
      closestDistance = pointDistance
    }
  }

  return result
}

/** Preserves Valheim's swap-remove ordering while merging nearby water samples. */
export function mergeWorldPoints(
  sourcePoints: readonly WorldPoint[],
  range: number,
): WorldPoint[] {
  const points = sourcePoints.map((point) => ({ ...point }))
  const merged: WorldPoint[] = []

  while (points.length > 0) {
    let point = points[0]
    points.splice(0, 1)
    while (points.length > 0) {
      const closestIndex = findClosest(points, point, range)
      if (closestIndex === -1) break
      point = {
        x: Math.fround((point.x + points[closestIndex].x) * 0.5),
        y: Math.fround((point.y + points[closestIndex].y) * 0.5),
      }
      points[closestIndex] = points[points.length - 1]
      points.pop()
    }
    merged.push(point)
  }

  return merged
}

export function findWorldLakes(generator: ValheimWorldGenerator): WorldPoint[] {
  const waterSamples: WorldPoint[] = []

  for (let worldY = -10_000; worldY <= 10_000; worldY += 128) {
    for (let worldX = -10_000; worldX <= 10_000; worldX += 128) {
      if (
        distance({ x: 0, y: 0 }, { x: worldX, y: worldY }) <= 10_000 &&
        generator.getBaseHeight(worldX, worldY) < 0.05
      ) {
        waterSamples.push({ x: worldX, y: worldY })
      }
    }
  }

  return mergeWorldPoints(waterSamples, 800)
}

function pointsEqual(first: WorldPoint, second: WorldPoint): boolean {
  return first.x === second.x && first.y === second.y
}

function haveRiver(
  rivers: readonly WorldRiver[],
  first: WorldPoint,
  second?: WorldPoint,
): boolean {
  return rivers.some((river) => {
    if (!second) {
      return pointsEqual(river.start, first) || pointsEqual(river.end, first)
    }
    return (
      (pointsEqual(river.start, first) && pointsEqual(river.end, second)) ||
      (pointsEqual(river.start, second) && pointsEqual(river.end, first))
    )
  })
}

function isRiverAllowed(
  generator: ValheimWorldGenerator,
  start: WorldPoint,
  end: WorldPoint,
  step: number,
  heightLimit: number,
): boolean {
  const riverDistance = distance(start, end)
  const directionX = (end.x - start.x) / riverDistance
  const directionY = (end.y - start.y) / riverDistance
  let entirelyWater = true

  for (let offset = step; offset <= riverDistance - step; offset += step) {
    const baseHeight = generator.getBaseHeight(
      Math.fround(start.x + directionX * offset),
      Math.fround(start.y + directionY * offset),
    )
    if (baseHeight > heightLimit) return false
    if (baseHeight > 0.05) entirelyWater = false
  }

  return !entirelyWater
}

function findRandomRiverEnd(
  generator: ValheimWorldGenerator,
  random: UnityRandom,
  rivers: readonly WorldRiver[],
  points: readonly WorldPoint[],
  start: WorldPoint,
  maxDistance: number,
): number {
  const candidates: number[] = []

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (
      !pointsEqual(point, start) &&
      distance(start, point) < maxDistance &&
      !haveRiver(rivers, start, point) &&
      isRiverAllowed(generator, start, point, 128, 0.4)
    ) {
      candidates.push(index)
    }
  }

  return candidates.length === 0
    ? -1
    : candidates[random.intRange(0, candidates.length)]
}

export function placeWorldRivers(
  generator: ValheimWorldGenerator,
  lakes: readonly WorldPoint[],
  random = new UnityRandom(generator.seed.riverSeed),
): WorldRiver[] {
  const rivers: WorldRiver[] = []
  const remaining = [...lakes]

  while (remaining.length > 1) {
    const start = remaining[0]
    let endIndex = findRandomRiverEnd(
      generator,
      random,
      rivers,
      lakes,
      start,
      2_000,
    )
    if (endIndex === -1 && !haveRiver(rivers, start)) {
      endIndex = findRandomRiverEnd(
        generator,
        random,
        rivers,
        lakes,
        start,
        5_000,
      )
    }

    if (endIndex === -1) {
      remaining.splice(0, 1)
      continue
    }

    const end = lakes[endIndex]
    const riverDistance = distance(start, end)
    const widthMax = random.floatRange(60, 100)
    rivers.push({
      start,
      end,
      center: {
        x: Math.fround((start.x + end.x) * 0.5),
        y: Math.fround((start.y + end.y) * 0.5),
      },
      widthMax,
      widthMin: random.floatRange(60, widthMax),
      curveWidth: Math.fround(riverDistance / 15),
      curveWavelength: Math.fround(riverDistance / 20),
    })
  }

  return rivers
}

function addRiverInfluencePoint(
  riverPoints: Map<string, RiverInfluencePoint[]>,
  point: WorldPoint,
  width: number,
): void {
  const gridX = Math.floor((point.x + 32) / 64)
  const gridY = Math.floor((point.y + 32) / 64)
  const gridRadius = Math.ceil(width / 64)

  for (let y = gridY - gridRadius; y <= gridY + gridRadius; y += 1) {
    for (let x = gridX - gridRadius; x <= gridX + gridRadius; x += 1) {
      const offsetX = point.x - x * 64
      const offsetY = point.y - y * 64
      if (Math.abs(offsetX) >= width + 32 || Math.abs(offsetY) >= width + 32) {
        continue
      }
      const key = `${x},${y}`
      const entries = riverPoints.get(key) ?? []
      entries.push({ x: point.x, y: point.y, width })
      riverPoints.set(key, entries)
    }
  }
}

export function renderWorldRivers(
  rivers: readonly WorldRiver[],
  random: UnityRandom,
  target = new Map<string, RiverInfluencePoint[]>(),
  include: (river: WorldRiver) => boolean = () => true,
): Map<string, RiverInfluencePoint[]> {
  for (const river of rivers) {
    if (!include(river)) continue
    const step = Math.fround(river.widthMin / 8)
    const riverDistance = distance(river.start, river.end)
    const directionX = (river.end.x - river.start.x) / riverDistance
    const directionY = (river.end.y - river.start.y) / riverDistance
    const perpendicularX = -directionY
    const perpendicularY = directionX

    for (let offset = 0; offset <= riverDistance; offset += step) {
      const phase = Math.fround(offset / river.curveWavelength)
      const curve = Math.fround(
        Math.sin(phase) *
          Math.sin(phase * 0.634119987487793) *
          Math.sin(phase * 0.3341200053691864) *
          river.curveWidth,
      )
      addRiverInfluencePoint(
        target,
        {
          x: Math.fround(river.start.x + directionX * offset + perpendicularX * curve),
          y: Math.fround(river.start.y + directionY * offset + perpendicularY * curve),
        },
        random.floatRange(river.widthMin, river.widthMax),
      )
    }
  }

  return target
}

function findStreamStartPoint(
  generator: ValheimWorldGenerator,
  random: UnityRandom,
  riverPreNorth: boolean,
): WorldPoint | null {
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const point = {
      x: random.floatRange(-10_000, 10_000),
      y: random.floatRange(-10_000, 10_000),
    }
    const height = generator.getPregenerationHeight(point.x, point.y, riverPreNorth)
    if (height > 26 && height < 31) return point
  }
  return null
}

function findStreamEndPoint(
  generator: ValheimWorldGenerator,
  random: UnityRandom,
  start: WorldPoint,
  riverPreNorth: boolean,
): WorldPoint | null {
  const lengthStep = Math.fround((200 - 80) / 100)
  let streamLength = Math.fround(200)

  for (let iteration = 0; iteration < 100; iteration += 1) {
    streamLength = Math.fround(streamLength - lengthStep)
    const angle = random.floatRange(0, Math.fround(Math.PI * 2))
    const point = {
      x: Math.fround(start.x + Math.fround(Math.sin(angle)) * streamLength),
      y: Math.fround(start.y + Math.fround(Math.cos(angle)) * streamLength),
    }
    const height = generator.getPregenerationHeight(point.x, point.y, riverPreNorth)
    if (height > 36 && height < 44) return point
  }
  return null
}

export function placeWorldStreams(
  generator: ValheimWorldGenerator,
  random = new UnityRandom(generator.seed.streamSeed),
  riverPreNorth = true,
): WorldRiver[] {
  const streams: WorldRiver[] = []

  for (let iteration = 0; iteration < 3_000; iteration += 1) {
    const start = findStreamStartPoint(generator, random, riverPreNorth)
    if (!start) continue
    const end = findStreamEndPoint(generator, random, start, riverPreNorth)
    if (!end) continue
    const center = {
      x: Math.fround((start.x + end.x) * 0.5),
      y: Math.fround((start.y + end.y) * 0.5),
    }
    const centerHeight = generator.getPregenerationHeight(center.x, center.y, riverPreNorth)
    if (centerHeight < 26 || centerHeight > 44) continue
    const streamDistance = distance(start, end)
    streams.push({
      start,
      end,
      center,
      widthMin: 20,
      widthMax: 20,
      curveWidth: Math.fround(streamDistance / 15),
      curveWavelength: Math.fround(streamDistance / 20),
    })
  }

  return streams
}

export function pregenerateWorld(generator: ValheimWorldGenerator): {
  lakes: WorldPoint[]
  rivers: WorldRiver[]
  streams: WorldRiver[]
  riverPoints: Map<string, RiverInfluencePoint[]>
} {
  const lakes = findWorldLakes(generator)
  const random = new UnityRandom(generator.seed.riverSeed)
  const rivers = placeWorldRivers(generator, lakes, random)
  const riverPoints = renderWorldRivers(rivers, random)
  generator.setRiverPoints(riverPoints)
  const streamRandom = new UnityRandom(generator.seed.streamSeed)
  const streams = placeWorldStreams(generator, streamRandom)
  renderWorldRivers(streams, streamRandom, riverPoints, (river) => !generator.isDeepNorth(river.start.x, river.start.y))
  generator.setRiverPoints(riverPoints)
  const northRandom = new UnityRandom(generator.seed.streamSeed)
  const northStreams = placeWorldStreams(generator, northRandom, false)
  renderWorldRivers(northStreams, northRandom, riverPoints, (river) => generator.isDeepNorth(river.start.x, river.start.y))
  generator.setRiverPoints(riverPoints)
  return { lakes, rivers, streams, riverPoints }
}
