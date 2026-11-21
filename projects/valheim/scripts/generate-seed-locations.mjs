import { BiomeWorld } from '../src/lib/valheim/biome-world.ts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createWorldSeedState } from '../src/lib/valheim/world-seed.ts'
import { ValheimWorldGenerator } from '../src/lib/valheim/world-generator.ts'
import { pregenerateWorld } from '../src/lib/valheim/world-pregeneration.ts'
import { generateWorldLocations } from '../src/lib/valheim/location-generator.ts'
import { locationGenerationRules } from '../src/lib/valheim/location-generation-rules.mjs'

const seedName = process.argv[2] ?? 'Valheim'
const outputPath = resolve(
  process.argv[3] ?? `data/generated/seeds/${encodeURIComponent(seedName)}.json`,
)
const catalog = JSON.parse(
  await readFile(resolve('public/game-data/location-index.json'), 'utf8'),
)
const generator = new ValheimWorldGenerator(createWorldSeedState(seedName))
const startedAt = performance.now()
const pregeneration = pregenerateWorld(generator)
const { altBiomes } = JSON.parse(await readFile(resolve('public/game-data/biome-rules.json'), 'utf8'))
console.log('Generating biome sectors...')
generator.biomeWorld = new BiomeWorld(generator, altBiomes)
const text = JSON.stringify({ locations: locationGenerationRules(catalog.locations), altBiomes })
let hash = 0x811c9dc5
for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0 }
const failures = []
let completedRules = 0

const markers = generateWorldLocations(
  generator,
  catalog.locations,
  (location, placed, requested) => {
    completedRules += 1
    if (placed < requested) failures.push({
      prefabName: location.prefabName,
      placed,
      requested,
    })
    console.log(
      `${completedRules}: ${location.prefabName} ${placed}/${requested}`,
    )
  },
)

const result = {
  schemaVersion: 1,
  generatorVersion: 2,
  rulesFingerprint: hash.toString(16).padStart(8, '0'),
  seedName,
  worldSeed: generator.seed,
  generatedAt: new Date().toISOString(),
  durationMs: Math.round(performance.now() - startedAt),
  pregeneration: {
    lakes: pregeneration.lakes.length,
    rivers: pregeneration.rivers.length,
    streams: pregeneration.streams.length,
  },
  rules: {
    completed: completedRules,
    failures,
  },
  markers,
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(`Wrote ${markers.length} markers to ${outputPath}`)
