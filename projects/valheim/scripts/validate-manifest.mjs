import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const manifestPath = path.join(root, 'public', 'manifest.json')
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const errors = []
const expectedGameId = 21668

const requireValue = (condition, message) => {
  if (!condition) errors.push(message)
}

requireValue(manifest.manifest_version === 1, 'manifest_version must be 1')
requireValue(manifest.type === 'WebApp', 'type must be WebApp')
requireValue(manifest.meta?.name === 'Valheim Map', 'meta.name must be Valheim Map')
requireValue(/^\d+\.\d+\.\d+$/.test(manifest.meta?.version ?? ''), 'meta.version must use semantic versioning')
requireValue(Boolean(manifest.meta?.tray_icon), 'meta.tray_icon must be configured')
requireValue(manifest.data?.start_window === 'background', 'background must be the start window')
requireValue(manifest.data?.game_targeting?.type === 'dedicated', 'game targeting must be dedicated')
requireValue(
  JSON.stringify(manifest.data?.game_targeting?.game_ids) === JSON.stringify([expectedGameId]),
  `game targeting must contain only Valheim (${expectedGameId})`,
)
requireValue(
  JSON.stringify(manifest.data?.launch_events?.[0]?.event_data?.game_ids) === JSON.stringify([expectedGameId]),
  `GameLaunch must contain only Valheim (${expectedGameId})`,
)
requireValue(!manifest.data?.game_events, 'game_events must stay disabled until Valheim GEP support is verified')

for (const permission of [
  'Extensions',
  'GameInfo',
  'Hotkeys',
  'Tray',
  'Streaming',
  'Profile',
  'DesktopStreaming',
]) {
  requireValue(manifest.permissions?.includes(permission), `missing permission: ${permission}`)
}

requireValue(
  manifest.data?.windows?.main?.enable_top_isolation === true,
  'main window must enable iframe isolation for Overwolf ads',
)

for (const windowName of ['background', 'main', 'overlay']) {
  requireValue(Boolean(manifest.data?.windows?.[windowName]?.file), `missing declared window: ${windowName}`)
}

for (const hotkeyName of ['toggle_app', 'toggle_overlay']) {
  requireValue(Boolean(manifest.data?.hotkeys?.[hotkeyName]?.default), `missing hotkey: ${hotkeyName}`)
}

if (errors.length > 0) {
  console.error('Manifest validation failed:')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Manifest valid: ${manifest.meta.name} ${manifest.meta.version}, Valheim game ID ${expectedGameId}.`)
