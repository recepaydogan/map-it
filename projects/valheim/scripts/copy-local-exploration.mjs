import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = path.join(root, 'tracking-exploration/bin/Release/netstandard2.1/ValheimCompanion.LocalExploration.dll')
const target = path.join(root, 'public/tracking-mod/payload/BepInEx/plugins/ValheimCompanion/ValheimCompanion.LocalExploration.dll')
fs.copyFileSync(source, target)
const bytes = fs.readFileSync(target)
const version = { fingerprint: crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16), bytes: bytes.length }
fs.writeFileSync(path.join(root, 'public/tracking-mod/local-exploration-version.json'), `${JSON.stringify(version)}\n`)
console.log(`Copied the separate local exploration plugin (${bytes.length} bytes).`)
