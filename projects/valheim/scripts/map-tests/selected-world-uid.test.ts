import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveSelectedWorldUid } from '../../src/lib/valheim/selected-world-uid.ts'

const selected = { name: 'Valheim World AGALAR', seedName: 'FZE9RXJbNE', uid: '' }
const live = { worldName: selected.name, seedName: selected.seedName, worldUid: '-329361684' }
const tracked = { worldName: live.worldName, seedName: live.seedName }

test('a server world without a save can match character pins using its confirmed live UID', () => {
  const maps = new Map([['-329361684', { pins: 57 }]])
  const uid = resolveSelectedWorldUid(selected, live, tracked)
  assert.equal(maps.get(uid!)?.pins, 57)
  assert.equal(selected.uid, '') // Does not mutate the saved/remembered world.
})

test('an existing save UID always wins, including manual selection of another world', () => {
  assert.equal(resolveSelectedWorldUid({ ...selected, uid: '1605511480' }, live, tracked), '1605511480')
  assert.equal(resolveSelectedWorldUid({ ...selected, uid: '1605511480' }, null, null), '1605511480')
})

test('same name with a different seed or same seed with a different name cannot match', () => {
  assert.equal(resolveSelectedWorldUid({ ...selected, seedName: 'Other' }, live, tracked), null)
  assert.equal(resolveSelectedWorldUid({ ...selected, name: 'Other' }, live, tracked), null)
})

test('a previous inventory snapshot cannot match while position tracking has switched worlds', () => {
  assert.equal(resolveSelectedWorldUid(selected, live, { ...tracked, worldName: 'Other' }), null)
  assert.equal(resolveSelectedWorldUid(selected, live, { ...tracked, seedName: 'Other' }), null)
})

test('no selected world, no live inventory, or no active position tracking cannot supply a UID', () => {
  assert.equal(resolveSelectedWorldUid(null, live, tracked), null)
  assert.equal(resolveSelectedWorldUid(selected, null, tracked), null)
  assert.equal(resolveSelectedWorldUid(selected, live, null), null)
  assert.equal(resolveSelectedWorldUid(selected, live, {}), null)
})

test('missing or invalid identity is rejected without normalizing distinct seeds', () => {
  for (const worldUid of ['', '0', 'NaN', 'invalid', ' 123 ']) {
    assert.equal(resolveSelectedWorldUid(selected, { ...live, worldUid }, tracked), null)
  }
  assert.equal(resolveSelectedWorldUid(selected, { ...live, seedName: live.seedName.toLowerCase() }, tracked), null)
  assert.equal(resolveSelectedWorldUid({ uid: '', name: '', seedName: '' }, { worldUid: '123', worldName: '', seedName: '' }, {}), null)
})
