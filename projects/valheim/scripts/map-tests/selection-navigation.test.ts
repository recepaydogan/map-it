import assert from 'node:assert/strict'
import test from 'node:test'
import { selectionLandingOffset } from '../../src/lib/map-selection-navigation.ts'

const rect = (left: number, top: number, width: number, height: number) => ({
  left, top, right: left + width, bottom: top + height, width, height,
})

const viewport = rect(0, 0, 1200, 800)
const panel = rect(8, 52, 360, 500)

test('clicking a visible marker keeps the current camera position', () => {
  assert.equal(selectionLandingOffset(viewport, panel, rect(700, 300, 32, 32), rect(670, 260, 92, 30), 72), null)
})

test('a marker covered by details lands beside the panel', () => {
  const landing = selectionLandingOffset(viewport, panel, rect(250, 300, 32, 32), rect(220, 260, 92, 30), 72)
  assert.ok(landing)
  assert.ok(viewport.width / 2 + landing.x > panel.right)
  assert.equal(viewport.height / 2 + landing.y, panel.top + panel.height / 2)
})

test('a covered selected tooltip also triggers navigation', () => {
  const landing = selectionLandingOffset(viewport, panel, rect(390, 300, 32, 32), rect(300, 260, 180, 30), 72)
  assert.ok(landing)
  assert.ok(viewport.width / 2 + landing.x - 90 > panel.right)
})
