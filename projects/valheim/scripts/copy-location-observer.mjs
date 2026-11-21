import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, copyFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = path.join(root, 'tracking-observer/bin/Release/netstandard2.1/ValheimCompanion.LocationObserver.dll')
const target = path.join(root, 'public/tracking-mod/payload/BepInEx/plugins/ValheimCompanion/ValheimCompanion.LocationObserver.dll')
mkdirSync(path.dirname(target), { recursive: true })
copyFileSync(source, target)
const bytes = readFileSync(target)
writeFileSync(path.join(root, 'public/tracking-mod/location-observer-version.json'), JSON.stringify({ fingerprint: createHash('sha256').update(bytes).digest('hex').slice(0, 16), bytes: bytes.length }) + '\n')
console.log(`Copied the read-only location observer (${bytes.length} bytes); Position Bridge unchanged.`)
