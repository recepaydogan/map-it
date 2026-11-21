import * as THREE from 'three'
import type { MaterialClass } from '../../../lib/building/support-model.ts'

/** Base colour per material class; textures below are near-white so this shows through. */
export const MATERIAL_BASE_COLOR: Record<MaterialClass, string> = {
  Wood: '#a57a48',
  HardWood: '#8a5c33',
  Stone: '#8d8a80',
  Iron: '#6c7078',
  Marble: '#3a3b42',
  Ashstone: '#5c5753',
  Ancient: '#4a453f',
}

export const ROCK_COLOR = '#4b4741'

interface Rng {
  (): number
}

/** Small deterministic PRNG so the textures look the same every session. */
const mulberry = (seed: number): Rng => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const SIZE = 256

const paint = (draw: (ctx: CanvasRenderingContext2D, rng: Rng) => void, seed: number): THREE.CanvasTexture => {
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, SIZE, SIZE)
  draw(ctx, mulberry(seed))
  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

const grain = (ctx: CanvasRenderingContext2D, rng: Rng, lines: number, alpha: number) => {
  for (let i = 0; i < lines; i += 1) {
    const y = rng() * SIZE
    ctx.strokeStyle = `rgba(0,0,0,${alpha * (0.4 + rng() * 0.6)})`
    ctx.lineWidth = 0.6 + rng() * 1.4
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(SIZE * 0.3, y + (rng() - 0.5) * 10, SIZE * 0.7, y + (rng() - 0.5) * 10, SIZE, y + (rng() - 0.5) * 6)
    ctx.stroke()
  }
}

const speckle = (ctx: CanvasRenderingContext2D, rng: Rng, count: number, alpha: number, radius = 1.5) => {
  for (let i = 0; i < count; i += 1) {
    const dark = rng() > 0.5
    ctx.fillStyle = dark ? `rgba(0,0,0,${alpha * rng()})` : `rgba(255,255,255,${alpha * rng()})`
    ctx.beginPath()
    ctx.arc(rng() * SIZE, rng() * SIZE, rng() * radius, 0, Math.PI * 2)
    ctx.fill()
  }
}

const blocks = (ctx: CanvasRenderingContext2D, rng: Rng, rows: number, alpha: number) => {
  const h = SIZE / rows
  for (let r = 0; r < rows; r += 1) {
    const offset = (r % 2) * (SIZE / 4)
    ctx.strokeStyle = `rgba(0,0,0,${alpha})`
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(0, r * h)
    ctx.lineTo(SIZE, r * h)
    ctx.stroke()
    for (let c = -1; c < 3; c += 1) {
      const x = offset + c * (SIZE / 2)
      ctx.beginPath()
      ctx.moveTo(x, r * h)
      ctx.lineTo(x, (r + 1) * h)
      ctx.stroke()
    }
    ctx.fillStyle = `rgba(0,0,0,${alpha * 0.25 * rng()})`
    ctx.fillRect(0, r * h, SIZE, h)
  }
}

let cache: Record<MaterialClass, THREE.CanvasTexture> | null = null

/** Lazily built, shared per session (needs a DOM canvas). */
export const materialTextures = (): Record<MaterialClass, THREE.CanvasTexture> => {
  cache ??= {
    Wood: paint((ctx, rng) => { grain(ctx, rng, 90, 0.16); speckle(ctx, rng, 400, 0.05) }, 1),
    HardWood: paint((ctx, rng) => { grain(ctx, rng, 120, 0.22); speckle(ctx, rng, 300, 0.06) }, 2),
    Stone: paint((ctx, rng) => { blocks(ctx, rng, 4, 0.28); speckle(ctx, rng, 1200, 0.08, 2) }, 3),
    Iron: paint((ctx, rng) => { speckle(ctx, rng, 2000, 0.05, 1); grain(ctx, rng, 20, 0.05) }, 4),
    Marble: paint((ctx, rng) => { speckle(ctx, rng, 600, 0.12, 1.2); grain(ctx, rng, 14, 0.18) }, 5),
    Ashstone: paint((ctx, rng) => { blocks(ctx, rng, 3, 0.22); speckle(ctx, rng, 1500, 0.09, 2) }, 6),
    Ancient: paint((ctx, rng) => { blocks(ctx, rng, 2, 0.3); speckle(ctx, rng, 800, 0.1, 2) }, 7),
  }
  return cache
}

let rockTexture: THREE.CanvasTexture | null = null
export const rockTextureFor = () => {
  rockTexture ??= paint((ctx, rng) => { speckle(ctx, rng, 3000, 0.16, 3); grain(ctx, rng, 30, 0.08) }, 11)
  return rockTexture
}
