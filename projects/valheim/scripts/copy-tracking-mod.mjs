import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const builtAssembly = path.join(
  projectRoot,
  'tracking-mod',
  'bin',
  'Release',
  'netstandard2.1',
  'ValheimCompanion.PositionBridge.dll',
)
const payloadAssembly = path.join(
  projectRoot,
  'public',
  'tracking-mod',
  'payload',
  'BepInEx',
  'plugins',
  'ValheimCompanion',
  'ValheimCompanion.PositionBridge.dll',
)

if (!fs.existsSync(builtAssembly)) {
  throw new Error(`Tracking mod assembly not found: ${builtAssembly}. Run npm run build:tracking-mod first.`)
}

fs.mkdirSync(path.dirname(payloadAssembly), { recursive: true })
fs.copyFileSync(builtAssembly, payloadAssembly)

const manifestPath = path.join(projectRoot, 'public', 'tracking-mod', 'payload-manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^﻿/, ''))
const relativeAssembly = 'BepInEx/plugins/ValheimCompanion/ValheimCompanion.PositionBridge.dll'
if (!manifest.includes(relativeAssembly)) {
  throw new Error(`payload-manifest.json does not list ${relativeAssembly}`)
}

// The app compares this fingerprint with the marker it writes into the game
// folder, so an outdated installed plugin is detected and reinstalled.
const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(payloadAssembly)).digest('hex').slice(0, 16)
fs.writeFileSync(
  path.join(projectRoot, 'public', 'tracking-mod', 'payload-version.json'),
  `${JSON.stringify({ fingerprint, bytes: fs.statSync(payloadAssembly).size })}
`,
)

console.log(`Copied the tracking mod into the installer payload (${fs.statSync(payloadAssembly).size} bytes).`)
