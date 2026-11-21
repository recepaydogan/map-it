import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveMapSpoilerMode } from '../../src/lib/valheim/map-spoiler-mode.ts'
import { packExploredMap } from '../../src/lib/valheim/explored-map.ts'
import { hasSeenExplorationIntro, markExplorationIntroSeen, smallPersonalExploration } from '../../src/lib/valheim/personal-exploration-intro.ts'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} })
test('legacy spoiler preferences retain their meaning and invalid modes fall back safely', () => {
  assert.equal(resolveMapSpoilerMode({ showSpoilers: true }), 'full')
  assert.equal(resolveMapSpoilerMode({ showSpoilers: false }), 'personal')
  assert.equal(resolveMapSpoilerMode({ spoilerMode: 'terrain', showSpoilers: true }), 'terrain')
  assert.equal(resolveMapSpoilerMode({ spoilerMode: 'broken', showSpoilers: false }), 'personal')
  assert.equal(resolveMapSpoilerMode(null), 'full')
})

test('initial framing finds a new character’s personal area, including live map scale', () => {
  const cells = new Uint8Array(2048 * 2048)
  for (let z = 1020; z <= 1028; z++) for (let x = 1120; x <= 1128; x++) cells[z * 2048 + x] = 1
  const map = packExploredMap(2048, cells)
  assert.deepEqual(smallPersonalExploration(map), { x: 1200, z: 0, width: 108, height: 108, cells: 81 })
  assert.deepEqual(smallPersonalExploration({ ...map, pixelSize: 24 }), { x: 2400, z: 0, width: 216, height: 216, cells: 81 })
  assert.equal(smallPersonalExploration(null), null)
  assert.equal(smallPersonalExploration(packExploredMap(2048, new Uint8Array(cells.length))), null)
})

test('large and scattered maps never trigger new-character framing', () => {
  assert.equal(smallPersonalExploration(packExploredMap(2048, new Uint8Array(2048 ** 2).fill(1))), null)
  const cells = new Uint8Array(2048 ** 2)
  cells[1024 * 2048 + 1024] = 1
  cells[1024 * 2048 + 1524] = 1
  assert.equal(smallPersonalExploration(packExploredMap(2048, cells)), null)
})

test('initial zoom and explanation are acknowledged per character and world, even if storage later fails', () => {
  assert.equal(hasSeenExplorationIntro('world-A:character-A'), false)
  markExplorationIntroSeen('world-A:character-A')
  assert.equal(hasSeenExplorationIntro('world-A:character-A'), true)
  assert.equal(hasSeenExplorationIntro('world-B:character-A'), false)
  assert.equal(hasSeenExplorationIntro('world-A:character-B'), false)
  storage.clear()
  assert.equal(hasSeenExplorationIntro('world-A:character-A'), true)
})
