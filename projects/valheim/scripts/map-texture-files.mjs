import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const names = ['background', 'clouds', 'fog-layer', 'forest', 'lava-mask', 'mountain', 'space', 'water']

export function validateMapTextures(directory) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'game-data/map-texture-manifest.json'), 'utf8'))
  const expected = new Set(names.map(name => `game-data/map-textures/${name}.png`))
  if (manifest.schemaVersion !== 1 || manifest.files?.length !== expected.size) throw new Error('Invalid local map texture manifest')
  for (const file of manifest.files) {
    if (!expected.delete(file.path)) throw new Error(`Unexpected map texture: ${file.path}`)
    const body = fs.readFileSync(path.join(directory, file.path))
    if (body.length !== file.bytes || createHash('sha256').update(body).digest('hex') !== file.sha256) {
      throw new Error(`Local map texture is damaged: ${file.path}`)
    }
  }
  return manifest.files
}
