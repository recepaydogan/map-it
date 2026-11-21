/// <reference types="@overwolf/types" />
import assert from 'node:assert/strict'
import test from 'node:test'
import { canAutoLaunchCraftCompanion, closeCraftCompanionForSession } from '../../src/overwolf-utils/craft-auto-launch-session.ts'

function setup(t: test.TestContext) {
  let background: object = {}
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'overwolf')
  Object.defineProperty(globalThis, 'overwolf', { configurable: true,
    value: { windows: { getMainWindow: () => background } } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'overwolf', previous)
    else Reflect.deleteProperty(globalThis, 'overwolf')
  })
  return { restartApp: () => { background = {} } }
}

test('user close suppresses companion auto-launch through repeated game launches', async t => {
  setup(t)
  await closeCraftCompanionForSession(async () => {})
  for (let gameSession = 0; gameSession < 4; gameSession++) {
    assert.equal(canAutoLaunchCraftCompanion(), false)
  }
})

test('only a new background/app lifetime clears companion suppression', async t => {
  const app = setup(t)
  await closeCraftCompanionForSession(async () => {})
  app.restartApp()
  assert.equal(canAutoLaunchCraftCompanion(), true)
})

test('pending automatic launches are blocked before the asynchronous hide completes', async t => {
  setup(t)
  let finish!: () => void
  const close = closeCraftCompanionForSession(() => new Promise<void>(resolve => { finish = resolve }))
  assert.equal(canAutoLaunchCraftCompanion(), false)
  finish()
  await close
  assert.equal(canAutoLaunchCraftCompanion(), false)
})

test('failed close restores companion eligibility', async t => {
  setup(t)
  await assert.rejects(closeCraftCompanionForSession(async () => { throw new Error('hide failed') }))
  assert.equal(canAutoLaunchCraftCompanion(), true)
})

test('a late failed close cannot undo a newer successful close', async t => {
  setup(t)
  let fail!: (error: Error) => void
  const pending = closeCraftCompanionForSession(() => new Promise<void>((_, reject) => { fail = reject }))
  await closeCraftCompanionForSession(async () => {})
  fail(new Error('old close failed'))
  await assert.rejects(pending)
  assert.equal(canAutoLaunchCraftCompanion(), false)
})
