import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const sourcePath = resolve('data/generated/decompiled-utils/FastNoise.cs')
const outputPath = resolve('src/lib/valheim/fast-noise-cell-vectors.ts')
const source = await readFile(sourcePath, 'utf8')
const start = source.indexOf('private static readonly Float2[] CELL_2D')
const end = source.indexOf('private static readonly Float3[] CELL_3D', start)

if (start === -1 || end === -1) {
  throw new Error('FastNoise CELL_2D table was not found in the decompiled source.')
}

const vectors = [...source.slice(start, end).matchAll(
  /new Float2\(([-+\d.eE]+), ([-+\d.eE]+)\)/g,
)].map((match) => [Number(match[1]), Number(match[2])])

if (vectors.length !== 256) {
  throw new Error(`Expected 256 CELL_2D vectors, found ${vectors.length}.`)
}

const rows = vectors.map(([x, y]) => `  [${x}, ${y}],`).join('\n')
await writeFile(
  outputPath,
  `/* eslint-disable no-loss-of-precision */\n` +
    `// Generated from the installed Valheim assembly_utils.dll FastNoise table.\n` +
    `export const FAST_NOISE_CELL_VECTORS = [\n${rows}\n] as const\n`,
  'utf8',
)

console.log(`Wrote ${vectors.length} FastNoise cell vectors.`)
