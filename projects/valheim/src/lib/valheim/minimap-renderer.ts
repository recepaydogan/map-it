import {
  ValheimWorldGenerator,
  getAshlandsOceanGradient,
  type ValheimBiome,
} from './world-generator.ts'
import { pregenerateWorld } from './world-pregeneration.ts'
import { createWorldSeedState } from './world-seed.ts'

/**
 * A port of the game's `Custom/mapshader` fragment program (disassembled from
 * the `minimap` material in bundle 17245031) fed by the same inputs
 * `Minimap.GenerateWorldMap` bakes: biome colour, `GetMaskColor` and biome
 * height. Every constant below is the game's own — material properties, the
 * Minimap prefab's biome colours, the "Clear" environment at midday — so a
 * tile is what the in-game map shows for the same ground, minus the parts that
 * only make sense live: exploration fog, drifting clouds and time-based water
 * and lava animation (frozen at t = 0).
 *
 * The game runs in linear colour space: sRGB textures and colour properties
 * are linearised before the maths and the result is encoded back to sRGB.
 */

interface TexturePixels {
  data: Uint8ClampedArray
  width: number
  height: number
}

/** A texture linearised (or left linear) and unpacked to floats for sampling. */
interface LinearTexture {
  data: Float32Array
  width: number
  height: number
}

interface RenderMinimapOptions {
  context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  resolution: number
  seedName: string
  isCancelled: () => boolean
  bounds?: { left: number; top: number; right: number; bottom: number }
}

const WORLD_DIAMETER = 21_000
/** Minimap.m_textureSize × m_pixelSize: the ground the game's map texture spans. */
const MAP_TEXTURE_SPAN = 2_048 * 12
/** `_normalWidth` (0.001 UV) in metres — the finite-difference step of the shader's normal. */
const NORMAL_WIDTH_METERS = 0.001 * MAP_TEXTURE_SPAN
/** Skirt cap so an extreme zoom never balloons the sample grid. */
const MAX_SAMPLE_RADIUS = 24
/** Beyond this UV radius from the map centre the shader draws the space texture. */
const SPACE_RADIUS = 0.42

const MAP_TEXTURE_URLS = {
  background: '/game-data/map-textures/background.png',
  clouds: '/game-data/map-textures/clouds.png',
  fogLayer: '/game-data/map-textures/fog-layer.png',
  forest: '/game-data/map-textures/forest.png',
  lava: '/game-data/map-textures/lava-mask.png',
  mountain: '/game-data/map-textures/mountain.png',
  space: '/game-data/map-textures/space.png',
  water: '/game-data/map-textures/water.png',
} as const
/** Which textures the game imports as sRGB (m_ColorSpace 1); the rest are linear data. */
const SRGB_TEXTURES: ReadonlySet<keyof typeof MAP_TEXTURE_URLS> = new Set([
  'background', 'fogLayer', 'forest', 'mountain', 'space', 'water',
])

type Rgb = readonly [number, number, number]

const clamp01 = (value: number) => Math.max(0, Math.min(1, value))

const srgbToLinear = (value: number) => (
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
)
const linearToSrgb = (value: number) => (
  value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
)
/** Output encoding runs three times per pixel; a table beats three pow calls. */
const SRGB_ENCODE_STEPS = 4_096
const srgbEncodeTable = Float32Array.from(
  { length: SRGB_ENCODE_STEPS + 1 },
  (_, step) => Math.round(linearToSrgb(step / SRGB_ENCODE_STEPS) * 255),
)
const encodeChannel = (linear: number) => (
  srgbEncodeTable[Math.round(clamp01(linear) * SRGB_ENCODE_STEPS)]
)
const rgb = (red: number, green: number, blue: number): Rgb => [red, green, blue]
const mulRgb = (first: Rgb, second: Rgb): Rgb => [
  first[0] * second[0], first[1] * second[1], first[2] * second[2],
]
const addRgb = (first: Rgb, second: Rgb): Rgb => [
  first[0] + second[0], first[1] + second[1], first[2] + second[2],
]

/**
 * Colour constants are used exactly as serialised: the game hands Color
 * properties to the shader without gamma conversion (checked against the
 * in-game map — with conversion the light turns deep orange and Meadows go
 * yellow). Textures, by contrast, are sRGB-decoded by the sampler.
 *
 * Minimap prefab `m_*Color` fields (Mistlands is hard-coded 0.2 in Minimap.cs).
 * These are baked into an sRGB RGB24 texture, so they are linearised on read.
 */
const BIOME_COLORS: Record<ValheimBiome, Rgb> = {
  'ashlands': rgb(0.4811320900917053, 0.12482201308012009, 0.12482201308012009),
  'black-forest': rgb(0.41963836550712585, 0.45481041073799133, 0.24669261276721954),
  'deep-north': rgb(1, 1, 1),
  'meadows': rgb(0.5725337862968445, 0.6551003456115723, 0.3605249226093292),
  'mistlands': rgb(0.2, 0.2, 0.2),
  'mountain': rgb(1, 1, 1),
  'ocean': rgb(1, 1, 1),
  'plains': rgb(0.9062027931213379, 0.6707255840301514, 0.47043564915657043),
  'swamp': rgb(0.6394598484039307, 0.4469825327396393, 0.3448844254016876),
}
const BIOMES = Object.keys(BIOME_COLORS) as ValheimBiome[]
const BIOME_INDEX = new Map(BIOMES.map((biome, index) => [biome, index]))
const BIOME_COLOR_TABLE: Rgb[] = BIOMES.map((biome) => {
  const color = BIOME_COLORS[biome]
  return [srgbToLinear(color[0]), srgbToLinear(color[1]), srgbToLinear(color[2])]
})

/** `minimap` material properties. */
const FOREST_COLOR = rgb(0.9191176295280457, 0.8217993378639221, 0.6758217811584473)
const WATER_COLOR = rgb(0.8428665399551392, 0.9372565150260925, 1.0917128324508667)
const WATER_COLOR_DEEP = rgb(0.3429930806159973, 0.5337382555007935, 0.7647058963775635)
const WATER_COLOR_ASHLANDS = rgb(0.2078431397676468, 0.2078431397676468, 0.2078431397676468)
const WATER_COLOR_ASHLANDS_DEEP = rgb(0.2235294133424759, 0.250980406999588, 0.3686274588108063)
const LAVA_COLOR_1 = rgb(0.4156862795352936, 0.0235294122248888, 0)
const LAVA_COLOR_2 = rgb(4.512624263763428, 0.2598893642425537, 0)
const LIGHT_COLOR = rgb(1.2000000476837158, 1.2000000476837158, 1.2000000476837158)
const AMBIENT_LIGHT_COLOR = rgb(0.8088235259056091, 0.8417850732803345, 1)
const NORMAL_INTENSITY = 4
const COASTLINE_COLOR: Rgb = [0.02, 0.01, 0.01]

/**
 * EnvMan globals for the default "Clear" environment at midday: sun colour ×
 * light intensity 1.7, ambient colour, and the sun direction
 * `Quaternion.Euler(-45,0,0) * Euler(0,-90,0) * Euler(90,0,0)` points along.
 */
const SUN_COLOR = rgb(1 * 1.7000000476837158, 0.7722482681274414 * 1.7000000476837158, 0.484000027179718 * 1.7000000476837158)
const AMBIENT_COLOR = rgb(0.4626230299472809, 0.573756754398346, 0.7058976292610168)
const SUN_DIR: Rgb = [0, Math.SQRT1_2, -Math.SQRT1_2]
const SUN_LIGHT = mulRgb(SUN_COLOR, LIGHT_COLOR)
const AMBIENT_LIGHT = mulRgb(AMBIENT_COLOR, AMBIENT_LIGHT_COLOR)
const SKY_LIGHT = addRgb(SUN_COLOR, AMBIENT_COLOR)
const MIST_COLOR_A = mulRgb(SKY_LIGHT, [0.7, 0.5, 1])
const MIST_COLOR_B = mulRgb(SKY_LIGHT, [1.2, 0.7, 0.7])
/** Below sea level the shader uses a straight-up normal, so water light is fixed. */
const WATER_LIGHT: Rgb = [
  Math.max(0, SUN_DIR[1]) * SUN_LIGHT[0] + AMBIENT_LIGHT[0],
  Math.max(0, SUN_DIR[1]) * SUN_LIGHT[1] + AMBIENT_LIGHT[1],
  Math.max(0, SUN_DIR[1]) * SUN_LIGHT[2] + AMBIENT_LIGHT[2],
]

const textureCache = new Map<string, Promise<LinearTexture>>()

const hermite = (weight: number) => weight * weight * (3 - 2 * weight)
const smoothStep = (minimum: number, maximum: number, value: number) => (
  hermite(clamp01((value - minimum) / (maximum - minimum)))
)
/** Photoshop-style overlay blend, exactly as the shader spells it out. */
const overlay = (base: number, blend: number) => (
  base <= 0.5 ? 2 * base * blend : 1 - 2 * (1 - base) * (1 - blend)
)
/**
 * Yield to the event loop between row bands so cancellation messages can be
 * observed. Deliberately not requestAnimationFrame: this runs in a worker, and
 * worker rAF stops ticking while the owning window is hidden, which would
 * stall tile generation for a backgrounded window.
 */
const nextFrame = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

const decodeImage = (url: string): Promise<TexturePixels> => (
  typeof document === 'undefined'
    ? fetch(url).then(async (response) => {
        if (!response.ok) throw new Error(`Could not load Valheim map texture: ${url}`)
        const bitmap = await createImageBitmap(await response.blob())
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error(`Could not create a canvas for map texture: ${url}`)
        context.drawImage(bitmap, 0, 0)
        bitmap.close()
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
        return { data: pixels.data, width: pixels.width, height: pixels.height }
      })
    : new Promise<TexturePixels>((resolve, reject) => {
        const image = new Image()
        image.crossOrigin = 'anonymous'
        image.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) {
            reject(new Error(`Could not create a canvas for map texture: ${url}`))
            return
          }
          context.drawImage(image, 0, 0)
          const pixels = context.getImageData(0, 0, canvas.width, canvas.height)
          resolve({ data: pixels.data, width: pixels.width, height: pixels.height })
        }
        image.onerror = () => reject(new Error(`Could not load Valheim map texture: ${url}`))
        image.src = url
      })
)

const loadTexture = (name: keyof typeof MAP_TEXTURE_URLS): Promise<LinearTexture> => {
  const url = MAP_TEXTURE_URLS[name]
  const cached = textureCache.get(url)
  if (cached) return cached
  const srgb = SRGB_TEXTURES.has(name)
  const pending = decodeImage(url).then(({ data, width, height }) => {
    const linear = new Float32Array(data.length)
    for (let index = 0; index < data.length; index += 4) {
      linear[index] = srgb ? srgbToLinear(data[index] / 255) : data[index] / 255
      linear[index + 1] = srgb ? srgbToLinear(data[index + 1] / 255) : data[index + 1] / 255
      linear[index + 2] = srgb ? srgbToLinear(data[index + 2] / 255) : data[index + 2] / 255
      linear[index + 3] = data[index + 3] / 255
    }
    return { data: linear, width, height }
  }).catch((error: unknown) => {
    textureCache.delete(url)
    throw new Error(`Could not load map texture ${url}: ${error instanceof Error ? error.message : String(error)}`)
  })
  textureCache.set(url, pending)
  return pending
}

/**
 * Scratch RGBA for sampleTexture. Rendering is single-threaded per worker and
 * every caller consumes the sample before taking the next one, so one buffer
 * spares us a few hundred thousand allocations per tile.
 */
const sampled = new Float64Array(4)

/** Bilinear, repeat-wrapped lookup — the sampler state the material uses. */
const sampleTexture = (texture: LinearTexture, u: number, v: number) => {
  const { data, width, height } = texture
  const x = (((u % 1) + 1) % 1) * width - 0.5
  const y = (((v % 1) + 1) % 1) * height - 0.5
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const fx = x - x0
  const fy = y - y0
  const xa = ((x0 % width) + width) % width
  const xb = (xa + 1) % width
  const ya = ((y0 % height) + height) % height
  const yb = (ya + 1) % height
  const i00 = (ya * width + xa) * 4
  const i10 = (ya * width + xb) * 4
  const i01 = (yb * width + xa) * 4
  const i11 = (yb * width + xb) * 4
  const w00 = (1 - fx) * (1 - fy)
  const w10 = fx * (1 - fy)
  const w01 = (1 - fx) * fy
  const w11 = fx * fy
  for (let channel = 0; channel < 4; channel += 1) {
    sampled[channel] = data[i00 + channel] * w00
      + data[i10 + channel] * w10
      + data[i01 + channel] * w01
      + data[i11 + channel] * w11
  }
  return sampled
}

/**
 * Rivers and streams are carved into the terrain by a pregeneration pass that
 * scans the whole world (~1s). It only depends on the seed, so each worker
 * keeps the last generator it prepared and reuses it for every tile of that
 * seed; without the pass the height functions skip the carving entirely and the
 * map shows dry land where the game has water.
 */
let cachedGenerator: { seedName: string; generator: ValheimWorldGenerator } | null = null

function getPregeneratedGenerator(seedName: string): ValheimWorldGenerator {
  if (cachedGenerator?.seedName === seedName) return cachedGenerator.generator
  const generator = new ValheimWorldGenerator(createWorldSeedState(seedName))
  pregenerateWorld(generator)
  cachedGenerator = { seedName, generator }
  return generator
}

export async function renderValheimMinimap({
  context,
  resolution,
  seedName,
  isCancelled,
  bounds = { left: 0, top: 0, right: 1, bottom: 1 },
}: RenderMinimapOptions): Promise<void> {
  const [background, clouds, fogLayer, forest, lava, mountain, space, water] = await Promise.all([
    loadTexture('background'),
    loadTexture('clouds'),
    loadTexture('fogLayer'),
    loadTexture('forest'),
    loadTexture('lava'),
    loadTexture('mountain'),
    loadTexture('space'),
    loadTexture('water'),
  ])
  if (isCancelled()) return

  const generator = getPregeneratedGenerator(seedName)
  const horizontalSpan = bounds.right - bounds.left
  const verticalSpan = bounds.bottom - bounds.top
  const metersPerPixel = WORLD_DIAMETER * horizontalSpan / resolution
  /**
   * The shader reads the height texture `_normalWidth` (24.6 m) to the west and
   * south of each texel to build its normal. That is read from our own sample
   * grid instead, so the grid carries a skirt wide enough to reach that far,
   * and the reads interpolate between grid points when the step is not a whole
   * number of them.
   */
  const normalStep = NORMAL_WIDTH_METERS / metersPerPixel
  const sampleRadius = Math.max(1, Math.min(MAX_SAMPLE_RADIUS, Math.ceil(normalStep)))
  const stepWhole = Math.min(sampleRadius, Math.floor(normalStep))
  const stepFraction = normalStep > sampleRadius ? 0 : normalStep - stepWhole
  /**
   * The shader darkens a band around sea level whose width follows the map's
   * zoom (clamped to 2–10 m); the tile's pixel footprint stands in for that.
   */
  const coastlineWidth = Math.max(2, Math.min(10, metersPerPixel * 0.5))

  const gridSize = resolution + sampleRadius * 2
  const pixelCount = gridSize * gridSize
  const heights = new Float32Array(pixelCount)
  const maskRed = new Float32Array(pixelCount)
  const maskGreen = new Float32Array(pixelCount)
  const maskBlue = new Float32Array(pixelCount)
  const biomes = new Uint8Array(pixelCount)

  // GenerateWorldMap: biome colour, GetMaskColor and biome height per texel.
  for (let row = 0; row < gridSize; row += 1) {
    const globalV = bounds.top + (row - sampleRadius + 0.5) / resolution * verticalSpan
    const worldY = (0.5 - globalV) * WORLD_DIAMETER
    for (let column = 0; column < gridSize; column += 1) {
      const globalU = bounds.left + (column - sampleRadius + 0.5) / resolution * horizontalSpan
      const worldX = (globalU - 0.5) * WORLD_DIAMETER
      const pixel = row * gridSize + column
      const biome = generator.getBiome(worldX, worldY)
      const terrain = generator.getHeightAndVegetation(worldX, worldY)
      biomes[pixel] = BIOME_INDEX.get(biome) ?? 0
      heights[pixel] = terrain.height

      if (terrain.height < 30) {
        maskBlue[pixel] = clamp01(getAshlandsOceanGradient(worldX, worldY))
      } else if (biome === 'meadows') {
        maskRed[pixel] = generator.getForestFactor(worldX, worldY) < 1.15 ? 1 : 0
      } else if (biome === 'plains') {
        maskRed[pixel] = generator.getForestFactor(worldX, worldY) < 0.8 ? 1 : 0
      } else if (biome === 'black-forest') {
        maskRed[pixel] = 1
      } else if (biome === 'mistlands') {
        maskGreen[pixel] = 1 - smoothStep(1.1, 1.3, generator.getForestFactor(worldX, worldY))
      } else if (biome === 'ashlands') {
        maskBlue[pixel] = terrain.vegetation
      }
    }
    if (row % 12 === 0) {
      await nextFrame()
      if (isCancelled()) return
    }
  }

  const heightAt = (pixel: number, offset: number) => (
    stepFraction === 0
      ? heights[pixel - offset * stepWhole]
      : heights[pixel - offset * stepWhole] * (1 - stepFraction)
        + heights[pixel - offset * (stepWhole + 1)] * stepFraction
  )

  const image = context.createImageData(resolution, resolution)
  for (let row = 0; row < resolution; row += 1) {
    const globalV = bounds.top + (row + 0.5) / resolution * verticalSpan
    const worldY = (0.5 - globalV) * WORLD_DIAMETER
    // Map-texture UV: the game's texel grid, so every tiled texture lands on the
    // same ground it does in-game.
    const py = worldY / MAP_TEXTURE_SPAN + 0.5
    for (let column = 0; column < resolution; column += 1) {
      const globalU = bounds.left + (column + 0.5) / resolution * horizontalSpan
      const worldX = (globalU - 0.5) * WORLD_DIAMETER
      const px = worldX / MAP_TEXTURE_SPAN + 0.5
      const pixel = (row + sampleRadius) * gridSize + column + sampleRadius
      const index = (row * resolution + column) * 4
      const height = heights[pixel]
      const forestMask = maskRed[pixel]
      const mistMask = maskGreen[pixel]
      const lavaMask = maskBlue[pixel]

      // Space past the map's rim.
      const rimDistance = Math.sqrt((px - 0.5) * (px - 0.5) + (py - 0.5) * (py - 0.5))
      if (rimDistance >= SPACE_RADIUS + 0.01) {
        const texel = sampleTexture(space, px * 2, py * 2)
        image.data[index] = encodeChannel(texel[0])
        image.data[index + 1] = encodeChannel(texel[1])
        image.data[index + 2] = encodeChannel(texel[2])
        image.data[index + 3] = 255
        continue
      }

      // Normal from the height texture (west and south neighbours), lit by the sun.
      let normalY = 0
      let lightR = WATER_LIGHT[0]
      let lightG = WATER_LIGHT[1]
      let lightB = WATER_LIGHT[2]
      if (height >= 29.5) {
        const westDelta = heightAt(pixel, 1) - height
        const southDelta = heightAt(pixel, gridSize) - height
        const length = Math.sqrt(westDelta * westDelta + NORMAL_INTENSITY * NORMAL_INTENSITY + southDelta * southDelta)
        normalY = NORMAL_INTENSITY / length
        const nDotL = Math.max(0, (westDelta * SUN_DIR[0] + NORMAL_INTENSITY * SUN_DIR[1] + southDelta * SUN_DIR[2]) / length)
        lightR = nDotL * SUN_LIGHT[0] + AMBIENT_LIGHT[0]
        lightG = nDotL * SUN_LIGHT[1] + AMBIENT_LIGHT[1]
        lightB = nDotL * SUN_LIGHT[2] + AMBIENT_LIGHT[2]
      }

      let red: number
      let green: number
      let blue: number

      if (height < 29.5) {
        // Water: fog layer × background under a depth-graded water colour, with
        // the wave texture fading in away from the shore.
        const fogTexel = sampleTexture(fogLayer, px * 5, py * 5)
        const fogR = fogTexel[0]
        const fogG = fogTexel[1]
        const fogB = fogTexel[2]
        const bgTexel = sampleTexture(background, px * 5, py * 5)
        const depth = clamp01((height - 9.5) * 0.05)
        const shore = clamp01((height - 29) * -0.071429)
        const ash = hermite(clamp01(lavaMask * 20))
        const waterR = (WATER_COLOR_DEEP[0] + (WATER_COLOR[0] - WATER_COLOR_DEEP[0]) * depth) * (1 - ash)
          + (WATER_COLOR_ASHLANDS_DEEP[0] + (WATER_COLOR_ASHLANDS[0] - WATER_COLOR_ASHLANDS_DEEP[0]) * depth) * ash
        const waterG = (WATER_COLOR_DEEP[1] + (WATER_COLOR[1] - WATER_COLOR_DEEP[1]) * depth) * (1 - ash)
          + (WATER_COLOR_ASHLANDS_DEEP[1] + (WATER_COLOR_ASHLANDS[1] - WATER_COLOR_ASHLANDS_DEEP[1]) * depth) * ash
        const waterB = (WATER_COLOR_DEEP[2] + (WATER_COLOR[2] - WATER_COLOR_DEEP[2]) * depth) * (1 - ash)
          + (WATER_COLOR_ASHLANDS_DEEP[2] + (WATER_COLOR_ASHLANDS[2] - WATER_COLOR_ASHLANDS_DEEP[2]) * depth) * ash
        red = (fogR + (bgTexel[0] - fogR) * 0.5) * waterR
        green = (fogG + (bgTexel[1] - fogG) * 0.5) * waterG
        blue = (fogB + (bgTexel[2] - fogB) * 0.5) * waterB
        const waveTexel = sampleTexture(water, px * 80, py * 80 + Math.sin(px * py * 4_000) * 0.01)
        const wave = (1 - shore) * waveTexel[3]
        red += (waveTexel[0] - red) * wave
        green += (waveTexel[1] - green) * wave
        blue += (waveTexel[2] - blue) * wave
      } else {
        // Land: biome colour × desaturated background, then Ashlands lava.
        const bgTexel = sampleTexture(background, px * 40, py * 40)
        const bgMax = Math.max(bgTexel[0], bgTexel[1], bgTexel[2])
        const bgMin = Math.min(bgTexel[0], bgTexel[1], bgTexel[2])
        const flat = bgMax - bgMin >= 0.0001
        const bgR = flat ? bgMax : bgTexel[0]
        const bgG = flat ? bgMax : bgTexel[1]
        const bgB = flat ? bgMax : bgTexel[2]
        const biomeColor = BIOME_COLOR_TABLE[biomes[pixel]]
        red = biomeColor[0] * bgR * 1.5
        green = biomeColor[1] * bgG * 1.5
        blue = biomeColor[2] * bgB * 1.5

        if (lavaMask > 0) {
          const coast = clamp01((height - 30.5) * 0.2)
          const lava0 = sampleTexture(lava, px * 40, py * 40)[0]
          const lava1 = sampleTexture(lava, px * 80, py * 80)[0]
          const lava2 = sampleTexture(lava, px * 60, py * 60)[0]
          const glow = overlay(lava0, overlay(lava1, lava2)) ** 2.5
          const lavaR = LAVA_COLOR_1[0] + (LAVA_COLOR_2[0] - LAVA_COLOR_1[0]) * glow
          const lavaG = LAVA_COLOR_1[1] + (LAVA_COLOR_2[1] - LAVA_COLOR_1[1]) * glow
          const lavaB = LAVA_COLOR_1[2] + (LAVA_COLOR_2[2] - LAVA_COLOR_1[2]) * glow
          const amount = overlay(coast * lavaMask, lava0)
          red += (lavaR - red) * amount
          green += (lavaG - green) * amount
          blue += (lavaB - blue) * amount
        }
      }

      // Mountain texture above 70 m.
      if (height > 70) {
        const texel = sampleTexture(mountain, px * 70, py * 70)
        const amount = clamp01((height - 70) * 0.04) * texel[3]
        red += (texel[0] - red) * amount
        green += (texel[1] - green) * amount
        blue += (texel[2] - blue) * amount
      }
      // Snow: flat ground above 80 m brightens towards mid grey.
      if (height > 80) {
        const flatness = clamp01((normalY - 0.14) * 6.25)
        const brightness = clamp01((red + green + blue) * 1.5)
        const snow = Math.max(0, clamp01((height - 80) * 0.05) * flatness - brightness)
        red += (0.5 - red) * snow
        green += (0.5 - green) * snow
        blue += (0.5 - blue) * snow
      }

      red *= lightR
      green *= lightG
      blue *= lightB

      // Coastline: a dark line where the terrain crosses sea level.
      const coastline = 1 - Math.min(1, Math.abs(height - 29.5) / coastlineWidth)
      if (coastline > 0) {
        red += (COASTLINE_COLOR[0] - red) * coastline
        green += (COASTLINE_COLOR[1] - green) * coastline
        blue += (COASTLINE_COLOR[2] - blue) * coastline
      }

      // Mistlands mist: two cloud lookups tinted by the sky.
      if (mistMask > 0) {
        const cloudA = sampleTexture(
          clouds,
          px * 15 + Math.sin(py * 850) * 0.01,
          py * 15 + Math.cos(px * 600) * 0.01,
        )[3]
        red += (MIST_COLOR_A[0] * cloudA - red) * mistMask
        green += (MIST_COLOR_A[1] * cloudA - green) * mistMask
        blue += (MIST_COLOR_A[2] * cloudA - blue) * mistMask
        const cloudB = sampleTexture(
          clouds,
          px * 20 + Math.sin(py * 750) * 0.01,
          py * 20 + Math.cos(px * 300) * 0.01,
        )[3]
        const amount = mistMask * cloudB
        red += (MIST_COLOR_B[0] - red) * amount
        green += (MIST_COLOR_B[1] - green) * amount
        blue += (MIST_COLOR_B[2] - blue) * amount
      }

      // Forest texture where the mask says trees, lit at 80% strength.
      if (forestMask > 0) {
        const texel = sampleTexture(forest, px * 150, py * 150)
        const treeR = texel[0] * FOREST_COLOR[0]
        const treeG = texel[1] * FOREST_COLOR[1]
        const treeB = texel[2] * FOREST_COLOR[2]
        const amount = forestMask * texel[3]
        red += (treeR + (treeR * lightR - treeR) * 0.8 - red) * amount
        green += (treeG + (treeG * lightG - treeG) * 0.8 - green) * amount
        blue += (treeB + (treeB * lightB - treeB) * 0.8 - blue) * amount
      }

      image.data[index] = encodeChannel(red)
      image.data[index + 1] = encodeChannel(green)
      image.data[index + 2] = encodeChannel(blue)
      image.data[index + 3] = 255
    }
    if (row % 64 === 0) {
      await nextFrame()
      if (isCancelled()) return
    }
  }

  context.putImageData(image, 0, 0)
}
