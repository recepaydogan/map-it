import fs from 'node:fs'
import path from 'node:path'
import { createPieceIconResolver } from './piece-icons.mjs'
import { createLocationSearchData } from './location-search-index.mjs'
import { collectEncounterDrops, extractCreatureTransitions } from './creature-transitions.mjs'
import { buildSeedResourceRules } from './build-seed-resource-rules.mjs'

const projectRoot = path.resolve(import.meta.dirname, '..')
const generatedDirectory = path.join(projectRoot, 'data', 'generated')
const outputDirectory = path.join(projectRoot, 'public', 'game-data')

const readJson = (filename) =>
  JSON.parse(fs.readFileSync(path.join(generatedDirectory, filename), 'utf8'))

const writeJson = (filename, value) => {
  const target = path.join(outputDirectory, filename)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const temporary = `${target}.${process.pid}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value)}\n`)
  fs.renameSync(temporary, target)
}

const formatPrefabName = (value) => value
  .replace(/^piece_/i, '')
  .replace(/[_-]+/g, ' ')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^./, (character) => character.toUpperCase())

const toKebabCase = (value) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase()

const assetIndex = readJson('asset-index.json')
const localization = readJson('localization.json')
const markerDetails = readJson('marker-details.json')
const recipeSource = markerDetails
const locationContents = readJson('location-contents.json')
const worldRules = readJson('world-rules.json')
const extractionSummary = readJson('extraction-summary.json')

const iconManifestPath = path.join(outputDirectory, 'icon-manifest.json')
const iconManifest = fs.existsSync(iconManifestPath)
  ? JSON.parse(fs.readFileSync(iconManifestPath, 'utf8'))
  : { icons: {} }

const localize = (value, fallback = '') => {
  if (typeof value !== 'string' || !value) return fallback
  const normalizedValue = value.trim()
  const key = normalizedValue.replace(/^\$/, '')
  const translated = localization.english?.[key]
  if (translated) return translated
  return normalizedValue.startsWith('$') ? fallback : normalizedValue
}

const itemIcon = (item) => {
  for (const candidate of item?.iconCandidates ?? []) {
    const icon = iconManifest.icons?.[candidate.path]
    if (icon?.url) return icon.url
  }
  return null
}

const itemsByPrefab = new Map(
  markerDetails.items.map((item) => [item.prefabName.toLowerCase(), item]),
)

const statusEffectsByName = new Map(
  markerDetails.statusEffects.map((effect) => [effect.name, effect]),
)

const itemSummary = (prefabName) => {
  const item = itemsByPrefab.get(prefabName?.toLowerCase())
  return {
    prefabName,
    name: item?.displayName || localize(item?.displayNameKey, prefabName),
    icon: itemIcon(item),
  }
}

const positiveInteger = (value, fallback) => (
  Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
)
const nonNegativeInteger = (value, fallback) => (
  Number.isFinite(value) && value >= 0 ? Math.round(value) : fallback
)

const craftedByPrefab = new Map()
const usedInRecipesByPrefab = new Map()
const plannerRecipes = []
const unresolvedRecipes = []
for (const recipe of recipeSource.recipes ?? []) {
  const data = recipe.data ?? {}
  const outputPrefab = data.item?.name
  if (!data.enabled) continue
  if (!outputPrefab) {
    unresolvedRecipes.push({ id: recipe.name, reason: 'missing-output-item' })
    continue
  }
  const rawResources = (data.resources ?? []).filter((resource) => !resource.upgraderResource)
  const resolvedResources = rawResources.filter((resource) => resource.resItem?.name)
  if (resolvedResources.length !== rawResources.length) {
    unresolvedRecipes.push({ id: recipe.name, reason: 'missing-resource-item' })
  }
  const outputAmount = positiveInteger(data.amount, 1)
  const stationPrefab = data.craftingStation?.name ?? ''
  const stationLevel = Math.max(1, positiveInteger(data.minStationLevel, 1))
  const compactRecipe = {
    recipeId: recipe.name,
    noCraftOnlyUpgrade: Boolean(data.noCraftOnlyUpgrade),
    outputAmount,
    stationPrefab,
    stationLevel,
    resources: resolvedResources.map((resource) => ({
      ...itemSummary(resource.resItem.name),
      amount: positiveInteger(resource.amount, 1),
      amountPerLevel: nonNegativeInteger(resource.amountPerLevel, 0),
    })),
  }
  const outputKey = outputPrefab.toLowerCase()
  if (!data.noCraftOnlyUpgrade) craftedByPrefab.set(outputKey, [...(craftedByPrefab.get(outputKey) ?? []), compactRecipe])
  plannerRecipes.push({
    id: recipe.name,
    kind: 'item',
    noCraftOnlyUpgrade: Boolean(data.noCraftOnlyUpgrade),
    outputPrefab,
    outputAmount,
    stationPrefab,
    repairStationPrefab: data.repairStation?.name ?? '',
    stationLevel,
    requireOnlyOneIngredient: Boolean(data.requireOnlyOneIngredient),
    qualityResultAmountMultiplier: Number.isFinite(data.qualityResultAmountMultiplier)
      ? data.qualityResultAmountMultiplier
      : 1,
    resources: compactRecipe.resources.map((resource) => ({
      prefabName: resource.prefabName,
      amount: resource.amount,
      amountPerLevel: resource.amountPerLevel,
      upgradeCostModel: '1.0',
    })),
  })
  const upgradeResources = (data.resources ?? []).filter((resource) => resource.upgraderResource && resource.resItem?.name)
  if (upgradeResources.length) plannerRecipes.push({
    ...plannerRecipes[plannerRecipes.length - 1], id: `Upgrader_${recipe.name}`,
    noCraftOnlyUpgrade: true, stationPrefab: 'UpgradeStation', stationLevel: 1,
    isUpgrader: true,
    resources: upgradeResources.map((resource) => ({ prefabName: resource.resItem.name,
      amount: resource.amount, amountPerLevel: resource.amountPerLevel, upgraderResource: true, upgradeCostModel: '1.0' })),
  })
  for (const resource of resolvedResources) {
    const resourceKey = resource.resItem.name.toLowerCase()
    usedInRecipesByPrefab.set(resourceKey, [
      ...(usedInRecipesByPrefab.get(resourceKey) ?? []),
      {
        ...itemSummary(outputPrefab),
        amount: positiveInteger(resource.amount, 1),
        outputAmount,
        stationPrefab,
      },
    ])
  }
}

// Smelters, kilns, cooking stations, fermenters, and the spinning wheel turn one
// item into another. They are recipes for planning purposes even though Valheim
// stores them as station components instead of Recipe assets.
const conversionRecipes = []
const productionStations = {}
for (const record of markerDetails.conversionStations ?? []) {
  const productionDefinition = productionStations[record.prefabName.toLowerCase()] ?? {
    prefabName: record.prefabName,
    maxInput: 0,
    maxFuel: 0,
    secondsPerProduct: 0,
    fuelPrefab: '',
    fuelPerProduct: 0,
    fermentationSeconds: 0,
    conversions: [],
  }
  for (const station of record.stations ?? []) {
    const data = station.data ?? {}
    productionDefinition.maxInput = Math.max(productionDefinition.maxInput, nonNegativeInteger(data.maxOre, 0))
    productionDefinition.maxFuel = Math.max(productionDefinition.maxFuel, nonNegativeInteger(data.maxFuel, 0))
    productionDefinition.secondsPerProduct ||= Number.isFinite(data.secPerProduct) ? data.secPerProduct : 0
    productionDefinition.fuelPrefab ||= data.fuelItem?.name ?? ''
    productionDefinition.fuelPerProduct ||= Number.isFinite(data.fuelPerProduct) ? data.fuelPerProduct : 0
    productionDefinition.fermentationSeconds ||= Number.isFinite(data.fermentationDuration) ? data.fermentationDuration : 0
    const fuelPrefab = data.fuelItem?.name ?? ''
    const fixedFuelPerProduct = nonNegativeInteger(data.fuelPerProduct, 0)
    for (const conversion of data.conversion ?? []) {
      // A single-slot foundry burns only while processing. Budget whole fuel
      // units for a complete conversion (50 seconds / 10 seconds = 5).
      const fuelPerProduct = fixedFuelPerProduct || (data.useFuel && !data.useFueldWhileEmpty && data.slots?.length === 1 && data.secPerFuel > 0
        ? Math.ceil((conversion.cookTime ?? 0) / data.secPerFuel) : 0)
      const fuelOnly = !conversion.from?.name && fuelPrefab && data.maxOre === 0 && fuelPerProduct > 0
      const fromPrefab = conversion.from?.name || (fuelOnly ? fuelPrefab : null)
      const toPrefab = conversion.to?.name
      if (!fromPrefab || !toPrefab) continue
      if (!productionDefinition.conversions.some((existing) => existing.inputPrefab === fromPrefab && existing.outputPrefab === toPrefab)) {
        productionDefinition.conversions.push({
          inputPrefab: fromPrefab,
          inputAmount: fuelOnly ? fuelPerProduct : 1,
          fuelOnly: Boolean(fuelOnly),
          outputPrefab: toPrefab,
          outputAmount: positiveInteger(conversion.producedItems, 1),
          cookTimeSeconds: Number.isFinite(conversion.cookTime) ? conversion.cookTime : 0,
        })
      }
      const resources = [{ prefabName: fromPrefab, amount: fuelOnly ? fuelPerProduct : 1, amountPerLevel: 0 }]
      if (fuelPrefab && fuelPerProduct > 0 && fuelPrefab !== fromPrefab) {
        resources.push({ prefabName: fuelPrefab, amount: fuelPerProduct, amountPerLevel: 0 })
      }
      const conversionId = `Convert_${record.prefabName}_${fromPrefab}_${toPrefab}`
      if (conversionRecipes.some((existing) => existing.id === conversionId)) continue
      conversionRecipes.push({
        id: conversionId,
        kind: 'conversion',
        outputPrefab: toPrefab,
        outputAmount: positiveInteger(conversion.producedItems, 1),
        stationPrefab: record.prefabName,
        repairStationPrefab: '',
        stationLevel: 1,
        requireOnlyOneIngredient: false,
        qualityResultAmountMultiplier: 1,
        resources,
        ...(fuelPrefab && fuelPerProduct > 0
          ? { fuelPrefab, fuelPerProduct }
          : {}),
      })
    }
  }
  productionStations[record.prefabName.toLowerCase()] = productionDefinition
}

for (const conversion of conversionRecipes) {
  const outputKey = conversion.outputPrefab.toLowerCase()
  craftedByPrefab.set(outputKey, [...(craftedByPrefab.get(outputKey) ?? []), {
    recipeId: conversion.id,
    outputAmount: conversion.outputAmount,
    stationPrefab: conversion.stationPrefab,
    stationLevel: 1,
    resources: conversion.resources.map((resource) => ({
      ...itemSummary(resource.prefabName),
      amount: resource.amount,
      amountPerLevel: 0,
    })),
  }])
  for (const resource of conversion.resources) {
    const resourceKey = resource.prefabName.toLowerCase()
    usedInRecipesByPrefab.set(resourceKey, [
      ...(usedInRecipesByPrefab.get(resourceKey) ?? []),
      {
        ...itemSummary(conversion.outputPrefab),
        amount: resource.amount,
        outputAmount: conversion.outputAmount,
        stationPrefab: conversion.stationPrefab,
      },
    ])
  }
}

const dropSourcesByPrefab = new Map()
for (const character of markerDetails.characters) {
  const sourceName = character.displayName || localize(character.displayNameKey, character.prefabName)
  const drops = character.components.find((component) => component.kind === 'drops')?.data?.drops ?? []
  for (const drop of drops) {
    const prefabName = drop.prefab?.name
    if (!prefabName) continue
    const key = prefabName.toLowerCase()
    dropSourcesByPrefab.set(key, [...(dropSourcesByPrefab.get(key) ?? []), {
      prefabName: character.prefabName,
      name: sourceName,
      boss: Boolean(character.isBoss),
      amountMin: drop.amountMin ?? 1,
      amountMax: drop.amountMax ?? drop.amountMin ?? 1,
      chance: drop.chance ?? 1,
      onePerPlayer: Boolean(drop.onePerPlayer),
    }])
  }
}

const characterNameByPrefab = new Map(
  markerDetails.characters.map((character) => [
    character.prefabName.toLowerCase(),
    character.displayName || localize(character.displayNameKey, character.prefabName),
  ]),
)

const bossPrefabByKey = {
  eikthyr: 'Eikthyr',
  gd_king: 'gd_king',
  bonemass: 'Bonemass',
  dragon: 'Dragon',
  goblinking: 'GoblinKing',
  seekerqueen: 'SeekerQueen',
  fader: 'Fader',
  frozenking: 'FrozenKing',
}

const offeringByBoss = {
  eikthyr: { item: 'TrophyDeer', fallbackCount: 2 },
  gd_king: { item: 'AncientSeed', fallbackCount: 3 },
  bonemass: { item: 'WitheredBone', fallbackCount: 10 },
  dragon: { item: 'DragonEgg', fallbackCount: 3 },
  goblinking: { item: 'GoblinTotem', fallbackCount: 5 },
  fader: { item: 'BellFragment', fallbackCount: 3 },
  frozenking: { item: 'HatefulBlood', fallbackCount: 3 },
}

const extractedOfferingCounts = new Map()
for (const location of locationContents.locations) {
  for (const component of location.semanticComponents ?? []) {
    if (component.kind !== 'boss-altar') continue
    const bossName = component.objectName === 'offeraltar_FrozenKing' ? 'frozenking' : component.data.bossPrefab?.name?.toLowerCase()
    const itemName = component.data.bossItem?.name
    if (bossName && bossPrefabByKey[bossName] && itemName) offeringByBoss[bossName] = { item: itemName, fallbackCount: component.data.bossItems }
    const count = component.data.bossItems
    if (bossName && Number.isFinite(count) && count > 0) {
      extractedOfferingCounts.set(bossName, count)
    }
  }
}

const bossOfferingUseByPrefab = new Map(
  Object.entries(offeringByBoss).map(([bossKey, offering]) => [
    offering.item.toLowerCase(),
    {
      bossName: characterNameByPrefab.get(bossPrefabByKey[bossKey].toLowerCase()) ?? bossPrefabByKey[bossKey],
      count: extractedOfferingCounts.get(bossKey) ?? offering.fallbackCount,
    },
  ]),
)

const forsakenPowerBossByTrophy = new Map([
  ['trophyeikthyr', 'Eikthyr'],
  ['trophytheelder', 'gd_king'],
  ['trophybonemass', 'Bonemass'],
  ['trophydragonqueen', 'Dragon'],
  ['trophygoblinking', 'GoblinKing'],
  ['trophyseekerqueen', 'SeekerQueen'],
  ['trophyfader', 'Fader'],
].map(([itemPrefab, bossPrefab]) => [
  itemPrefab,
  characterNameByPrefab.get(bossPrefab.toLowerCase()) ?? bossPrefab,
]))

const specialUseByPrefab = new Map([
  ['cryptkey', 'sunkenCryptKey'],
])

const itemTypeByValue = {
  0: 'none',
  1: 'material',
  2: 'consumable',
  3: 'oneHandedWeapon',
  4: 'bow',
  5: 'shield',
  6: 'helmet',
  7: 'chestArmor',
  9: 'ammo',
  10: 'customization',
  11: 'legArmor',
  12: 'handArmor',
  13: 'trophy',
  14: 'twoHandedWeapon',
  15: 'torch',
  16: 'miscellaneous',
  17: 'shoulderArmor',
  18: 'utility',
  19: 'tool',
  20: 'polearm',
  21: 'fish',
  22: 'twoHandedWeapon',
  23: 'ammo',
  24: 'trinket',
}

const damageTypeByValue = {
  1: 'blunt',
  2: 'slash',
  4: 'pierce',
  8: 'chop',
  16: 'pickaxe',
  32: 'fire',
  64: 'frost',
  128: 'lightning',
  256: 'poison',
  512: 'spirit',
}

const compactItem = (prefabName) => {
  const item = itemsByPrefab.get(prefabName?.toLowerCase())
  if (!item) {
    return {
      prefabName,
      name: prefabName,
      description: '',
      icon: null,
      type: 'unknown',
    }
  }
  const itemData = item.components.find((component) => component.kind === 'item-drop')?.data?.itemData
  const shared = itemData?.shared ?? {}
  const equipEffectName = shared.equipStatusEffect?.name
  const equipEffect = equipEffectName ? statusEffectsByName.get(equipEffectName) : null
  const setEffectName = shared.setStatusEffect?.name
  const setEffect = setEffectName ? statusEffectsByName.get(setEffectName) : null
  const prefabKey = item.prefabName.toLowerCase()
  const rawDamageModifiers = Array.isArray(shared.damageModifiers)
    ? shared.damageModifiers
    : shared.damageModifiers?.type
      ? [shared.damageModifiers]
      : []
  return {
    prefabName: item.prefabName,
    name: item.displayName || localize(item.displayNameKey, item.prefabName),
    description: item.description || localize(item.descriptionKey),
    icon: itemIcon(item),
    type: itemTypeByValue[shared.itemType] ?? 'unknown',
    weight: shared.weight ?? null,
    maxStack: shared.maxStackSize ?? null,
    value: shared.value ?? null,
    teleportable: shared.teleportable === undefined ? null : Boolean(shared.teleportable),
    maxQuality: shared.maxQuality ?? null,
    questItem: Boolean(shared.questItem),
    displayable: (shared.itemStandOffsets?.length ?? 0) > 0,
    armor: shared.armor ?? null,
    armorPerLevel: shared.armorPerLevel ?? null,
    blockPower: shared.blockPower ?? null,
    blockPowerPerLevel: shared.blockPowerPerLevel ?? null,
    deflectionForce: shared.deflectionForce ?? null,
    deflectionForcePerLevel: shared.deflectionForcePerLevel ?? null,
    timedBlockBonus: shared.timedBlockBonus ?? null,
    damages: shared.damages ?? {},
    damagesPerLevel: shared.damagesPerLevel ?? {},
    attackForce: shared.attackForce ?? null,
    backstabBonus: shared.backstabBonus ?? null,
    toolTier: shared.toolTier ?? null,
    primaryAttackStamina: shared.attack?.attackStamina ?? null,
    primaryAttackEitr: shared.attack?.attackEitr ?? null,
    secondaryAttackStamina: shared.secondaryAttack?.attackStamina ?? null,
    secondaryAttackEitr: shared.secondaryAttack?.attackEitr ?? null,
    food: shared.food ?? null,
    foodStamina: shared.foodStamina ?? null,
    foodEitr: shared.foodEitr ?? null,
    foodDurationSeconds: shared.foodBurnTime ?? null,
    foodRegen: shared.foodRegen ?? null,
    movementModifier: shared.movementModifier ?? null,
    eitrRegenModifier: shared.eitrRegenModifier ?? null,
    useDurability: Boolean(shared.useDurability),
    maxDurability: shared.maxDurability ?? null,
    durabilityPerLevel: shared.durabilityPerLevel ?? null,
    repairable: Boolean(shared.canBeReparied),
    equipmentDamageModifiers: rawDamageModifiers.flatMap((modifier) => {
      const type = damageTypeByValue[modifier.type]
      return type ? [{ type, modifier: modifier.modifier }] : []
    }),
    equipEffect: equipEffect ? {
      name: localize(equipEffect.data?.name, equipEffectName),
      description: localize(equipEffect.data?.tooltip),
    } : null,
    setName: shared.setName || null,
    setSize: shared.setSize || null,
    setEffect: setEffect ? {
      name: localize(setEffect.data?.name, setEffectName),
      description: localize(setEffect.data?.tooltip),
    } : null,
    craftedBy: craftedByPrefab.get(prefabKey) ?? [],
    usedInRecipes: usedInRecipesByPrefab.get(prefabKey) ?? [],
    dropSources: dropSourcesByPrefab.get(prefabKey) ?? [],
    bossOfferingUse: bossOfferingUseByPrefab.get(prefabKey) ?? null,
    forsakenPowerBoss: forsakenPowerBossByTrophy.get(prefabKey) ?? null,
    specialUse: specialUseByPrefab.get(prefabKey) ?? null,
  }
}

const componentData = (record, kind) =>
  record.components.find((component) => component.kind === kind)?.data

const factionByValue = {
  0: 'players',
  1: 'animalsVeg',
  2: 'forestMonsters',
  3: 'undead',
  4: 'demon',
  5: 'mountainMonsters',
  6: 'seaMonsters',
  7: 'plainsMonsters',
  8: 'boss',
  9: 'mistlandsMonsters',
  10: 'dverger',
  11: 'playerSpawned',
  12: 'trainingDummy',
}

const referencedPrefabNames = (...collections) => [...new Set(
  collections
    .flat()
    .map((reference) => reference?.name)
    .filter(Boolean),
)]

const characterPrefabKeys = new Set(markerDetails.characters.map((character) => character.prefabName.toLowerCase()))
const creatureTransitions = extractCreatureTransitions(markerDetails.characters)
const compactCharacters = Object.fromEntries(
  markerDetails.characters.map((character) => {
    const characterData = componentData(character, 'character') ?? {}
    const aiData = componentData(character, 'ai') ?? {}
    const dropsData = componentData(character, 'drops') ?? {}
    const drops = (dropsData.drops ?? []).filter((drop) => !characterPrefabKeys.has(drop.prefab?.name?.toLowerCase())).map((drop) => ({
      ...compactItem(drop.prefab?.name),
      amountMin: drop.amountMin ?? 1,
      amountMax: drop.amountMax ?? drop.amountMin ?? 1,
      chance: drop.chance ?? 1,
      onePerPlayer: Boolean(drop.onePerPlayer),
    }))
    return [character.prefabName.toLowerCase(), {
      prefabName: character.prefabName,
      portrait: character.prefabName.toLowerCase() === 'boar'
        ? `/game-data/character-portraits/${character.prefabName.toLowerCase()}.png`
        : null,
      name: character.displayName || localize(character.displayNameKey, character.prefabName),
      boss: Boolean(character.isBoss),
      health: characterData.health ?? null,
      faction: factionByValue[characterData.faction] ?? 'unknown',
      walkSpeed: characterData.walkSpeed ?? null,
      runSpeed: characterData.runSpeed ?? null,
      canSwim: Boolean(characterData.canSwim),
      staggerWhenBlocked: Boolean(characterData.staggerWhenBlocked),
      alertRange: aiData.alertRange ?? null,
      viewRange: aiData.viewRange ?? null,
      equipment: referencedPrefabNames(
        characterData.defaultItems,
        characterData.randomWeapon,
        characterData.randomArmor,
        characterData.randomShield,
      ),
      damageModifiers: characterData.damageModifiers ?? {},
      drops,
    }]
  }),
)

// Detail panels show the encounter's rewards while drop-source indexing keeps
// each phase's own drops, health and damage profile intact.
for (const key of Object.keys(creatureTransitions)) {
  compactCharacters[key].encounterDrops = collectEncounterDrops(key, compactCharacters, creatureTransitions)
}

const powerByBoss = {
  eikthyr: 'GP_Eikthyr',
  gd_king: 'GP_TheElder',
  bonemass: 'GP_Bonemass',
  dragon: 'GP_Moder',
  goblinking: 'GP_Yagluth',
  seekerqueen: 'GP_Queen',
  fader: 'GP_Fader',
}

const compactPowers = Object.fromEntries(
  Object.entries(powerByBoss).flatMap(([boss, powerName]) => {
    const power = statusEffectsByName.get(powerName)
    if (!power) return []
    return [[boss, {
      name: localize(power.data.name, powerName),
      description: localize(power.data.tooltip),
      durationSeconds: power.data.ttl ?? null,
      cooldownSeconds: power.data.cooldown ?? null,
    }]]
  }),
)

const compactOfferings = Object.fromEntries(
  Object.entries(offeringByBoss).map(([boss, offering]) => [boss, {
    ...compactItem(offering.item),
    count: extractedOfferingCounts.get(boss) ?? offering.fallbackCount,
  }]),
)

const compactTraders = Object.fromEntries(
  markerDetails.traders.map((trader) => {
    const traderData = componentData(trader, 'trader') ?? {}
    return [trader.prefabName.toLowerCase(), {
      prefabName: trader.prefabName,
      name: trader.prefabName.replace(/([a-z])([A-Z])/g, '$1 $2'),
      items: (traderData.items ?? []).filter((entry) => entry.prefab?.name).map((entry) => ({
        ...compactItem(entry.prefab?.name),
        price: entry.price ?? 0,
        stack: entry.stack ?? 1,
        requiredGlobalKey: entry.requiredGlobalKey ?? '',
      })),
      services: (traderData.items ?? []).filter((entry) => !entry.prefab?.name && entry.buyKey).map((entry) => ({
        id: entry.buyKey, name: localize(entry.name, entry.buyKey), description: localize(entry.tooltip),
        price: entry.price ?? 0, requiredGlobalKey: entry.requiredGlobalKey ?? '',
        incrementKey: entry.incrementKey, incrementAmount: entry.incrementAmount,
      })),
    }]
  }),
)

const pieceRecords = markerDetails.pieces ?? []
const pieceDataByPrefab = new Map(
  pieceRecords.flatMap((piece) => {
    const data = piece.components.find((component) => component.kind === 'piece')?.data
    return data ? [[piece.prefabName.toLowerCase(), { prefabName: piece.prefabName, data }]] : []
  }),
)

const pieceDisplayName = (prefabName) => {
  const record = pieceDataByPrefab.get(prefabName?.toLowerCase())
  if (!record) return formatPrefabName(prefabName ?? '')
  return localize(record.data.name, formatPrefabName(record.prefabName))
}

const plannerPieces = []
for (const { prefabName, data } of pieceDataByPrefab.values()) {
  const resources = (data.resources ?? []).filter((resource) => resource.resItem?.name)
  if (!data.enabled || resources.length === 0) continue
  // Food and feast display pieces cost one of the item they display. They would
  // add a self-referencing edge to the recipe graph without adding any plan value.
  if (resources.some((resource) => resource.resItem.name.toLowerCase() === prefabName.toLowerCase())) continue
  plannerPieces.push({
    id: `Piece_${prefabName}`,
    kind: 'piece',
    outputPrefab: prefabName,
    outputAmount: 1,
    stationPrefab: data.craftingStation?.name ?? '',
    repairStationPrefab: '',
    stationLevel: 1,
    requireOnlyOneIngredient: false,
    qualityResultAmountMultiplier: 1,
    resources: resources.map((resource) => ({
      prefabName: resource.resItem.name,
      amount: positiveInteger(resource.amount, 1),
      amountPerLevel: 0,
    })),
  })
}

const pieceIcon = createPieceIconResolver(iconManifest)
const plannerPieceItems = Object.fromEntries(
  plannerPieces.map((piece) => [piece.outputPrefab.toLowerCase(), {
    prefabName: piece.outputPrefab,
    name: pieceDisplayName(piece.outputPrefab),
    icon: pieceIcon(piece.outputPrefab, pieceDataByPrefab.get(piece.outputPrefab.toLowerCase())?.data),
    category: pieceDataByPrefab.get(piece.outputPrefab.toLowerCase())?.data.category ?? 0,
    isUpgrade: Boolean(pieceDataByPrefab.get(piece.outputPrefab.toLowerCase())?.data.isUpgrade),
  }]),
)

// Harvestable world objects: which standing prefab yields which items, whether
// it respawns, and whether picking leaves the ZDO in place (hideWhenPicked) or
// destroys it. Trees chain through their log prefabs and ore deposits chain
// through the fractured stage they spawn when first struck, so the closure of a
// node's yields is computed to a fixed point over those references.
const resourceNodeKindRank = {
  pickable: 0,
  'mine-rock': 1,
  tree: 2,
  'tree-log': 3,
  'pickable-item': 4,
  destructible: 5,
  'drop-on-destroyed': 6,
}
const dropTableItems = (table) => {
  if (!table) return []
  const chance = Number.isFinite(table.dropChance) ? table.dropChance : 1
  return (table.drops ?? []).flatMap((drop) => {
    const prefabName = drop.item?.name
    if (!prefabName) return []
    return [{
      prefabName,
      amountMin: positiveInteger(drop.stackMin, 1),
      amountMax: positiveInteger(drop.stackMax, positiveInteger(drop.stackMin, 1)),
      chance,
    }]
  })
}
const pointerName = (reference) => reference?.name ?? null

const resourceNodeDrafts = new Map()
for (const record of markerDetails.resourceNodes ?? []) {
  const draft = {
    prefabName: record.prefabName,
    kind: null,
    respawnTimeMinutes: 0,
    hideWhenPicked: false,
    minToolTier: 0,
    items: new Map(),
    chainsTo: new Set(),
  }
  const addItems = (entries) => {
    for (const entry of entries) {
      const key = entry.prefabName.toLowerCase()
      const existing = draft.items.get(key)
      if (existing) {
        existing.amountMin += entry.amountMin
        existing.amountMax += entry.amountMax
        existing.chance = Math.max(existing.chance, entry.chance)
      } else {
        draft.items.set(key, { ...entry })
      }
    }
  }
  for (const component of record.components) {
    const data = component.data ?? {}
    if (draft.kind === null ||
      (resourceNodeKindRank[component.kind] ?? 9) < (resourceNodeKindRank[draft.kind] ?? 9)) {
      draft.kind = component.kind
    }
    if (component.kind === 'pickable') {
      const itemPrefab = pointerName(data.itemPrefab)
      if (itemPrefab) {
        addItems([{
          prefabName: itemPrefab,
          amountMin: positiveInteger(data.amount, 1),
          amountMax: positiveInteger(data.amount, 1),
          chance: 1,
        }])
      }
      addItems(dropTableItems(data.extraDrops))
      draft.respawnTimeMinutes = Math.max(
        draft.respawnTimeMinutes,
        Number.isFinite(data.respawnTimeMinutes) ? data.respawnTimeMinutes : 0,
      )
      draft.hideWhenPicked = draft.hideWhenPicked || Boolean(pointerName(data.hideWhenPicked))
    }
    if (component.kind === 'pickable-item') {
      const fixed = pointerName(data.itemPrefab)
      if (fixed) {
        addItems([{
          prefabName: fixed,
          amountMin: positiveInteger(data.stack, 1),
          amountMax: positiveInteger(data.stack, 1),
          chance: 1,
        }])
      }
      for (const random of data.randomItemPrefabs ?? []) {
        const prefabName = pointerName(random.itemPrefab)
        if (!prefabName) continue
        addItems([{
          prefabName,
          amountMin: positiveInteger(random.stackMin, 1),
          amountMax: positiveInteger(random.stackMax, 1),
          chance: 1,
        }])
      }
    }
    if (Number.isFinite(data.minToolTier)) {
      draft.minToolTier = Math.max(draft.minToolTier, Math.round(data.minToolTier))
    }
    if (component.kind === 'mine-rock') addItems(dropTableItems(data.dropItems))
    if (component.kind === 'tree' || component.kind === 'tree-log' || component.kind === 'drop-on-destroyed') {
      addItems(dropTableItems(data.dropWhenDestroyed))
    }
    if (component.kind === 'tree') {
      const logPrefab = pointerName(data.logPrefab)
      if (logPrefab) draft.chainsTo.add(logPrefab.toLowerCase())
    }
    if (component.kind === 'tree-log') {
      const subLog = pointerName(data.subLogPrefab)
      if (subLog) draft.chainsTo.add(subLog.toLowerCase())
    }
    if (component.kind === 'destructible') {
      const spawned = pointerName(data.spawnWhenDestroyed)
      if (spawned) draft.chainsTo.add(spawned.toLowerCase())
    }
  }
  resourceNodeDrafts.set(record.prefabName.toLowerCase(), draft)
}

for (let changed = true; changed;) {
  changed = false
  for (const draft of resourceNodeDrafts.values()) {
    for (const chained of draft.chainsTo) {
      const target = resourceNodeDrafts.get(chained)
      if (!target || target === draft) continue
      if (target.minToolTier > draft.minToolTier) {
        draft.minToolTier = target.minToolTier
        changed = true
      }
      for (const [key, item] of target.items) {
        if (draft.items.has(key)) continue
        draft.items.set(key, { ...item })
        changed = true
      }
    }
  }
}

const plannerResourceNodes = {}
const plannerItemNodes = {}
for (const [key, draft] of resourceNodeDrafts) {
  const items = [...draft.items.values()]
    .sort((first, second) => first.prefabName.localeCompare(second.prefabName))
  if (items.length === 0) continue
  plannerResourceNodes[key] = {
    prefabName: draft.prefabName,
    kind: draft.kind,
    respawnTimeMinutes: draft.respawnTimeMinutes,
    hideWhenPicked: draft.hideWhenPicked,
    minToolTier: draft.minToolTier,
    items,
  }
  for (const item of items) {
    const itemKey = item.prefabName.toLowerCase()
    ;(plannerItemNodes[itemKey] ??= []).push(draft.prefabName)
  }
}
for (const entries of Object.values(plannerItemNodes)) {
  entries.sort((first, second) => first.localeCompare(second))
}

const plannerStations = Object.fromEntries(
  [...new Set([...plannerRecipes, ...plannerPieces, ...conversionRecipes].flatMap((recipe) => [
    recipe.stationPrefab,
    recipe.repairStationPrefab,
  ]))]
    .filter(Boolean)
    .map((stationPrefab) => [stationPrefab.toLowerCase(), {
      prefabName: stationPrefab,
      name: localize(markerDetails.craftingStations?.find((station) => station.prefabName === stationPrefab)?.data?.name, pieceDisplayName(stationPrefab)),
    }]),
)

const locationItemPrefabs = new Set()
const itemLocationCounts = new Map()
const recordItemLocation = (itemPrefab, locationPrefab, kind, chance) => {
  const key = `${itemPrefab.toLowerCase()}|${locationPrefab}|${kind}`
  const existing = itemLocationCounts.get(key)
  if (existing) {
    existing.count += 1
    existing.chance = Math.max(existing.chance, chance)
    return
  }
  itemLocationCounts.set(key, { itemPrefab, locationPrefab, kind, count: 1, chance })
}
const creatureLocationCounts = new Map()
const recordCreatureLocation = (creaturePrefab, locationPrefab) => {
  const key = `${creaturePrefab.toLowerCase()}|${locationPrefab}`
  const existing = creatureLocationCounts.get(key)
  if (existing) {
    existing.count += 1
    return
  }
  creatureLocationCounts.set(key, { creaturePrefab, locationPrefab, count: 1 })
}
for (const location of locationContents.locations) {
  for (const component of location.semanticComponents ?? []) {
    if (component.kind === 'pickable') {
      const prefabName = component.data.itemPrefab?.name
      if (prefabName) {
        locationItemPrefabs.add(prefabName)
        recordItemLocation(prefabName, location.prefabName, 'pickable', 1)
      }
    }
    if (component.kind === 'drop-on-destroyed') {
      const dropTable = component.data.dropWhenDestroyed ?? {}
      const dropChance = Number.isFinite(dropTable.dropChance) ? dropTable.dropChance : 1
      for (const drop of dropTable.drops ?? []) {
        const prefabName = drop.item?.name
        if (!prefabName) continue
        locationItemPrefabs.add(prefabName)
        recordItemLocation(prefabName, location.prefabName, 'destructible', dropChance)
      }
    }
    if (component.kind === 'door') {
      const prefabName = component.data.keyItem?.name
      if (prefabName) locationItemPrefabs.add(prefabName)
    }
    if (component.kind === 'creature-spawner') {
      const prefabName = component.data.creaturePrefab?.name
      if (prefabName) recordCreatureLocation(prefabName, location.prefabName)
    }
  }
}

const plannerItemLocations = {}
for (const entry of itemLocationCounts.values()) {
  const key = entry.itemPrefab.toLowerCase()
  ;(plannerItemLocations[key] ??= []).push({
    locationPrefab: entry.locationPrefab,
    kind: entry.kind,
    count: entry.count,
    chance: entry.chance,
  })
}
for (const entries of Object.values(plannerItemLocations)) {
  entries.sort((first, second) => second.count - first.count ||
    first.locationPrefab.localeCompare(second.locationPrefab))
}

const plannerCreatureLocations = {}
for (const entry of creatureLocationCounts.values()) {
  const key = entry.creaturePrefab.toLowerCase()
  ;(plannerCreatureLocations[key] ??= []).push({
    locationPrefab: entry.locationPrefab,
    count: entry.count,
  })
}
for (const entries of Object.values(plannerCreatureLocations)) {
  entries.sort((first, second) => second.count - first.count ||
    first.locationPrefab.localeCompare(second.locationPrefab))
}

const catalogItemPrefabs = new Set(locationItemPrefabs)
for (const offering of Object.values(compactOfferings)) catalogItemPrefabs.add(offering.prefabName)
for (const character of Object.values(compactCharacters)) {
  for (const drop of character.drops) catalogItemPrefabs.add(drop.prefabName)
}
for (const trader of Object.values(compactTraders)) {
  for (const item of trader.items) catalogItemPrefabs.add(item.prefabName)
}
for (const recipe of [...plannerRecipes, ...conversionRecipes]) {
  catalogItemPrefabs.add(recipe.outputPrefab)
  for (const resource of recipe.resources) catalogItemPrefabs.add(resource.prefabName)
}
for (const piece of plannerPieces) {
  for (const resource of piece.resources) catalogItemPrefabs.add(resource.prefabName)
}
for (const node of Object.values(plannerResourceNodes)) {
  for (const item of node.items) catalogItemPrefabs.add(item.prefabName)
}

// Expand to a fixed point so every craftable item, ingredient, and downstream use
// resolves inside the catalog. A single pass leaves deep crafting chains unresolved.
for (let pending = [...catalogItemPrefabs]; pending.length > 0;) {
  const discovered = []
  for (const prefabName of pending) {
    const item = compactItem(prefabName)
    const linked = [
      ...(item.usedInRecipes ?? []).map((usage) => usage.prefabName),
      ...(item.craftedBy ?? []).flatMap((recipe) => recipe.resources.map((resource) => resource.prefabName)),
    ]
    for (const linkedPrefab of linked) {
      if (!linkedPrefab || catalogItemPrefabs.has(linkedPrefab)) continue
      catalogItemPrefabs.add(linkedPrefab)
      discovered.push(linkedPrefab)
    }
  }
  pending = discovered
}

const compactCatalogItems = Object.fromEntries(
  [...catalogItemPrefabs].map((prefabName) => [prefabName.toLowerCase(), compactItem(prefabName)]),
)

const runtimeLocationSourceOrder = worldRules.runtimeLocationSourceOrder ?? [
  '_ZoneSystem',
  '_LocationList_Ashlands',
  '_LocationList_Mistlands',
  '_LocationList_cp1',
  '_LocationList_MountainCaves',
  '_LocationList_Hildir',
  '_LocationList_DeepNorth',
]
const sourceRank = new Map(
  runtimeLocationSourceOrder.map((source, index) => [source, index]),
)
const orderedWorldLocations = worldRules.locations
  .map((location, index) => ({ location, index }))
  .sort((first, second) =>
    (sourceRank.get(first.location.sourceList) ?? runtimeLocationSourceOrder.length) -
      (sourceRank.get(second.location.sourceList) ?? runtimeLocationSourceOrder.length) ||
    first.index - second.index,
  )
  .map(({ location }) => location)

const contentsByName = new Map(
  locationContents.locations.map((location) => [location.prefabName, location]),
)
const searchDataFor = createLocationSearchData({
  items: compactCatalogItems,
  characters: compactCharacters,
  traders: compactTraders,
  resourceNodes: plannerResourceNodes,
  rooms: readJson('dungeon-search-contents.json').rooms,
  creatureTransitions,
})
const locations = orderedWorldLocations.map((rule, index) => {
  const prefabName = rule.prefabName || rule.name
  return {
    id: `${prefabName}-${index}`,
    prefabName,
    enabled: Boolean(rule.enable),
    placement: rule,
    contents: contentsByName.get(prefabName) ?? null,
  }
})

// Reuse the same acquisition links for planner handoffs and map/database views.
// A later boss phase inherits only the locations of a verified spawn chain.
for (const location of locations) {
  if (!location.enabled) continue
  for (const source of searchDataFor(location.contents).itemSources) {
    if (source.kind !== 'boss' && source.kind !== 'creature') continue
    const entries = plannerCreatureLocations[source.sourcePrefab.toLowerCase()] ??= []
    if (!entries.some((entry) => entry.locationPrefab === location.prefabName)) {
      entries.push({ locationPrefab: location.prefabName, count: 1 })
    }
  }
}

for (const location of locations) {
  writeJson(
    path.join('location-details', `${toKebabCase(location.id)}.json`),
    { schemaVersion: 1, location },
  )
}

writeJson('data-summary.json', {
  schemaVersion: 1,
  source: assetIndex.source,
  extraction: extractionSummary,
  locations: {
    rules: locations.length,
    active: locations.filter((location) => location.enabled).length,
    withContents: locations.filter((location) => location.contents).length,
  },
  languages: localization.languages,
})
writeJson('locations.json', {
  schemaVersion: 1,
  locations: locations.map((location) => ({
    id: location.id,
    prefabName: location.prefabName,
    enabled: location.enabled,
    detailPath: `/game-data/location-details/${toKebabCase(location.id)}.json`,
  })),
})
writeJson('location-index.json', {
  schemaVersion: 1,
  locations: locations.map((location) => ({
    id: location.id,
    prefabName: location.prefabName,
    enabled: location.enabled,
    detailPath: `/game-data/location-details/${toKebabCase(location.id)}.json`,
    placement: location.placement,
    ...searchDataFor(location.contents),
    contents: location.contents
      ? {
          hierarchyObjectCount: location.contents.hierarchyObjectCount,
          componentKindCounts: location.contents.componentKindCounts,
          semanticComponents: location.contents.semanticComponents.filter((component) =>
            ['boss-altar', 'container', 'creature-spawner', 'dungeon', 'pickable', 'runestone', 'spawn-area', 'spawner'].includes(component.kind),
          ),
          referencedAssets: location.contents.referencedAssets,
        }
      : null,
  })),
})
writeJson('characters.json', {
  schemaVersion: 1,
  characters: markerDetails.characters,
})
writeJson('marker-intelligence.json', {
  schemaVersion: 1,
  characters: compactCharacters,
  items: compactCatalogItems,
  bossPowers: compactPowers,
  bossOfferings: compactOfferings,
  traders: compactTraders,
})
writeJson('planner-catalog.json', {
  schemaVersion: 1,
  gameBuild: assetIndex.source?.manifests?.[0]?.sha256 ?? assetIndex.source?.installDirectory ?? 'unknown',
  recipes: [...plannerRecipes, ...conversionRecipes, ...plannerPieces],
  pieceItems: plannerPieceItems,
  stations: plannerStations,
  itemLocations: plannerItemLocations,
  creatureLocations: plannerCreatureLocations,
  resourceNodes: plannerResourceNodes,
  itemNodes: plannerItemNodes,
  unresolvedRecipes,
})
writeJson('production-catalog.json', {
  schemaVersion: 1,
  gameBuild: assetIndex.source?.manifests?.[0]?.sha256 ?? assetIndex.source?.installDirectory ?? 'unknown',
  stations: Object.fromEntries(Object.entries(productionStations).map(([key, station]) => [key, {
    ...station,
    icon: plannerPieceItems[key]?.icon ?? pieceIcon(station.prefabName, pieceDataByPrefab.get(key)?.data),
  }])) ,
})
writeJson('items.json', { schemaVersion: 1, items: markerDetails.items })
writeJson('recipes.json', { schemaVersion: 1, recipes: markerDetails.recipes })
writeJson('status-effects.json', {
  schemaVersion: 1,
  statusEffects: markerDetails.statusEffects,
})
writeJson('pieces.json', { schemaVersion: 1, pieces: markerDetails.pieces })
writeJson('traders.json', { schemaVersion: 1, traders: markerDetails.traders })
writeJson('prefab-types.json', {
  schemaVersion: 1,
  prefabs: markerDetails.typedPrefabs,
})
writeJson('world-features.json', {
  schemaVersion: 1,
  biomes: worldRules.biomeFlags,
  zoneSystem: worldRules.zoneSystem,
  events: markerDetails.events,
  vegetation: markerDetails.vegetation,
  environments: worldRules.environments,
  altBiomes: worldRules.altBiomes ?? [],
})
writeJson('localization.json', localization)
writeJson('seed-resource-rules.json', {
  schemaVersion: 1,
  rules: buildSeedResourceRules(worldRules.vegetation, readJson('vegetation-prefabs.json').prefabs, plannerResourceNodes),
})

console.log(`Built runtime map data in ${outputDirectory}.`)

writeJson('biome-rules.json', { schemaVersion: 1, altBiomes: worldRules.altBiomes ?? [] })

// Remove only obsolete generated detail documents after writing the new index.
// Rule indices shift across game releases; leaving old files bloats the package.
const detailsDirectory = path.resolve(outputDirectory, 'location-details')
const currentDetails = new Set(locations.map((location) => `${toKebabCase(location.id)}.json`))
for (const filename of fs.readdirSync(detailsDirectory)) {
  const target = path.resolve(detailsDirectory, filename)
  if (path.dirname(target) !== detailsDirectory) throw new Error('Invalid generated detail path')
  if (/^[a-z0-9-]+-\d+\.json$/.test(filename) && !currentDetails.has(filename)) fs.unlinkSync(target)
}
