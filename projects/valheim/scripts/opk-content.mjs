import fs from 'node:fs'
import path from 'node:path'
import { validateMapTextures } from './map-texture-files.mjs'

export const collectRequiredOpkFiles = (dist) => {
  const manifestPath = path.join(dist, 'manifest.json')
  if (!fs.existsSync(manifestPath)) throw new Error('dist/manifest.json is missing')

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''))
  const requiredFiles = [
    'manifest.json',
    manifest.meta.icon,
    manifest.meta.icon_gray,
    manifest.meta.launcher_icon,
    manifest.meta.tray_icon,
    // Runtime data the shipped app reads; a missing one is a silent feature loss.
    'game-data/planner-catalog.json',
    'game-data/building-catalog.json',
    'game-data/marker-intelligence.json',
    'game-data/prefab-types.json',
    'game-data/localization.json',
    // Map rendering inputs (minimap-renderer.ts / seed-generator.worker.ts).
    'game-data/location-index.json',
    'game-data/biome-rules.json',
    'game-data/asset-cdn.json',
    'game-data/map-texture-manifest.json',
    ...validateMapTextures(dist).map(file => file.path),
    'game-data/seeds/Valheim.json',
    'tracking-mod/payload-manifest.json',
    'tracking-mod/payload-version.json',
    'tracking-mod/local-exploration-version.json',
    'tracking-mod/payload/BepInEx/plugins/ValheimCompanion/ValheimCompanion.LocalExploration.dll',
    'tracking-mod/payload/BepInEx/plugins/ValheimCompanion/ValheimCompanion.PositionBridge.dll',
    'tracking-mod/payload/BepInEx/core/BepInEx.dll',
    'tracking-mod/payload/winhttp.dll',
  ]
  for (const requiredFile of requiredFiles) {
    if (!fs.existsSync(path.join(dist, requiredFile))) {
      throw new Error(`Missing OPK file: ${requiredFile}`)
    }
  }

  for (const folder of ['icons']) {
    if (fs.existsSync(path.join(dist, 'game-data', folder))) throw new Error(`CDN images must not be packaged: ${folder}`)
  }
  const cdn = JSON.parse(fs.readFileSync(path.join(dist, 'game-data/asset-cdn.json'), 'utf8'))
  if (!cdn.verifiedAt || !cdn.baseUrl?.startsWith('https://') || !cdn.files?.length) throw new Error('Missing verified CDN release')

  return {
    manifest,
    requiredFiles,
  }
}
