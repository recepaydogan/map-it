import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { validateMapTextures } from './map-texture-files.mjs'
import { collectAssets, contentHash, manifestPath, root } from './asset-cdn-files.mjs'

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'))
assert.equal(contentHash(manifest.files), manifest.contentHash)
assert.ok(manifest.files.every(file => file.path.startsWith('game-data/icons/')))
const textures = validateMapTextures(path.join(root, 'public'))
assert.equal(textures.length, 8)
for (const file of await collectAssets()) assert.equal(manifest.files.find(entry => entry.path === file.path)?.sha256, file.sha256)
assert.ok(manifest.verifiedAt)
const published = new Set(manifest.files.map(f => `${manifest.baseUrl}/${f.path}`))
let references = 0
async function check(directory) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await check(file)
    else if (entry.name.endsWith('.json')) {
      const text = await fs.readFile(file, 'utf8')
      assert.equal(/https:\/\/[^"\s]+\/game-data\/map-textures\//.test(text), false, file)
      assert.equal(/"\/game-data\/(icons)\//.test(text), false, file)
      for (const [url] of text.matchAll(/https:\/\/[^"\s]+\/game-data\/(?:icons)\/[^"\s]+\.png/g)) {
        assert.ok(published.has(url), `Unpublished image in ${entry.name}: ${url}`)
        references++
      }
    }
  }
}
await check(path.join(root, 'public/game-data'))
assert.ok(references > 1000)
console.log(`CDN asset checks passed: ${manifest.files.length} files and ${references} catalog references`)
