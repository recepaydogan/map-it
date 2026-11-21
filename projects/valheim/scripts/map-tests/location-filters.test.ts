import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyLocationType, LOCATION_FILTER_GROUPS, locationMatchesFilters } from '../../src/lib/location-filters.ts'
import { getLocationPanelFeatures, locationNameLabelKey } from '../../src/lib/location-presentation.ts'
import { groupNearbyMarkers } from '../../src/lib/marker-layout.ts'
import type { LocationRecord } from '../../src/types/game-data.ts'

const location = (prefabName: string): LocationRecord => ({
  id: prefabName,
  prefabName,
  enabled: true,
  placement: {},
  contents: null,
})

const expectCategory = (category: string, prefabNames: readonly string[]) => {
  for (const prefabName of prefabNames) {
    assert.equal(classifyLocationType(location(prefabName)), category, prefabName)
  }
}

test('separates camps from settlements, structures, and ruins', () => {
  expectCategory('type:camps', [
    'GoblinCamp1',
    'Greydwarf_camp1',
  ])
  expectCategory('type:settlements', [
    'WoodVillage1',
    'WoodFarm1',
    'Mistlands_Harbour1',
  ])
  expectCategory('type:structures', [
    'CharredFortress',
    'Fort1',
    'DevHouse1',
    'StoneTower1',
    'SwampHut1',
    'StartTemple',
    'Mistlands_Excavation1',
    'Mistlands_GuardTower1_new',
    'Mistlands_Lighthouse1_new',
    'Mistlands_RoadPost1',
  ])
  expectCategory('type:ruins', [
    'FortressRuins',
    'CharredTowerRuins1',
    'StoneTowerRuins03',
    'Mistlands_GuardTower1_ruined_new',
    'Grave1',
    'ShipWreck01',
    'Dolmen01',
    'StoneCircle',
  ])
})

test('Infested Mine entrances use the game dungeon group and display name', () => {
  for (const prefabName of ['Mistlands_DvergrTownEntrance1', 'Mistlands_DvergrTownEntrance2']) {
    const entrance = { ...location(prefabName), placement: { group: 'DvergrDungeon' } }
    assert.equal(classifyLocationType(entrance), 'type:dungeons')
    assert.equal(locationMatchesFilters(entrance, new Set(['type:dungeons'])), true)
    assert.equal(locationMatchesFilters(entrance, new Set(['type:settlements'])), false)
    assert.equal(locationNameLabelKey(prefabName), 'map.locationNames.infestedMine')
  }
})

test('keeps the four place categories under one filter group', () => {
  const group = LOCATION_FILTER_GROUPS.find((candidate) => candidate.key === 'settlements-and-structures')
  assert.deepEqual(group?.filters.map((filter) => filter.key), [
    'type:camps',
    'type:settlements',
    'type:structures',
    'type:ruins',
  ])
})

test('classifies the Bog Witch camp with NPC traders', () => {
  const bogWitch = location('BogWitch_Camp')
  assert.equal(classifyLocationType(bogWitch), 'type:traders')
  const npcs = LOCATION_FILTER_GROUPS.find((group) => group.key === 'npcs')
  assert.ok(npcs?.filters.some((filter) => filter.key === classifyLocationType(bogWitch)))
})

test('keeps Hildir\'s Sealed Tower and Frost Troll remains out of the wrong groups', () => {
  assert.equal(classifyLocationType(location('Hildir_camp')), 'type:traders')
  assert.equal(classifyLocationType(location('Hildir_plainsfortress')), 'type:dungeons')
  assert.equal(classifyLocationType(location('DN_gammeltrollFrac01')), 'type:natural')
  assert.equal(classifyLocationType(location('DN_gammeltrollFrac02')), 'type:natural')
})

test('never mixes marker categories in proximity groups', () => {
  const groups = groupNearbyMarkers([
    { id: 'camp', category: 'type:camps', x: 0.5, y: 0.5 },
    { id: 'ruin', category: 'type:ruins', x: 0.5, y: 0.5 },
    { id: 'structure', category: 'type:structures', x: 0.501, y: 0.501 },
  ], 0.01)

  assert.equal(groups.length, 3)
  assert.ok(groups.every((group) => new Set(group.members.map((member) => member.category)).size === 1))
})

test('does not repeat a lore location as its own runestone feature', () => {
  const runestone: LocationRecord = {
    ...location('Runestone_Boars'),
    contents: {
      hierarchyObjectCount: 2,
      componentKindCounts: { runestone: 1, 'creature-spawner': 1 },
      semanticComponents: [
        {
          kind: 'runestone',
          objectName: 'RuneStone_Boars',
          objectPath: 'Runestone_Boars/RuneStone_Boars',
          data: { showMap: 0 },
        },
        {
          kind: 'creature-spawner',
          objectName: 'Spawner_Boar',
          objectPath: 'Runestone_Boars/Spawner_Boar',
          data: { creaturePrefab: { name: 'Boar' }, spawnAtDay: 1, spawnAtNight: 1 },
        },
      ],
      referencedAssets: [],
    },
  }

  assert.deepEqual(getLocationPanelFeatures(runestone).map((feature) => feature.kind), ['creature'])
})

test('Deep North locations distinguish the boss, dungeons and memorial', () => {
  expectCategory('type:bosses', ['DN_Bossroom'])
  expectCategory('type:dungeons', ['TheHole01', 'TheDarkestHole', 'MorkBorg', 'BearCave'])
  expectCategory('type:lore', ['NorthMemorialPlace'])
  expectCategory('type:structures', ['AncientUpgradeStation', 'DN_hut01'])
  expectCategory('type:ruins', ['FrozenShip01_DN', 'ShipSetting02'])
  const memorial = { ...location('NorthMemorialPlace'), contents: { hierarchyObjectCount: 1, semanticComponents: [], referencedAssets: [], componentKindCounts: { 'boss-altar': 1 } } } as LocationRecord
  assert.equal(classifyLocationType(memorial), 'type:lore')
})
