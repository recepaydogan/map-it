import fs from 'node:fs'
import path from 'node:path'
import { locationGenerationRules } from '../src/lib/valheim/location-generation-rules.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const generatedDirectory = path.join(projectRoot, 'data', 'generated')
const readJson = (filename) =>
  JSON.parse(fs.readFileSync(path.join(generatedDirectory, filename), 'utf8'))

const checks = []
const check = (name, condition, detail) => {
  checks.push({ name, passed: Boolean(condition), detail })
}

const assetIndex = readJson('asset-index.json')
const localization = readJson('localization.json')
const markerDetails = readJson('marker-details.json')
const locationContents = readJson('location-contents.json')
const worldRules = readJson('world-rules.json')
const defaultSeed = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'public', 'game-data', 'seeds', 'Valheim.json'),
  'utf8',
))
const runtimeLocationIndex = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'public', 'game-data', 'location-index.json'),
  'utf8',
))
const markerIntelligence = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'public', 'game-data', 'marker-intelligence.json'),
  'utf8',
))
const plannerCatalog = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'public', 'game-data', 'planner-catalog.json'),
  'utf8',
))
const markerIntelligenceText = JSON.stringify(markerIntelligence)
const unresolvedUserFacingTokens = markerIntelligenceText.match(/\$[a-zA-Z][a-zA-Z0-9_.-]*/g) ?? []
const leakedTechnicalPaths = markerIntelligenceText.match(/(?:Assets\/|MonoScript|CAB-|pathId|fileId)/g) ?? []

const activeNames = new Set(
  worldRules.locations
    .filter((location) => location.enable)
    .map((location) => location.prefabName || location.name),
)
const contentNames = new Set(
  locationContents.locations.map((location) => location.prefabName),
)
const missingActiveLocations = [...activeNames].filter(
  (name) => !contentNames.has(name),
)
const eikthyr = markerDetails.characters.find(
  (character) => character.prefabName === 'Eikthyr',
)
const eikthyrCharacter = eikthyr?.components.find(
  (component) => component.kind === 'character',
)
const swordIron = markerDetails.items.find(
  (item) => item.prefabName === 'SwordIron',
)
const meadTasty = markerDetails.items.find(
  (item) => item.prefabName === 'MeadTasty',
)
const ironSwordRecipe = markerDetails.recipes.find(
  (recipe) => recipe.name === 'Recipe_SwordIron',
)
const haldor = markerDetails.traders.find(
  (trader) => trader.prefabName === 'Haldor',
)
const iconCount = markerDetails.items.filter(
  (item) => item.iconCandidates?.length,
).length
const prioritizedLocationNames = runtimeLocationIndex.locations
  .filter((location) => location.enabled && location.placement.quantity > 0)
  .map((location, index) => ({ location, index }))
  .sort((first, second) =>
    (second.location.placement.prioritized ?? 0) -
      (first.location.placement.prioritized ?? 0) ||
    first.index - second.index,
  )
  .map(({ location }) => location.prefabName)
const expectedInitialLocationOrder = [
  'StartTemple',
  'Eikthyrnir',
  'GoblinKing',
  'GDKing',
  'Bonemass',
  'SunkenCrypt4',
  'Vendor_BlackForest',
  'Dragonqueen',
  'AncientUpgradeStation',
]
const missingDetailFiles = runtimeLocationIndex.locations
  .filter((location) => !location.detailPath || !fs.existsSync(path.join(
    projectRoot,
    'public',
    location.detailPath.replace(/^\/game-data\//, 'game-data/'),
  )))
  .map((location) => location.prefabName)
const faderMarkers = defaultSeed.markers?.filter(
  (marker) => marker.prefabName === 'FaderLocation',
) ?? []
const eikthyrMarkers = defaultSeed.markers?.filter(
  (marker) => marker.prefabName === 'Eikthyrnir',
) ?? []

const plannerItemKeys = new Set(Object.keys(markerIntelligence.items))
const plannerPieceKeys = new Set(Object.keys(plannerCatalog.pieceItems ?? {}))
const plannerRecipeIds = plannerCatalog.recipes.map((recipe) => recipe.id)
const duplicatePlannerRecipeIds = plannerRecipeIds.filter(
  (id, index) => plannerRecipeIds.indexOf(id) !== index,
)
const unresolvedPlannerReferences = plannerCatalog.recipes.flatMap((recipe) => [
  ...(plannerItemKeys.has(recipe.outputPrefab.toLowerCase()) ||
    plannerPieceKeys.has(recipe.outputPrefab.toLowerCase())
    ? []
    : [`${recipe.id}→${recipe.outputPrefab}`]),
  ...recipe.resources
    .filter((resource) => !plannerItemKeys.has(resource.prefabName.toLowerCase()))
    .map((resource) => `${recipe.id}→${resource.prefabName}`),
])
const invalidPlannerAmounts = plannerCatalog.recipes.filter((recipe) =>
  !Number.isInteger(recipe.outputAmount) || recipe.outputAmount < 1 ||
  !Number.isInteger(recipe.stationLevel) || recipe.stationLevel < 1 ||
  recipe.resources.length === 0 ||
  recipe.resources.some((resource) =>
    !Number.isInteger(resource.amount) || resource.amount < 1 ||
    !Number.isInteger(resource.amountPerLevel) || resource.amountPerLevel < 0),
).map((recipe) => recipe.id)
const plannerRecipesByOutput = new Map()
for (const recipe of plannerCatalog.recipes) {
  const key = recipe.outputPrefab.toLowerCase()
  plannerRecipesByOutput.set(key, [...(plannerRecipesByOutput.get(key) ?? []), recipe])
}
const plannerCycles = []
const cycleVisitState = new Map()
const walkPlannerRecipe = (prefabKey, stack) => {
  if (cycleVisitState.get(prefabKey) === 'done') return
  if (cycleVisitState.get(prefabKey) === 'visiting') {
    plannerCycles.push([...stack, prefabKey].join(' → '))
    return
  }
  cycleVisitState.set(prefabKey, 'visiting')
  for (const recipe of plannerRecipesByOutput.get(prefabKey) ?? []) {
    for (const resource of recipe.resources) {
      walkPlannerRecipe(resource.prefabName.toLowerCase(), [...stack, prefabKey])
    }
  }
  cycleVisitState.set(prefabKey, 'done')
}
for (const prefabKey of plannerRecipesByOutput.keys()) walkPlannerRecipe(prefabKey, [])
const traderItemKeys = new Set(
  Object.values(markerIntelligence.traders).flatMap((trader) =>
    trader.items.map((item) => item.prefabName.toLowerCase())),
)
const plannerIngredientKeys = [...new Set(
  plannerCatalog.recipes.flatMap((recipe) => recipe.resources.map((resource) => resource.prefabName)),
)]
const ingredientsWithoutSource = plannerIngredientKeys.filter((prefabName) => {
  const key = prefabName.toLowerCase()
  return !plannerRecipesByOutput.has(key) &&
    !(markerIntelligence.items[key]?.dropSources?.length ?? 0) &&
    !(plannerCatalog.itemLocations[key]?.length ?? 0) &&
    !(plannerCatalog.itemNodes?.[key]?.length ?? 0) &&
    !traderItemKeys.has(key)
})
const ingredientCoverage = {
  total: plannerIngredientKeys.length,
  covered: plannerIngredientKeys.length - ingredientsWithoutSource.length,
  ratio: plannerIngredientKeys.length === 0
    ? 1
    : (plannerIngredientKeys.length - ingredientsWithoutSource.length) / plannerIngredientKeys.length,
  missing: ingredientsWithoutSource.sort(),
}
const plannerStationText = JSON.stringify(plannerCatalog.stations)
const itemNodesFor = (itemKey) => plannerCatalog.itemNodes?.[itemKey] ?? []
const raspberryBushNode = plannerCatalog.resourceNodes?.raspberrybush
const savePrefabTypes = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'public', 'game-data', 'prefab-types.json'),
  'utf8',
))
const savePrefabKindsByName = new Map(
  savePrefabTypes.prefabs.map((prefab) => [prefab.prefabName, prefab.componentKinds]),
)
const bronzeSwordRecipe = plannerCatalog.recipes.find((recipe) => recipe.id === 'Recipe_SwordBronze')
const bronzeUpgradeToQuality2 = bronzeSwordRecipe?.resources.map((resource) => (
  `${resource.prefabName}:${resource.amountPerLevel * (2 - 1)}`
)).join(',')

check('both SoftRef manifests indexed', assetIndex.source.manifests?.length === 2, assetIndex.source.manifests?.map((value) => path.basename(value.path)))
check('asset catalog is comprehensive', assetIndex.totals.assets >= 17_000, assetIndex.totals)
check('all localization columns extracted', localization.languages.length >= 36, localization.languages)
check('English localization extracted', Object.keys(localization.translations.English ?? {}).length >= 4_200, Object.keys(localization.translations.English ?? {}).length)
check('Turkish localization extracted', Object.keys(localization.translations.Turkish ?? {}).length >= 3_900, Object.keys(localization.translations.Turkish ?? {}).length)
check('all active locations have prefab contents', missingActiveLocations.length === 0, missingActiveLocations)
check('location extraction has no errors', locationContents.errors.length === 0, locationContents.totals)
check('all location MonoBehaviour components extracted', locationContents.totals.semanticComponents >= 98_000, locationContents.totals.semanticComponents)
check('runtime location order matches ZoneSystem initialization', expectedInitialLocationOrder.every((name, index) => prioritizedLocationNames[index] === name), prioritizedLocationNames.slice(0, expectedInitialLocationOrder.length))
check('every location has a lazy-loaded full detail file', missingDetailFiles.length === 0, missingDetailFiles)
check('Eikthyr boss details are intact', eikthyr?.isBoss && eikthyrCharacter?.data?.health === 500, { isBoss: eikthyr?.isBoss, health: eikthyrCharacter?.data?.health })
check('Iron Sword icon is linked by Sprite reference', swordIron?.iconCandidates?.some((icon) => icon.path.endsWith('/SwordIron.png')), swordIron?.iconCandidates)
check('Tasty Mead non-matching icon is linked', meadTasty?.iconCandidates?.some((icon) => icon.path.endsWith('/potion_tasty.png')), meadTasty?.iconCandidates)
check('item icon coverage is substantial', iconCount >= 700, iconCount)
check('recipe references resolve to prefab names', ironSwordRecipe?.data?.item?.name === 'SwordIron' && ironSwordRecipe?.data?.resources?.every((resource) => resource.resItem?.name), ironSwordRecipe?.data)
check('all three traders and inventories extracted', markerDetails.traders.length === 3 && haldor?.components?.[0]?.data?.items?.length >= 9, markerDetails.traders.map((trader) => trader.prefabName))
check('build piece details extracted', markerDetails.pieces.length >= 500, markerDetails.pieces.length)
check('runtime data excludes world saves', !fs.existsSync(path.join(projectRoot, 'public', 'game-data', 'world-saves.json')), 'public/game-data/world-saves.json')
check('user-facing catalog has no unresolved localization tokens', unresolvedUserFacingTokens.length === 0, [...new Set(unresolvedUserFacingTokens)])
check('user-facing catalog has no Unity implementation details', leakedTechnicalPaths.length === 0, [...new Set(leakedTechnicalPaths)])
check('planner catalog covers item and build-piece recipes', plannerCatalog.recipes.filter((recipe) => recipe.kind === 'item').length >= 300 && plannerCatalog.recipes.filter((recipe) => recipe.kind === 'piece').length >= 400, {
  item: plannerCatalog.recipes.filter((recipe) => recipe.kind === 'item').length,
  piece: plannerCatalog.recipes.filter((recipe) => recipe.kind === 'piece').length,
})
check('planner recipe identities are unique', duplicatePlannerRecipeIds.length === 0, [...new Set(duplicatePlannerRecipeIds)])
check('planner recipe references resolve to catalog items', unresolvedPlannerReferences.length === 0, unresolvedPlannerReferences.slice(0, 12))
check('planner recipe amounts are valid integers', invalidPlannerAmounts.length === 0, invalidPlannerAmounts.slice(0, 12))
check('planner recipe graph has no cycles', plannerCycles.length === 0, plannerCycles.slice(0, 6))
check('planner station names are localized', !plannerStationText.includes('$') && Object.keys(plannerCatalog.stations).length >= 9, plannerCatalog.stations)
check('planner upgrade costs match Valheim quality math', bronzeUpgradeToQuality2 === 'Wood:1,Bronze:4,LeatherScraps:1', bronzeUpgradeToQuality2)
check('planner ingredient acquisition coverage stays high', ingredientCoverage.ratio >= 0.8, {
  covered: ingredientCoverage.covered,
  total: ingredientCoverage.total,
  ratio: Number(ingredientCoverage.ratio.toFixed(3)),
  // Deposits, forageables, and choppable trees are placed by ZoneVegetation rules
  // whose prefab references are not name-resolvable in the extracted assets. The
  // planner shows an explicit missing-source state for these.
  withoutKnownSource: ingredientCoverage.missing,
})
check('planner resource-node catalog is substantial', Object.keys(plannerCatalog.resourceNodes ?? {}).length >= 300 && Object.keys(plannerCatalog.itemNodes ?? {}).length >= 100, {
  resourceNodes: Object.keys(plannerCatalog.resourceNodes ?? {}).length,
  itemNodes: Object.keys(plannerCatalog.itemNodes ?? {}).length,
})
check('planner resource nodes resolve harvest chains', (
  itemNodesFor('copperore').includes('rock4_copper') &&
  itemNodesFor('copperore').includes('rock4_copper_frac') &&
  itemNodesFor('wood').includes('Beech1') &&
  itemNodesFor('raspberry').includes('RaspberryBush') &&
  itemNodesFor('tinore').includes('MineRock_Tin')
), {
  copperore: itemNodesFor('copperore'),
  wood: itemNodesFor('wood').filter((name) => name.startsWith('Beech')),
  raspberry: itemNodesFor('raspberry'),
  tinore: itemNodesFor('tinore'),
})
// Pins the Pickable save semantics the loot-state model depends on: a berry
// bush respawns (300 game-minutes) and keeps its ZDO when picked.
check('planner resource nodes carry tool tiers', (
  plannerCatalog.resourceNodes?.rock4_copper_frac?.minToolTier === 0 &&
  plannerCatalog.resourceNodes?.minerock_tin?.minToolTier === 0 &&
  (plannerCatalog.resourceNodes?.silvervein_frac?.minToolTier ?? 0) >= 2
), {
  copper: plannerCatalog.resourceNodes?.rock4_copper_frac?.minToolTier,
  tin: plannerCatalog.resourceNodes?.minerock_tin?.minToolTier,
  silver: plannerCatalog.resourceNodes?.silvervein_frac?.minToolTier,
})
check('planner resource nodes keep Pickable respawn semantics', raspberryBushNode?.respawnTimeMinutes === 300 && raspberryBushNode?.hideWhenPicked === true, raspberryBushNode)
check('save prefab index tags resource-node kinds', (
  (savePrefabKindsByName.get('Beech1') ?? []).includes('tree') &&
  (savePrefabKindsByName.get('RaspberryBush') ?? []).includes('pickable') &&
  (savePrefabKindsByName.get('rock4_copper_frac') ?? []).includes('mine-rock') &&
  (savePrefabKindsByName.get('rock4_copper') ?? []).includes('destructible')
), {
  Beech1: savePrefabKindsByName.get('Beech1'),
  RaspberryBush: savePrefabKindsByName.get('RaspberryBush'),
  rock4_copper_frac: savePrefabKindsByName.get('rock4_copper_frac'),
  rock4_copper: savePrefabKindsByName.get('rock4_copper'),
})
check('default seed cache contains generated markers', defaultSeed.markers?.length >= 11_000, {
  seedName: defaultSeed.seedName,
  markers: defaultSeed.markers?.length,
  failures: defaultSeed.rules?.failures?.length,
})
// Earlier coordinate fixtures belong to 0.221.12. Version 1.0 changes the
// sampling algorithm and list order; check coverage and source identity here.
// Exact game parity still requires an in-game comparison, which is not run.
check('default seed covers the boss locations', faderMarkers.length === 3 && eikthyrMarkers.length === 3 && defaultSeed.markers.some((m) => m.prefabName === 'DN_Bossroom'), { fader: faderMarkers.length, eikthyr: eikthyrMarkers.length })
const altRules = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public/game-data/biome-rules.json'), 'utf8')).altBiomes
const fingerprintText = JSON.stringify({ locations: locationGenerationRules(runtimeLocationIndex.locations), altBiomes: altRules })
let fingerprint = 0x811c9dc5
for (let i = 0; i < fingerprintText.length; i++) { fingerprint ^= fingerprintText.charCodeAt(i); fingerprint = Math.imul(fingerprint, 0x01000193) >>> 0 }
check('seed cache matches current generation rules', defaultSeed.generatorVersion === 2 && defaultSeed.rulesFingerprint === fingerprint.toString(16).padStart(8, '0'), defaultSeed.rulesFingerprint)
check('seed coordinates are finite and zones are unique', defaultSeed.markers.every((m) => Number.isFinite(m.x) && Number.isFinite(m.y)) && new Set(defaultSeed.markers.map((m) => `${Math.floor((m.x + 32) / 64)},${Math.floor((m.y + 32) / 64)}`)).size === defaultSeed.markers.length, defaultSeed.markers.length)
check('Deep North item and trader additions resolve', plannerRecipesByOutput.has('swordgold') && markerIntelligence.traders.haldor.services.length === 2 && markerIntelligence.bossOfferings.frozenking?.prefabName === 'HatefulBlood', markerIntelligence.traders.haldor.services)

// Building catalog (structural integrity): hammer pieces with WearNTear data.
const buildingCatalog = JSON.parse(fs.readFileSync(
  path.join(projectRoot, 'public', 'game-data', 'building-catalog.json'),
  'utf8',
))
const buildingPieceByName = new Map(buildingCatalog.pieces.map((piece) => [piece.prefabName, piece]))
const woodBeam = buildingPieceByName.get('wood_beam')
const graustenWall = buildingPieceByName.get('Piece_grausten_wall_2x2')
check('building catalog covers the hammer build table', buildingCatalog.pieces.length >= 300 && ['Wood', 'HardWood', 'Stone', 'Iron', 'Marble', 'Ashstone'].every((material) => buildingCatalog.pieces.some((piece) => piece.material === material)), buildingCatalog.pieces.length)
check('building catalog mirrors WearNTear material constants', buildingCatalog.materials.Wood?.maxSupport === 100 && buildingCatalog.materials.Wood?.minSupport === 10 && buildingCatalog.materials.Iron?.maxSupport === 1500 && buildingCatalog.materials.Stone?.horizontalLoss === 1, buildingCatalog.materials)
check('building catalog carries side-view bounds for the wood beam', woodBeam?.material === 'Wood' && woodBeam?.health === 400 && woodBeam?.bounds?.min?.[0] === -0.985 && woodBeam?.bounds?.max?.[0] === 1.015 && woodBeam?.boxy === true, woodBeam)
check('building catalog keeps grausten centre-of-mass offsets', graustenWall?.material === 'Ashstone' && graustenWall?.comOffset?.[1] === 1 && graustenWall?.bounds?.min?.[1] === 0, graustenWall)
check('building catalog names and icons resolve', buildingCatalog.pieces.every((piece) => piece.name && !piece.name.startsWith('$')) && buildingCatalog.pieces.filter((piece) => !piece.icon).length <= 5, buildingCatalog.pieces.filter((piece) => !piece.icon).map((piece) => piece.prefabName))

const report = {
  schemaVersion: 1,
  passed: checks.every((value) => value.passed),
  checks,
}
fs.writeFileSync(
  path.join(generatedDirectory, 'validation-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
)

for (const value of checks) {
  console.log(`${value.passed ? 'PASS' : 'FAIL'} ${value.name}`)
}
if (!report.passed) process.exitCode = 1
