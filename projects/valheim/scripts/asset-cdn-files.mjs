import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const root = path.resolve(import.meta.dirname, '..')
export const manifestPath = path.join(root, 'public/game-data/asset-cdn.json')
export async function collectAssets() {
  const files = []
  for (const folder of ['icons']) {
    const directory = path.join(root, 'public/game-data', folder)
    const names = await fs.readdir(directory).catch(error => { if (error.code === 'ENOENT') return []; throw error })
    for (const name of names.sort()) {
      if (!name.endsWith('.png')) continue
      const file = path.join(directory, name)
      const body = await fs.readFile(file)
      files.push({ file, path: `game-data/${folder}/${name}`, bytes: body.length,
        sha256: createHash('sha256').update(body).digest('hex'), md5: createHash('md5').update(body).digest('hex') })
    }
  }
  return files
}
export const contentHash = files => createHash('sha256').update(files.map(f => `${f.path}:${f.sha256}`).join('\n')).digest('hex').slice(0, 20)
