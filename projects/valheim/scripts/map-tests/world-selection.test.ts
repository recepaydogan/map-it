import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseAutomaticWorld } from '../../src/lib/valheim/world-selection.ts'
import { parseWorldTimeSeconds } from '../../src/lib/valheim/world-save-format.ts'
import type { ValheimWorldSave } from '../../src/types/world-save.ts'

function world(id: string, worldTimeSeconds: number | null): ValheimWorldSave {
  return {
    id,
    fileName: id,
    name: id,
    seedName: id,
    seed: 0,
    uid: id,
    worldVersion: 0,
    worldGenVersion: 0,
    needsDatabase: true,
    fwlPath: `${id}.fwl`,
    databasePath: `${id}.db`,
    worldTimeSeconds,
    source: 'local',
  }
}

test('automatic world selection prefers the longest-played world', () => {
  const worlds = [world('first', 100), world('longest', 900), world('unknown', null)]
  assert.equal(chooseAutomaticWorld(worlds)?.id, 'longest')
})

test('automatic world selection falls back to the first world', () => {
  const worlds = [world('first', null), world('second', null)]
  assert.equal(chooseAutomaticWorld(worlds)?.id, 'first')
})

test('database play time is read from its twelve-byte header', () => {
  const header = new ArrayBuffer(12)
  const view = new DataView(header)
  view.setInt32(0, 33, true)
  view.setFloat64(4, 12_345.5, true)
  assert.equal(parseWorldTimeSeconds(header), 12_345.5)
})
