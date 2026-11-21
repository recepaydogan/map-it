import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPortalRoutes,
  clusterStationSummaries,
  portalExit,
  summarizeStation,
  summarizeStations,
} from '../../src/features/base-operations/operations-model.ts'
import type { SavedPortal, SavedProductionStation } from '../../src/types/world-save.ts'

const portal = (tag: string, hash: number | null, type: number | null): SavedPortal => ({
  prefabName: 'portal_wood', x: 0, y: 0, height: 0, yaw: 0, creator: '1', author: '',
  tag, connectionHash: hash, connectionType: type,
})

test('portal exit follows the destination portal yaw and sits one metre in front', () => {
  assert.deepEqual(portalExit({ ...portal('Home', 41, 1), x: 50, y: 70, yaw: 0 }), {
    x: 50, z: 71, heading: 0, direction: 'N',
  })
  const eastExit = portalExit({ ...portal('Home', 41, 1), x: 50, y: 70, yaw: 90 })
  assert.ok(Math.abs(eastExit.x - 51) < 1e-10)
  assert.ok(Math.abs(eastExit.z - 70) < 1e-10)
  assert.equal(eastExit.direction, 'E')
})

const station = (values: Partial<SavedProductionStation>): SavedProductionStation => ({
  prefabName: 'smelter', x: 0, y: 0, height: 0, creator: '1', fuel: 0,
  queued: 0, level: 0, productProgress: 0, processedOutputPrefab: '', processedOutputAmount: 0,
  content: '', bakeTimer: 0,
  startTimeTicks: 0, lastTimeTicks: 0, queueItems: [], ...values,
  slotStatuses: [], slotCookTimes: [],
})

const productionCatalog = {
  smelter: {
    prefabName: 'smelter', maxInput: 10, maxFuel: 20, secondsPerProduct: 30,
    fuelPrefab: 'Coal', fuelPerProduct: 2, fermentationSeconds: 0,
    conversions: [{ inputPrefab: 'CopperOre', outputPrefab: 'Copper', outputAmount: 1, cookTimeSeconds: 0 }],
  },
  fermenter: {
    prefabName: 'fermenter', maxInput: 0, maxFuel: 0, secondsPerProduct: 0,
    fuelPrefab: '', fuelPerProduct: 0, fermentationSeconds: 2400,
    conversions: [{ inputPrefab: 'BarleyWineBase', outputPrefab: 'BarleyWine', outputAmount: 6, cookTimeSeconds: 0 }],
  },
}

test('portal routes pair matching connection hashes and surface unlinked endpoints first', () => {
  const routes = buildPortalRoutes([
    portal('Home', 41, 1),
    portal('Swamp', 41, 16),
    portal('Plains', null, null),
  ])
  assert.equal(routes.length, 2)
  assert.equal(routes[0].connected, false)
  assert.equal(routes[0].endpoints[0].tag, 'Plains')
  assert.equal(routes[1].connected, true)
  assert.equal(routes[1].endpoints.length, 2)
})

test('station status prioritizes ready output and stalled smelters', () => {
  assert.equal(summarizeStation(station({ prefabName: 'piece_beehive', level: 3 })).status, 'ready')
  assert.equal(summarizeStation(station({ queued: 5, fuel: 0 })).status, 'attention')
  assert.equal(summarizeStation(station({ queued: 5, fuel: 8 })).status, 'active')
  assert.equal(summarizeStation(station({ prefabName: 'fermenter', content: 'BarleyWine' })).detail, 'fermenting')
})

test('fuel alerts match the production pieces that actually consume separate fuel', () => {
  assert.equal(summarizeStation(station({ prefabName: 'charcoal_kiln', queued: 5 })).status, 'active')
  assert.equal(summarizeStation(station({ prefabName: 'eitrrefinery', queued: 5 })).detail, 'needsFuel')
  assert.equal(summarizeStation(station({ prefabName: 'piece_oven', queueItems: ['BreadDough'] })).detail, 'needsFuel')
})

test('fermenter becomes collectable after the game duration has elapsed', () => {
  const startTimeTicks = 50_000_000
  const fermenter = station({ prefabName: 'fermenter', content: 'BarleyWine', startTimeTicks })
  assert.equal(summarizeStation(fermenter, startTimeTicks + 2_399 * 10_000_000).detail, 'fermenting')
  assert.equal(summarizeStation(fermenter, startTimeTicks + 2_400 * 10_000_000).detail, 'collectOutput')
})

test('station intelligence reports exact passive, stacked and fermenter output', () => {
  const hive = summarizeStation(station({ prefabName: 'piece_beehive', level: 3 }))
  assert.equal(hive.readyOutputAmount, 3)
  assert.equal(hive.readyOutputPrefab, 'Honey')

  const windmill = summarizeStation(station({
    prefabName: 'windmill', processedOutputPrefab: 'BarleyFlour', processedOutputAmount: 12,
  }))
  assert.equal(windmill.readyOutputAmount, 12)
  assert.equal(windmill.readyOutputPrefab, 'BarleyFlour')

  const startTimeTicks = 50_000_000
  const fermenter = station({ prefabName: 'fermenter', content: 'BarleyWineBase', startTimeTicks })
  const fermenting = summarizeStation(fermenter, startTimeTicks + 2_100 * 10_000_000, productionCatalog)
  assert.equal(fermenting.remainingSeconds, 300)
  const ready = summarizeStation(fermenter, startTimeTicks + 2_400 * 10_000_000, productionCatalog)
  assert.equal(ready.readyOutputAmount, 6)
  assert.equal(ready.readyOutputPrefab, 'BarleyWine')
})

test('fuel warning includes what is missing to finish the complete queue', () => {
  const summary = summarizeStation(station({
    queued: 5, fuel: 7, bakeTimer: 15, queueItems: ['CopperOre'],
  }), 0, productionCatalog)
  assert.equal(summary.status, 'attention')
  assert.equal(summary.fuelMissing, 2)
  assert.equal(summary.fuelPrefab, 'Coal')
})

test('legacy station snapshots without cooking slot status stay readable', () => {
  const legacy = station({ queued: 2, fuel: 3 })
  delete legacy.slotStatuses
  assert.equal(summarizeStation(legacy).status, 'active')
})

test('nearby production pieces of the same type become one operation cluster', () => {
  const summaries = summarizeStations([
    station({ prefabName: 'piece_beehive', x: 615, y: -1165, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 617, y: -1163, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 620, y: -1161, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 622, y: -1159, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 624, y: -1162, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 616, y: -1170, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 618, y: -1168, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 620, y: -1166, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 622, y: -1164, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 626, y: -1166, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 624, y: -1168, level: 1 }),
    station({ prefabName: 'piece_beehive', x: 622, y: -1170, level: 1 }),
  ])
  const clusters = clusterStationSummaries(summaries)
  assert.equal(clusters.length, 1)
  assert.equal(clusters[0].members.length, 12)
})

test('station clustering keeps different types and distant stations separate', () => {
  const clusters = clusterStationSummaries(summarizeStations([
    station({ prefabName: 'piece_beehive', x: 0, y: 0 }),
    station({ prefabName: 'piece_beehive', x: 50, y: 0 }),
    station({ prefabName: 'smelter', x: 2, y: 2 }),
  ]))
  assert.equal(clusters.length, 3)
})

test('fuel-only Frigid Kiln is active without an ore queue, and a dry foundry needs fuel', () => {
  const catalog = {
    piece_frostkiln: { ...productionCatalog.smelter, prefabName: 'piece_FrostKiln', maxInput: 0,
      fuelPrefab: 'Ice', fuelPerProduct: 5, conversions: [{ inputPrefab: 'Ice', inputAmount: 5, fuelOnly: true,
        outputPrefab: 'FrozenFuel', outputAmount: 1, cookTimeSeconds: 0 }] },
    piece_frostfoundry: { ...productionCatalog.smelter, prefabName: 'piece_FrostFoundry', fuelPrefab: 'FrozenFuel', fuelPerProduct: 0 },
  }
  assert.equal(summarizeStation(station({ prefabName: 'piece_FrostKiln', fuel: 5 }), 0, catalog).status, 'active')
  assert.equal(summarizeStation(station({ prefabName: 'piece_FrostFoundry', queueItems: ['SwordGoldUncooked'] }), 0, catalog).status, 'attention')
})
