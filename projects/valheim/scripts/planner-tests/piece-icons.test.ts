import assert from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { findItem } from '../../src/lib/crafting/build-recipe-graph.ts'
import { graph } from './fixtures.ts'

test('Adze retains its published icon in the crafting presentation record', () => {
  const item = findItem(graph, 'piece_workbench_ext3')
  assert.equal(item?.name, 'Adze')
  assert.equal(item?.isPiece, true)
  assert.ok(item?.icon?.endsWith('/game-data/icons/workbench-ext3-1659b528.png'))
})

test('every craftable building piece resolves to a published CDN icon', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../../public/game-data/asset-cdn.json', import.meta.url), 'utf8'))
  const published = new Set(manifest.files.map((file: { path: string }) => `${manifest.baseUrl}/${file.path}`))
  const pieces = [...graph.items.values()].filter(item => item.isPiece)
  assert.ok(pieces.length > 500)
  for (const piece of pieces) assert.ok(published.has(piece.icon), `Missing published icon: ${piece.prefabName}`)
})
