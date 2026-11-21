import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Natural outdoor sources only. Dungeon contents, random treasure, planted
// crops and objects that must snap to another collider need different models.
const SOURCE_PREFABS = new Set([
  'RaspberryBush', 'BlueberryBush', 'CloudberryBush', 'LingonberryBush',
  'Pickable_Mushroom', 'Pickable_Mushroom_JotunPuffs', 'Pickable_Thistle',
  'Pickable_Dandelion', 'Pickable_Flint', 'Pickable_SeedCarrot',
  'Pickable_SeedTurnip', 'Pickable_SeedKale', 'Pickable_Snowball',
  'Pickable_StoneRock', 'Pickable_Branch_Snow', 'Pickable_Charredskull',
  'MineRock_Tin', 'rock4_copper', 'silvervein', 'MineRock_Obsidian',
  'mudpile_beacon', 'Leviathan', 'Birch1', 'Birch2', 'Birch1_aut',
  'Birch2_aut', 'Oak1', 'Pinetree_01', 'SwampTree1', 'AshlandsTree1',
  'AshlandsTree3', 'AshlandsTree6', 'SnowFirTree', 'SnowFirTree 2',
  'SnowFirTree_small', 'Pinetree_Snow', 'Pinetree_Snow_dead',
].map((name) => name.toLowerCase()))
const HIDDEN_MATERIALS = new Set(['wood', 'resin', 'stone', 'feathers', 'amberpearl', 'seekerbrood', 'iceshoreshard'])

export function buildSeedResourceRules(vegetation, prefabNames, resourceNodes) {
  return vegetation.flatMap((entry) => {
    if (entry.enable !== 1) return []
    const prefabName = prefabNames[entry.prefab.pathId]
    if (!prefabName) throw new Error(`Missing vegetation prefab name: ${entry.name}`)
    if (!SOURCE_PREFABS.has(prefabName.toLowerCase()) || entry.snapToStaticSolid || entry.surroundCheckVegetation) return []
    const node = resourceNodes[prefabName.toLowerCase()]
    if (!node) throw new Error(`Missing resource node: ${prefabName}`)
    const materials = [...new Set(node.items.map((item) => item.prefabName.toLowerCase()))]
      .filter((key) => !HIDDEN_MATERIALS.has(key))
    if (!materials.length) return []
    const { prefab: _prefab, foldout: _foldout, sourceList: _sourceList, biomes: _biomes, ...rule } = entry
    return [{ ...rule, prefabName, materials }]
  })
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(import.meta.dirname, '..')
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'))
  const { vegetation } = read('data/generated/world-rules.json')
  const { prefabs } = read('data/generated/vegetation-prefabs.json')
  const { resourceNodes } = read('public/game-data/planner-catalog.json')
  const rules = buildSeedResourceRules(vegetation, prefabs, resourceNodes)
  fs.writeFileSync(path.join(root, 'public/game-data/seed-resource-rules.json'), `${JSON.stringify({ schemaVersion: 1, rules })}\n`)
  console.log(`Built ${rules.length} rules for ${new Set(rules.flatMap((rule) => rule.materials)).size} materials.`)
}
