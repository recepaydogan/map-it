import { isOverwolf } from '../../utils/overwolf.ts'
import { discoverSteamRoots } from '../valheim/steam-save-paths.ts'

export interface PlayerPosition {
  /** Monotonic sample counter written by the mod; lets readers drop duplicates. */
  seq?: number
  x: number
  y: number
  z: number
  updatedAt: number
  worldName?: string
  seedName?: string
  /** Yaw of the camera, degrees clockwise from north (+z). */
  cameraHeading?: number
  /** Yaw of the character body — the way they run; mod ≥ 1.4. */
  heading?: number
  velocityX?: number
  velocityZ?: number
}

const DEFAULT_STEAM_INSTALLS = [
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Valheim',
  'C:\\Program Files\\Steam\\steamapps\\common\\Valheim',
]

const WINDOWS_DRIVES = Array.from(
  { length: 26 },
  (_, index) => String.fromCharCode('A'.charCodeAt(0) + index),
)

/** Common Steam client/library roots when the player chose another drive. */
const COMMON_STEAM_ROOTS = WINDOWS_DRIVES.flatMap((drive) => [
  `${drive}:\\SteamLibrary`,
  `${drive}:\\Steam`,
  `${drive}:\\Program Files (x86)\\Steam`,
  `${drive}:\\Program Files\\Steam`,
])

/**
 * Xbox app / Microsoft Store installs use this layout on whichever drive the
 * player selected. Scan every Windows drive only after the Steam defaults miss
 * so the common path stays cheap and an Xbox install on D:, E:, etc. is not
 * mistaken for a missing game.
 */
const DEFAULT_XBOX_INSTALLS = WINDOWS_DRIVES.map(
  (drive) => `${drive}:\\XboxGames\\Valheim\\Content`,
)

const VALHEIM_CLASS_ID = 21668
const PLUGIN_SUBDIRECTORY = 'BepInEx\\plugins\\ValheimCompanion'
const INSTALL_MARKER = '.valheim-companion-install'
const PROFILE_REDIRECT = 'companion-data-directory.txt'
const PLUGIN_ASSEMBLY = 'BepInEx/plugins/ValheimCompanion/ValheimCompanion.PositionBridge.dll'

const exists = (path: string) => new Promise<boolean>((resolve) =>
  overwolf.io.fileExists(path, (result) => resolve(Boolean(result.success && result.found))),
)

const readText = (path: string) => new Promise<string | null>((resolve) =>
  overwolf.io.readFileContents(path, 'UTF8' as overwolf.io.enums.eEncoding, (result) =>
    resolve(result.success && typeof result.content === 'string' ? result.content : null)),
)

const writeText = (path: string, contents: string) => new Promise<void>((resolve, reject) =>
  overwolf.io.writeFileContents(
    path,
    contents,
    'UTF8' as overwolf.io.enums.eEncoding,
    true,
    (result) => result.success ? resolve() : reject(new Error(result.error ?? 'permission-denied')),
  ))

const runningGame = () => new Promise<overwolf.games.GetRunningGameInfoResult | null>((resolve) =>
  overwolf.games.getRunningGameInfo((result) => resolve(result?.isRunning ? result : null)),
)

const isValheimGame = (game: overwolf.games.GetRunningGameInfoResult | null): game is overwolf.games.GetRunningGameInfoResult =>
  Boolean(game)
  && (game!.classId === VALHEIM_CLASS_ID || Math.floor((game!.id ?? 0) / 10) === VALHEIM_CLASS_ID)
  && /(?:^|[\\/])valheim\.exe$/i.test(game!.executionPath ?? '')

const runningValheim = async () => {
  const game = await runningGame()
  return isValheimGame(game) ? game : null
}

export async function runningValheimProcessId(): Promise<number | null> {
  const game = await runningValheim()
  return game && game.processId > 0 ? game.processId : null
}

/** Mod managers pass the selected profile's BepInEx preloader to Valheim. */
export function profileDirectoryFromValheimCommandLine(commandLine: string): string | null {
  const match = commandLine.match(
    /(?:^|\s)--doorstop-target(?:-assembly)?(?:=|\s+)\s*(?:"([^"]+)"|([a-z]:[\\/][\s\S]*?[\\/]BepInEx[\\/]core[\\/]BepInEx\.Preloader\.dll))/i,
  )
  const preloader = (match?.[1] ?? match?.[2])?.replaceAll('/', '\\')
  const profile = preloader?.match(/^([a-z]:\\.+)\\BepInEx\\core\\BepInEx\.Preloader\.dll$/i)?.[1]
  return profile ? normalizeDirectory(profile) : null
}

export async function findRunningTrackingProfile(): Promise<string | null> {
  const game = await runningValheim()
  const candidate = profileDirectoryFromValheimCommandLine(game?.commandLine ?? '')
  return candidate ? findSelectedTrackingProfile(candidate) : null
}

const directoryOf = (path: string) => path.replaceAll('/', '\\').slice(0, path.replaceAll('/', '\\').lastIndexOf('\\'))

const normalizeDirectory = (path: string) => path.replaceAll('/', '\\').replace(/\\+$/, '')

const uniqueDirectories = (paths: readonly string[]): string[] => {
  const unique = new Map<string, string>()
  for (const path of paths) {
    const normalized = normalizeDirectory(path)
    if (normalized && !unique.has(normalized.toLowerCase())) unique.set(normalized.toLowerCase(), normalized)
  }
  return [...unique.values()]
}

/** Supports both current `path` entries and Steam's legacy numbered entries. */
export function parseSteamLibraryFolders(contents: string): string[] {
  const paths: string[] = []
  const entry = /"(?:path|\d+)"\s+"([a-z]:[\\/][^"]+)"/gi
  for (const match of contents.matchAll(entry)) {
    if (match[1]) paths.push(match[1].replace(/\\\\/g, '\\'))
  }
  return uniqueDirectories(paths)
}

const steamGameDirectory = (root: string) => `${normalizeDirectory(root)}\\steamapps\\common\\Valheim`

/**
 * Steam libraries may be named and placed anywhere. The VDF registry is the
 * authoritative source; common drive-root layouts remain a fallback when the
 * Steam client itself cannot be located through Overwolf.
 */
async function discoverAdditionalSteamInstalls(): Promise<string[]> {
  const detectedRoots = await discoverSteamRoots()
  // Read registries only from known Steam roots. Probing libraryfolders.vdf on
  // every possible drive layout would add many unnecessary file reads.
  const registries = await Promise.all(detectedRoots.map((root) =>
    readText(`${root}\\steamapps\\libraryfolders.vdf`),
  ))
  const registeredRoots = registries.flatMap((contents) =>
    contents ? parseSteamLibraryFolders(contents) : [],
  )
  return uniqueDirectories([...registeredRoots, ...detectedRoots, ...COMMON_STEAM_ROOTS]).map(steamGameDirectory)
}

const firstExistingGameDirectory = async (directories: readonly string[]): Promise<string | null> => {
  const matches = await Promise.all(directories.map(async (directory) =>
    await exists(`${directory}\\valheim.exe`) ? directory : null,
  ))
  return matches.find((directory): directory is string => directory !== null) ?? null
}

export type ValheimDirectorySource = 'running_game' | 'saved' | 'default_install' | 'steam_library' | 'xbox_install'

export interface ValheimDirectoryResult {
  directory: string
  running: boolean
  source: ValheimDirectorySource
}

export async function findValheimDirectory(saved: string | null): Promise<ValheimDirectoryResult> {
  if (!isOverwolf()) throw new Error('overwolf-required')
  const game = await runningValheim()
  if (game?.executionPath) {
    return { directory: directoryOf(game.executionPath), running: true, source: 'running_game' }
  }
  if (saved && await exists(`${saved}\\valheim.exe`)) {
    return { directory: saved, running: false, source: 'saved' }
  }
  for (const directory of DEFAULT_STEAM_INSTALLS) {
    if (await exists(`${directory}\\valheim.exe`)) {
      return { directory, running: false, source: 'default_install' }
    }
  }
  const steamDirectory = await firstExistingGameDirectory(await discoverAdditionalSteamInstalls())
  if (steamDirectory) {
    return { directory: steamDirectory, running: false, source: 'steam_library' }
  }
  // Xbox installations are normally rooted at X:\XboxGames. Check all drive
  // letters because the Xbox app lets players choose a non-system drive.
  const xboxDirectory = await firstExistingGameDirectory(DEFAULT_XBOX_INSTALLS)
  if (xboxDirectory) {
    return { directory: xboxDirectory, running: false, source: 'xbox_install' }
  }
  throw new Error('valheim-not-found')
}

/**
 * A manually picked folder counts as the Valheim install when it — or a
 * `Valheim` child, for players who pick `steamapps\common` — contains
 * valheim.exe. Returns the resolved directory, or null for a bad pick.
 */
export async function findSelectedValheimDirectory(selectedPath: string): Promise<string | null> {
  const normalized = selectedPath.replaceAll('/', '\\').replace(/\\+$/, '')
  for (const candidate of [normalized, `${normalized}\\Valheim`]) {
    if (await exists(`${candidate}\\valheim.exe`)) return candidate
  }
  return null
}

/** Thunderstore and r2modman keep BepInEx inside the selected profile. */
export async function findSelectedTrackingProfile(selectedPath: string): Promise<string | null> {
  const normalized = normalizeDirectory(selectedPath)
  const candidates = /\\BepInEx$/i.test(normalized)
    ? [directoryOf(normalized)]
    : [normalized]
  for (const candidate of candidates) {
    if (await exists(`${candidate}\\BepInEx\\core\\BepInEx.dll`)
      && !(await exists(`${candidate}\\valheim.exe`))) return candidate
  }
  return null
}

interface PayloadVersion {
  fingerprint: string
  bytes: number
}

let payloadVersionPromise: Promise<PayloadVersion> | null = null

/** Fingerprint of the plugin shipped inside this app build. */
export const readPayloadVersion = (): Promise<PayloadVersion> => {
  payloadVersionPromise ??= fetch('/tracking-mod/payload-version.json')
    .then((response) => {
      if (!response.ok) throw new Error('payload-missing')
      return response.json() as Promise<PayloadVersion>
    })
    .catch((error: unknown) => {
      payloadVersionPromise = null
      throw error
    })
  return payloadVersionPromise
}

const markerPath = (directory: string) => `${directory}\\${PLUGIN_SUBDIRECTORY}\\${INSTALL_MARKER}`

/**
 * The install marker records which payload was copied. Comparing it with the
 * shipped fingerprint tells the app whether the plugin in the game folder is
 * current without hashing DLLs from a browser context.
 */
export async function isInstallCurrent(directory: string): Promise<boolean> {
  const [marker, shipped, hasBridge] = await Promise.all([
    readText(markerPath(directory)),
    readPayloadVersion(),
    exists(directory + '\\' + PLUGIN_ASSEMBLY.replaceAll('/', '\\')),
  ])
  if (!marker || !hasBridge) return false
  try {
    const parsed = JSON.parse(marker) as Partial<PayloadVersion>
    return parsed.fingerprint === shipped.fingerprint
  } catch {
    // Legacy plain-text marker from before fingerprinting.
    return false
  }
}

export type InstallOutcome =
  /** Files copied; the game was not running so the mod loads on next launch. */
  | 'installed'
  /** Files copied while the game runs; needs a restart to load. */
  | 'installed-restart-required'
  /** The plugin DLL is loaded by the running game and could not be replaced. */
  | 'locked-restart-required'
  | 'already-current'

/** Independent read-only observer; never replaces the existing Position Bridge. */
export async function installLocationObserver(gameDirectory: string, profile: string | null): Promise<InstallOutcome> {
  if (!(await exists(`${gameDirectory}\\valheim.exe`))) throw new Error('valheim-not-found')
  const response = await fetch('/tracking-mod/location-observer-version.json')
  if (!response.ok) throw new Error('location-observer-payload-missing')
  const version = await response.json() as PayloadVersion
  const roots = [gameDirectory]
  if (profile) {
    const validated = await findSelectedTrackingProfile(profile)
    if (!validated) throw new Error('profile-not-found')
    roots.push(validated)
  }
  let copied = false
  let locked = false
  for (const root of uniqueDirectories(roots)) {
    const directory = `${root}\\${PLUGIN_SUBDIRECTORY}`
    const marker = `${directory}\\.client-location-observer-install`
    const assembly = `${directory}\\ValheimCompanion.LocationObserver.dll`
    const old = await readText(marker)
    let current = false
    try { current = Boolean(old && JSON.parse(old).fingerprint === version.fingerprint && await exists(assembly)) } catch { /* Retry incomplete installation. */ }
    if (current) continue
    // The Position Bridge installer already creates/validates these folders.
    const file = 'BepInEx/plugins/ValheimCompanion/ValheimCompanion.LocationObserver.dll'
    if (!(await copyPayloadFile(file, assembly))) { locked = true; continue }
    await writeText(marker, JSON.stringify(version))
    copied = true
  }
  const output = `${gameDirectory}\\${PLUGIN_SUBDIRECTORY}\\client-locations.json`
  if (!(await exists(output))) await writeText(output, '{}')
  if (locked) return 'locked-restart-required'
  return copied ? (await runningValheim()) ? 'installed-restart-required' : 'installed' : 'already-current'
}

/** Installed on demand by the local-only spoiler control, independently of both existing plugins. */
export async function installLocalExploration(gameDirectory: string, profile: string | null): Promise<InstallOutcome> {
  if (!(await exists(`${gameDirectory}\\valheim.exe`))) throw new Error('valheim-not-found')
  const response = await fetch('/tracking-mod/local-exploration-version.json')
  if (!response.ok) throw new Error('local-exploration-payload-missing')
  const version = await response.json() as PayloadVersion
  const roots = [gameDirectory]
  if (profile) {
    const validated = await findSelectedTrackingProfile(profile)
    if (!validated) throw new Error('profile-not-found')
    roots.push(validated)
  }
  let copied = false
  for (const root of uniqueDirectories(roots)) {
    const directory = `${root}\\${PLUGIN_SUBDIRECTORY}`
    const marker = `${directory}\\.local-exploration-install`
    const assembly = `${directory}\\ValheimCompanion.LocalExploration.dll`
    const old = await readText(marker)
    try {
      if (old && JSON.parse(old).fingerprint === version.fingerprint && await exists(assembly)) continue
    } catch { /* Repair incomplete installation. */ }
    const file = 'BepInEx/plugins/ValheimCompanion/ValheimCompanion.LocalExploration.dll'
    if (!(await copyPayloadFile(file, assembly))) return 'locked-restart-required'
    await writeText(marker, JSON.stringify(version))
    copied = true
  }
  return copied ? (await runningValheim()) ? 'installed-restart-required' : 'installed' : 'already-current'
}

/**
 * Installs the plugin and fills in missing BepInEx files. A running game can
 * lock the plugin during an update; the caller retries once the game exits.
 */
export async function installTrackingMod(directory: string, options: { force?: boolean } = {}): Promise<InstallOutcome> {
  // This is the final containment check before writing. Never trust a saved
  // path or Overwolf's "currently running game" result on its own: the latter
  // can point at any active game, not necessarily Valheim.
  if (!(await exists(`${directory}\\valheim.exe`))) throw new Error('valheim-not-found')
  if (!options.force && await isInstallCurrent(directory)) return 'already-current'
  const response = await fetch('/tracking-mod/payload-manifest.json')
  if (!response.ok) throw new Error('payload-missing')
  const manifest = await response.json() as string[]
  const shipped = await readPayloadVersion()
  const running = (await runningValheim()) !== null
  // The loader is shared with other mods and its files may be mapped by Valheim.
  const needsCopy = await Promise.all(manifest.map(async file =>
    file === PLUGIN_ASSEMBLY || !(await exists(directory + '\\' + file.replaceAll('/', '\\'))),
  ))
  const files = manifest.filter((_file, index) => needsCopy[index])

  const directories = new Set(files.map((file) => file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''))
  for (const relativeDirectory of directories) {
    // Creating a marker file first also creates the directory tree; it doubles
    // as the write-permission probe.
    await writeText(
      `${directory}\\${relativeDirectory.replaceAll('/', '\\')}\\${INSTALL_MARKER}`,
      'Installed by Valheim Map.',
    )
  }

  let locked = false
  for (const file of files) {
    const target = `${directory}\\${file.replaceAll('/', '\\')}`
    if (await copyPayloadFile(file, target)) continue
    // A loaded assembly cannot be overwritten while the game runs, and game
    // detection can lag the real process either way — so a DLL that will not
    // copy is always "try again once the game is gone", never an error shown
    // to the player. Any other file gets a few more attempts first.
    if (/\.dll$/i.test(file)) { locked = true; continue }
    let retried = false
    for (let attempt = 0; attempt < 3 && !retried; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)))
      retried = await copyPayloadFile(file, target)
    }
    if (!retried) throw new Error(`copy-failed (${file})`)
  }

  // Pre-create the files the mod writes: the game process may lack permission
  // to create new files under Program Files but can overwrite existing ones.
  const pluginDirectory = `${directory}\\${PLUGIN_SUBDIRECTORY}`
  for (const [name, contents] of [
    ['player-position.json', ''],
    ['base-fallback-request.txt', '\n0'],
    ['base-fallback.json', '{}'],
    ['player-inventory.json', '{"payloadVersion":1,"sharing":false,"updatedAt":0,"items":[]}'],
    ['player-containers.json', '{"payloadVersion":1,"sharing":false,"updatedAt":0,"containers":[],"removed":[]}'],
    ['nearby-creatures.json', '{"payloadVersion":1,"updatedAt":0,"worldName":"","worldUid":"","seedName":"","radius":200,"creatures":[]}'],
  ] as const) {
    if (!(await exists(`${pluginDirectory}\\${name}`))) await writeText(`${pluginDirectory}\\${name}`, contents)
  }

  if (locked) return 'locked-restart-required'
  await writeText(markerPath(directory), JSON.stringify({ ...shipped, installedAt: Date.now() }))
  const needsRestart = running || (await runningValheim()) !== null
  return needsRestart ? 'installed-restart-required' : 'installed'
}

/** Add only our plugin to a manager profile; its BepInEx installation is owned by the manager. */
export async function installTrackingProfile(profile: string, gameDirectory: string): Promise<InstallOutcome> {
  const profileDirectory = await findSelectedTrackingProfile(profile)
  if (!profileDirectory) throw new Error('profile-not-found')
  if (!(await exists(`${gameDirectory}\\valheim.exe`))) throw new Error('valheim-not-found')
  const dataDirectory = `${gameDirectory}\\${PLUGIN_SUBDIRECTORY}`
  const profilePluginDirectory = `${profileDirectory}\\${PLUGIN_SUBDIRECTORY}`
  const profileAssembly = `${profilePluginDirectory}\\ValheimCompanion.PositionBridge.dll`
  const marker = `${profilePluginDirectory}\\${INSTALL_MARKER}`
  const redirect = `${profilePluginDirectory}\\${PROFILE_REDIRECT}`
  const shipped = await readPayloadVersion()
  const installedMarker = await readText(marker)
  const installedRedirect = await readText(redirect)
  if (installedMarker && installedRedirect === dataDirectory && await exists(profileAssembly)) {
    try {
      const installed = JSON.parse(installedMarker) as Partial<PayloadVersion>
      if (installed.fingerprint === shipped.fingerprint) return 'already-current'
    } catch { /* Replace an old or incomplete profile install. */ }
  }

  // Create the plugin folder without changing the manager's BepInEx core.
  await writeText(redirect, dataDirectory)
  const copied = await copyPayloadFile(PLUGIN_ASSEMBLY, profileAssembly)
  if (!copied) return 'locked-restart-required'
  await writeText(marker, JSON.stringify({ ...shipped, installedAt: Date.now() }))
  return (await runningValheim()) ? 'installed-restart-required' : 'installed'
}

/** One payload file into the game folder; false on any failure (never throws). */
const copyPayloadFile = (file: string, target: string) => new Promise<boolean>((resolve) => overwolf.io.copyFile(
  `tracking-mod/payload/${file}`,
  target,
  true,
  false,
  (result) => resolve(Boolean(result.success)),
))

/** FNV-1a 32-bit over UTF-16 code units, matching the mod's checksum. */
const fnv1a = (text: string): number => {
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * The mod (>= 1.5) rewrites the record in place and ends it with `,"h":<fnv1a
 * of everything before>}` so a torn read is detected instead of parsed.
 * Older mods have no hash; their records are trusted as before.
 */
const verifyRecord = (content: string): boolean => {
  const marker = content.lastIndexOf(',"h":')
  if (marker < 0) return true
  const declared = Number(content.slice(marker + 5, content.lastIndexOf('}')))
  return Number.isFinite(declared) && fnv1a(content.slice(0, marker)) === declared
}

export interface PositionRead {
  position: PlayerPosition | null
  /** Why a read produced nothing; `ok` when it did. */
  outcome: 'ok' | 'io-error' | 'empty' | 'torn' | 'invalid'
  /** Wall time the Overwolf read took. */
  durationMs: number
}

export const readPlayerPositionDetailed = (directory: string) => new Promise<PositionRead>((resolve) => {
  const path = `${directory}\\${PLUGIN_SUBDIRECTORY}\\player-position.json`
  const started = performance.now()
  overwolf.io.readFileContents(path, 'UTF8' as overwolf.io.enums.eEncoding, (result) => {
    const durationMs = performance.now() - started
    if (!result.success) return resolve({ position: null, outcome: 'io-error', durationMs })
    if (!result.content) return resolve({ position: null, outcome: 'empty', durationMs })
    if (!verifyRecord(result.content)) return resolve({ position: null, outcome: 'torn', durationMs })
    try {
      const sanitized = result.content.replace(/("(?:cameraHeading|heading)"\s*:\s*)-?[A-Za-z][A-Za-z0-9.]*/g, '$1null')
      const value = JSON.parse(sanitized) as PlayerPosition
      const valid = [value.x, value.y, value.z, value.updatedAt].every(Number.isFinite)
      resolve({ position: valid ? value : null, outcome: valid ? 'ok' : 'invalid', durationMs })
    } catch {
      resolve({ position: null, outcome: 'invalid', durationMs })
    }
  })
})

export const readPlayerPosition = (directory: string) =>
  readPlayerPositionDetailed(directory).then((read) => read.position)
