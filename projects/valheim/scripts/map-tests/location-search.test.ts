import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import { createLocationSearchTerms } from '../location-search-index.mjs'
import { collectEncounterDrops, extractCreatureTransitions } from '../creature-transitions.mjs'
import { buildLocationSearchIndex, matchLocationSearch } from '../../src/lib/location-search.ts'
import type { LocationRecord } from '../../src/types/game-data.ts'
import { buildItemAcquisitionCatalog, itemAcquisitionSources, itemSourceMapCount, matchItemLocationSearch } from '../../src/lib/item-acquisition.ts'
import { buildRecipeGraph } from '../../src/lib/crafting/build-recipe-graph.ts'
import type { MarkerIntelligence } from '../../src/types/marker-intelligence.ts'
import { locationGenerationRules } from '../../src/lib/valheim/location-generation-rules.mjs'

const location = (id: string, terms: string[], enabled = true): LocationRecord => ({
  id, prefabName: id, enabled, placement: {}, contents: null, searchTerms: terms,
})
const indexFor = (entries: LocationRecord[]) => buildLocationSearchIndex(entries, (entry) => entry.prefabName)

test('search uses both display names and separator-insensitive prefab names', () => {
  const index = indexFor([location('trader', ['Megingjord', 'BeltStrength']), location('cave', ['Troll Hide'])])
  for (const query of ['  MEGINGJORD ', 'belt strength', 'belt-strength', 'Bélt_Strength']) {
    assert.deepEqual(matchLocationSearch(index, query), new Set(['trader']), query)
  }
  assert.deepEqual(matchLocationSearch(index, 'trollhide'), new Set(['cave']))
})

test('typos are rescued only when strict matching found no locations', () => {
  const index = indexFor([location('trader', ['Megingjord']), location('needle', ['Needle']), location('near', ['Noodle'])])
  assert.deepEqual(matchLocationSearch(index, 'megingjrod'), new Set(['trader']))
  assert.deepEqual(matchLocationSearch(index, 'megingj'), new Set(['trader']))
  assert.deepEqual(matchLocationSearch(index, 'needle'), new Set(['needle']))
  assert.deepEqual(matchLocationSearch(index, 'qq'), new Set())
  assert.deepEqual(matchLocationSearch(index, 'no such material xyz'), new Set())
})

test('clearing search restores category filtering and disabled locations stay excluded', () => {
  const index = indexFor([location('active', ['Amber']), location('disabled', ['Amber'], false)])
  assert.deepEqual(matchLocationSearch(index, 'amber'), new Set(['active']))
  for (const query of ['', '  ', ' - _ ']) assert.equal(matchLocationSearch(index, query), null)
})

test('existing names and contained-object search still work without new catalog fields', () => {
  const entry = location('legacy', [])
  delete entry.searchTerms
  entry.contents = {
    hierarchyObjectCount: 1, componentKindCounts: {}, referencedAssets: [],
    semanticComponents: [{ kind: 'pickable', objectName: 'Pickable_Mushroom (3)', objectPath: '', data: {} }],
  }
  const index = buildLocationSearchIndex([entry], () => 'Old Ruin')
  assert.deepEqual(matchLocationSearch(index, 'old ruin'), new Set(['legacy']))
  assert.deepEqual(matchLocationSearch(index, 'mushroom'), new Set(['legacy']))
})

const component = (kind: string, data: object, objectName = '') => ({ kind, data, objectName })
const pointer = (name: string) => ({ name })
const table = (name: string, chance = 1) => ({ dropChance: chance, dropMax: 1, drops: [{ item: pointer(name), stackMax: 1 }] })

test('source index follows sales, loot, drops, harvests and mining without indexing costs', () => {
  const termsFor = createLocationSearchTerms({
    items: { belt: { name: 'Magic Belt' } },
    traders: { vendor: { prefabName: 'Vendor', name: 'The Trader', items: [{ prefabName: 'Belt', currencyPrefab: 'Currency' }] } },
    characters: { boss: { name: 'The Boss', drops: [{ prefabName: 'BossDrop', chance: 1 }, { prefabName: 'Impossible', chance: 0 }] } },
    resourceNodes: { rock: { items: [{ prefabName: 'Ore', chance: 1, amountMax: 4 }] } },
  })
  const terms = termsFor({
    referencedAssets: [{ name: 'vendor' }, { name: 'rock' }],
    semanticComponents: [
      component('other', { width: 4, height: 2, defaultItems: table('ChestLoot') }),
      component('pickable', { itemPrefab: pointer('Berry'), extraDrops: table('Bonus') }),
      component('pickable-item', { randomItemPrefabs: [{ itemPrefab: pointer('RandomLoot') }] }),
      component('drop-on-destroyed', { dropWhenDestroyed: table('BrokenLoot') }),
      component('drop-on-destroyed', { dropWhenDestroyed: table('NeverDrops', 0) }),
      component('boss-altar', { bossPrefab: pointer('Boss'), bossItem: pointer('Offering') }),
      component('door', { keyItem: pointer('Key') }),
    ],
  })
  for (const term of ['Belt', 'Magic Belt', 'ChestLoot', 'BossDrop', 'Berry', 'Bonus', 'RandomLoot', 'BrokenLoot', 'Ore']) {
    assert.ok(terms.includes(term), term)
  }
  for (const term of ['Currency', 'Offering', 'Key', 'Impossible', 'NeverDrops']) assert.ok(!terms.includes(term), term)
})

test('dungeon source links use enabled room themes, not other dungeons in the same biome', () => {
  const termsFor = createLocationSearchTerms({
    items: {}, characters: {}, traders: {}, resourceNodes: {},
    rooms: [
      { themes: 8, semanticComponents: [component('container', { defaultItems: table('Core') })] },
      { themes: 2, semanticComponents: [component('container', { defaultItems: table('ScrapIron') })] },
      { themes: 8, enabled: false, semanticComponents: [component('container', { defaultItems: table('DisabledLoot') })] },
    ],
  })
  const terms = termsFor({ semanticComponents: [component('other', { themes: 8, maxRooms: 20 })] })
  assert.deepEqual(terms, ['Core'])
})

const runtime = JSON.parse(fs.readFileSync(new URL('../../public/game-data/location-index.json', import.meta.url), 'utf8')) as { locations: LocationRecord[] }
const runtimeIndex = indexFor(runtime.locations)
const prefabsFor = (query: string) => {
  const ids = matchLocationSearch(runtimeIndex, query)
  return runtime.locations.filter((entry) => ids?.has(entry.id)).map((entry) => entry.prefabName)
}

test('shipped game data connects real items to traders, creatures, boss rewards and dungeons', () => {
  const cases: Array<[string, string]> = [
    ['Megingjord', 'Vendor_BlackForest'], ['megingjrod', 'Vendor_BlackForest'],
    ['Troll Hide', 'TrollCave02'], ['Amber', 'AbandonedLogCabin02'],
    ['Amber', 'Crypt2'], ['surtling-core', 'Crypt2'], ['Surtling Core', 'FireHole'],
    ['Swamp Key', 'GDKing'], ['Dragon Tear', 'Dragonqueen'],
    ['Black Core', 'Mistlands_DvergrTownEntrance1'], ['Barley', 'GoblinCamp2'],
  ]
  for (const [query, prefab] of cases) assert.ok(prefabsFor(query).includes(prefab), `${query} -> ${prefab}`)
  assert.ok(!prefabsFor('Swamp Key').includes('SunkenCrypt4'), 'a locked door is not a source of its key')
  assert.ok(!prefabsFor('Megingjord').includes('Hildir_camp'), 'traders must retain their own inventories')
})

const intelligence = JSON.parse(fs.readFileSync(new URL('../../public/game-data/marker-intelligence.json', import.meta.url), 'utf8')) as MarkerIntelligence
const planner = JSON.parse(fs.readFileSync(new URL('../../public/game-data/planner-catalog.json', import.meta.url), 'utf8'))
const graph = buildRecipeGraph(planner, intelligence.items)
const acquisition = buildItemAcquisitionCatalog(runtime.locations, graph, intelligence)

test('detail rewards include later phases without changing first-phase combat or source drops', () => {
  const kall = intelligence.characters.frozenking
  assert.equal(kall.health, 10000)
  assert.deepEqual(kall.drops, [])
  assert.deepEqual(kall.encounterDrops?.map((drop) => [drop.name, drop.amountMin, drop.amountMax, drop.chance]), [
    ['Sacrificial Blood', 1, 1, 1], ['Crown Jewel', 1, 1, 1],
  ])
  assert.ok(intelligence.characters.goblinbrutebros.encounterDrops?.some((drop) => drop.name === "Hildir's Bronze Chest"))
  assert.equal(intelligence.characters.eikthyr.encounterDrops, undefined)
  const reward = { amountMin: 1, amountMax: 2, chance: 0.5 }
  assert.deepEqual(collectEncounterDrops('first', {
    first: { drops: [] }, second: { drops: [reward] },
  }, { first: ['second', 'second'], second: ['first'] }), [reward])
})

test('boss phases and spawned combatants inherit their verified encounter locations', () => {
  for (const [itemKey, character, location] of [
    ['frozenkingdrop', 'FrozenKing_p3', 'DN_Bossroom-185'],
    ['crownjewel', 'FrozenKing_p3', 'DN_Bossroom-185'],
    ['chest_hildir3', 'GoblinShaman_Hildir', 'Hildir_plainsfortress-159'],
  ]) {
    const item = intelligence.items[itemKey]
    assert.ok(item, itemKey)
    const source = itemAcquisitionSources(item, acquisition).find((entry) => entry.prefabName === character)
    assert.ok(source?.locationIds.includes(location), `${character} -> ${location}`)
    assert.ok(matchItemLocationSearch(acquisition, runtimeIndex, item.name)?.has(location), item.name)
    assert.ok(graph.creatureLocations.get(character.toLowerCase())?.some((entry) => entry.locationPrefab === location.replace(/-\d+$/, '')))
  }
  // Raid-only variants and unverified legacy bosses must not borrow locations.
  for (const prefab of ['Skeleton_Hildir_nochest', 'Fenring_Cultist_Hildir_nochest', 'GoblinBruteBros_nochest', 'GoblinShaman_Hildir_nochest', 'Hive', 'TheHive']) {
    for (const drop of intelligence.characters[prefab.toLowerCase()].drops) {
      const sources = itemAcquisitionSources(intelligence.items[drop.prefabName.toLowerCase()], acquisition)
      assert.ok(sources.filter((source) => source.prefabName === prefab).every((source) => !source.locationIds.length), prefab)
    }
  }
})

test('transition extraction ignores disabled effects, equipment, empty drops and similar names', () => {
  const raw = (prefabName: string, components: object[] = []) => ({ prefabName, components })
  const transitions = extractCreatureTransitions([
    raw('Phase1', [component('character', {
      deathEffects: { effectPrefabs: [{ enabled: 1, prefab: pointer('Phase2') }, { enabled: 0, prefab: pointer('Disabled') }] },
      defaultItems: [pointer('Equipment')],
    })]),
    raw('Phase2', [component('drops', { drops: [
      { prefab: pointer('Phase3'), chance: 1, amountMax: 1 },
      { prefab: pointer('Disabled'), chance: 0, amountMax: 1 },
      { prefab: pointer('Empty'), chance: 1, amountMax: 0 },
    ] })]),
    raw('Phase3', [component('character', { deathEffects: { effectPrefabs: [{ enabled: 1, prefab: pointer('Phase1') }] } })]),
    raw('Disabled'), raw('Empty'), raw('Equipment'), raw('Phase1_nochest'),
  ])
  assert.deepEqual(transitions, { phase1: ['Phase2'], phase2: ['Phase3'], phase3: ['Phase1'] })
  const termsFor = createLocationSearchTerms({ items: {}, traders: {}, resourceNodes: {}, creatureTransitions: transitions,
    characters: {
      phase1: { prefabName: 'Phase1', drops: [] },
      phase2: { prefabName: 'Phase2', drops: [{ prefabName: 'Phase3', chance: 1 }] },
      phase3: { prefabName: 'Phase3', drops: [{ prefabName: 'Reward', chance: 1 }] },
    },
  })
  const terms = termsFor({ semanticComponents: [component('boss-altar', { bossPrefab: pointer('Phase1') })] })
  assert.ok(terms.includes('Reward'))
  assert.ok(!terms.includes('Disabled'))
  assert.ok(!terms.includes('Phase1_nochest'))
})

test('shared item details preserve shop price, inventory conditions and map links', () => {
  const sources = itemAcquisitionSources(intelligence.items.beltstrength, acquisition)
  const haldor = sources.find((source) => source.kind === 'trader')!
  assert.equal(haldor.name, 'Haldor')
  assert.equal(haldor.price, 950)
  assert.ok(haldor.locationIds.includes('Vendor_BlackForest-84'))
  const hildirItem = intelligence.traders.hildir.items.find((item) => item.requiredGlobalKey)!
  const hildir = itemAcquisitionSources(hildirItem, acquisition).find((source) => source.kind === 'trader' && source.prefabName === 'Hildir')!
  assert.equal(hildir.price, hildirItem.price)
  assert.equal(hildir.requiredGlobalKey, hildirItem.requiredGlobalKey)
})

test('drop, pickup, chest loot, destructible and conversion sources remain distinct', () => {
  const core = itemAcquisitionSources(intelligence.items.surtlingcore, acquisition)
  assert.ok(core.some((source) => source.kind === 'creature' && source.name === 'Surtling' && source.chance! > 0))
  assert.ok(core.some((source) => source.kind === 'locationPickable' && source.prefabName === 'Crypt2'))
  assert.ok(core.some((source) => source.kind === 'locationDestructible'))
  const amber = itemAcquisitionSources(intelligence.items.amber, acquisition)
  assert.ok(amber.some((source) => source.kind === 'locationLoot' && source.prefabName === 'Crypt2'))
  assert.ok(itemAcquisitionSources(intelligence.items.blackmetal, acquisition).some((source) => source.kind === 'conversion' && source.inputSummary?.length))
})

test('known off-map sources stay visible without a loaded world or any location coordinates', () => {
  const emptyWorld = buildItemAcquisitionCatalog([], graph, intelligence)
  const trader = itemAcquisitionSources(intelligence.items.beltstrength, emptyWorld)[0]
  assert.equal(trader.name, 'Haldor')
  assert.deepEqual(trader.locationIds, [])
  assert.ok(itemAcquisitionSources(intelligence.items.trollhide, emptyWorld).some((source) => source.kind === 'creature'))
  assert.ok(itemAcquisitionSources(intelligence.items.copperore, emptyWorld).some((source) => source.kind === 'resource' && source.amountMax! > 0))
})

test('every indexed acquisition also participates in map text search', () => {
  for (const entry of runtime.locations) {
    for (const source of entry.itemSources ?? []) assert.ok(entry.searchTerms?.includes(source.itemPrefab), `${entry.prefabName}: ${source.itemPrefab}`)
  }
})

test('search metadata cannot invalidate the generation cache, but placement changes must', () => {
  const entry = location('chest', ['Amber'])
  const changedText = { ...entry, searchTerms: ['Ruby'], detailPath: '/other.json' }
  assert.deepEqual(locationGenerationRules([entry]), locationGenerationRules([changedText]))
  assert.notDeepEqual(locationGenerationRules([entry]), locationGenerationRules([{ ...entry, placement: { quantity: 50 } }]))
})

test('legacy resource links cannot leak disabled developer locations into item details', () => {
  const disabled = runtime.locations.find((entry) => entry.prefabName === 'DevSoundTest')!
  assert.equal(disabled.enabled, false)
  const sources = itemAcquisitionSources(intelligence.items.finewood, acquisition)
  assert.ok(!sources.some((source) => source.prefabName === 'DevSoundTest'))
  assert.ok(sources.some((source) => source.kind === 'locationDestructible'))
  assert.ok(sources.filter((source) => source.kind.startsWith('location')).every((source) => source.locationIds.length > 0))
})

test('Arbalest recipes remain in the database model but are not map destinations', () => {
  const item = intelligence.items.crossbowarbalest
  const sources = itemAcquisitionSources(item, acquisition)
  assert.ok(sources.some((source) => source.name === 'Black Forge'))
  assert.ok(sources.some((source) => source.name === 'Forge of Potential'))
  const counts = new Map(runtime.locations.map((entry) => [entry.id, 5]))
  assert.deepEqual(sources.filter((source) => itemSourceMapCount(item, source, counts) > 0), [])
  const haldor = itemAcquisitionSources(intelligence.items.beltstrength, acquisition)[0]
  assert.equal(itemSourceMapCount(intelligence.items.beltstrength, haldor, counts), 5)
  assert.equal(itemSourceMapCount(intelligence.items.beltstrength, haldor, new Map()), 0)
})

test('map destinations count only collectable nodes of the selected resource source', () => {
  const item = intelligence.items.copperore
  const source = itemAcquisitionSources(item, acquisition).find((entry) => entry.kind === 'resource')!
  const resourceIndex = { nodesForItem: () => [
    { nodePrefab: source.prefabName, x: 1, z: 2, status: 'present' as const, respawnRemainingGameMinutes: null },
    { nodePrefab: source.prefabName, x: 3, z: 4, status: 'depleted' as const, respawnRemainingGameMinutes: null },
    { nodePrefab: 'OtherRock', x: 5, z: 6, status: 'present' as const, respawnRemainingGameMinutes: null },
  ] }
  assert.equal(itemSourceMapCount(item, source, undefined, resourceIndex), 1)
})

test('item typos do not select unrelated scenery when the item has no map source', () => {
  assert.deepEqual(matchItemLocationSearch(acquisition, runtimeIndex, 'arbalet'), new Set())
  assert.deepEqual(matchItemLocationSearch(acquisition, runtimeIndex, 'Arbalest'), new Set())
  assert.ok(matchItemLocationSearch(acquisition, runtimeIndex, 'megingjrod')?.has('Vendor_BlackForest-84'))
  assert.equal(matchItemLocationSearch(acquisition, runtimeIndex, '  '), null)
  assert.ok(matchItemLocationSearch(acquisition, runtimeIndex, 'crypt2')?.has('Crypt2-18'))
})
