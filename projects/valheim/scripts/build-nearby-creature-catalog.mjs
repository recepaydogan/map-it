import fs from 'node:fs'
import path from 'node:path'

const generatedDataDir = path.resolve('data/generated')
const gameDataDir = path.resolve('public/game-data')
const characterSourcePath = path.join(generatedDataDir, 'marker-details.json')
const spawnRuleSourcePath = path.join(generatedDataDir, 'spawn-rules.json')
const outputPath = path.join(gameDataDir, 'nearby-creature-catalog.json')
const cleanLabel = (label) => label.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
const normalize = (value) => value.trim().toLowerCase()

const markerDetails = JSON.parse(fs.readFileSync(characterSourcePath, 'utf8'))
const spawnRules = JSON.parse(fs.readFileSync(spawnRuleSourcePath, 'utf8'))
const worldRules = JSON.parse(fs.readFileSync(path.join(generatedDataDir, 'world-rules.json'), 'utf8'))
const ambientSpawners = [...spawnRules.spawners, ...(worldRules.altBiomes ?? []).flatMap((alt) => alt.enabled ? alt.spawn ?? [] : [])]
const ambientPrefabNames = new Set(ambientSpawners
  .filter((spawner) => Boolean(spawner.enabled) && !spawner.devDisabled)
  .map((spawner) => spawner.prefab?.name)
  .filter((name) => typeof name === 'string' && name.trim())
  .map(normalize))

if (ambientPrefabNames.size === 0) {
  throw new Error(`No enabled ambient creature prefabs found in ${spawnRuleSourcePath}`)
}

// Joining the base SpawnSystem rules to Character prefabs deliberately drops
// weather objects, VFX, fixed bosses, dungeon-only enemies, and summons.
const creatures = markerDetails.characters
  .filter((character) => ambientPrefabNames.has(normalize(character.prefabName)))
  .map((character) => ({
    prefab: character.prefabName,
    nameToken: character.displayNameKey || null,
    label: character.displayName ? cleanLabel(character.displayName) : null,
  }))
  .sort((first, second) => first.prefab.localeCompare(second.prefab, 'en'))

if (creatures.length === 0) {
  throw new Error('Ambient spawn rules did not match any Character prefabs')
}

fs.mkdirSync(gameDataDir, { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify({ schemaVersion: 2, creatures })}\n`)
console.log(`Wrote ${creatures.length} ambient, unpinned creature types to ${outputPath}`)
