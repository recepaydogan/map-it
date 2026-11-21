/// <reference types="@overwolf/types" />
/// <reference lib="dom" />
import assert from 'node:assert/strict'
import test from 'node:test'
import { installPathAnalyticsProperties } from '../../src/lib/analytics/install-path.ts'
import {
  findValheimDirectory,
  findRunningTrackingProfile,
  findSelectedTrackingProfile,
  installTrackingMod,
  installTrackingProfile,
  installLocationObserver,
  installLocalExploration,
  runningValheimProcessId,
  parseSteamLibraryFolders,
  profileDirectoryFromValheimCommandLine,
} from '../../src/lib/live-tracking/tracking-installer.ts'

const steamX86 = 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Valheim'
const steamX64 = 'C:\\Program Files\\Steam\\steamapps\\common\\Valheim'
const customSteam = 'R:\\My Games\\steamapps\\common\\Valheim'
const xboxD = 'D:\\XboxGames\\Valheim\\Content'

function setup(
  t: test.TestContext,
  existing: readonly string[],
  files: Readonly<Record<string, string>> = {},
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'overwolf')
  const existingPaths = new Set(existing.map((path) => path.toLowerCase()))
  const fileContents = new Map(Object.entries(files).map(([path, contents]) => [path.toLowerCase(), contents]))
  const visited: string[] = []
  Object.defineProperty(globalThis, 'overwolf', { configurable: true, value: {
    games: {
      getRunningGameInfo: (done: (result: object) => void) => done({ success: true, isRunning: false }),
      getGameInfo: (_id: number, done: (result: object) => void) => done({ success: false }),
      launchers: {
        getRunningLaunchersInfo: (done: (result: object) => void) => done({ success: true, launchers: [] }),
      },
    },
    io: {
      enums: { eEncoding: { UTF8: 'UTF8' } },
      paths: {
        programFilesX86: 'C:\\Program Files (x86)',
        programFiles: 'C:\\Program Files',
      },
      fileExists: (path: string, done: (result: object) => void) => {
        visited.push(path)
        done({ success: true, found: existingPaths.has(path.toLowerCase()) })
      },
      readFileContents: (path: string, _encoding: unknown, done: (result: object) => void) => {
        const content = fileContents.get(path.toLowerCase())
        done(content === undefined ? { success: false } : { success: true, content })
      },
    },
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'overwolf', previous)
    else Reflect.deleteProperty(globalThis, 'overwolf')
  })
  return visited
}

test('parses current and legacy Steam library registry entries', () => {
  assert.deepEqual(parseSteamLibraryFolders(String.raw`
    "path" "R:\\My Games"
    "2" "S:\\LegacyLibrary"
    "892970" "123456"
  `), ['R:\\My Games', 'S:\\LegacyLibrary'])
})

test('analytics paths retain the install location without exposing a Windows username', () => {
  assert.deepEqual(installPathAnalyticsProperties('C:/Users/Alice/Games/Valheim/'), {
    install_directory: 'C:\\Users\\<user>\\Games\\Valheim',
    executable_path: 'C:\\Users\\<user>\\Games\\Valheim\\valheim.exe',
  })
  assert.deepEqual(installPathAnalyticsProperties('D:\\XboxGames\\Valheim\\Content'), {
    install_directory: 'D:\\XboxGames\\Valheim\\Content',
    executable_path: 'D:\\XboxGames\\Valheim\\Content\\valheim.exe',
  })
})

test('uses the Steam default before scanning Xbox drives', async (t) => {
  const visited = setup(t, [
    `${steamX86}\\valheim.exe`,
    `${xboxD}\\valheim.exe`,
  ])

  assert.deepEqual(await findValheimDirectory(null), {
    directory: steamX86,
    running: false,
    source: 'default_install',
  })
  assert.deepEqual(visited, [`${steamX86}\\valheim.exe`])
})

test('finds an Xbox app install on a non-system drive after Steam misses', async (t) => {
  const visited = setup(t, [`${xboxD}\\valheim.exe`])

  assert.deepEqual(await findValheimDirectory(null), {
    directory: xboxD,
    running: false,
    source: 'xbox_install',
  })
  assert.deepEqual(visited.slice(0, 2), [
    `${steamX86}\\valheim.exe`,
    `${steamX64}\\valheim.exe`,
  ])
  assert.ok(visited.includes(`${xboxD}\\valheim.exe`))
})

test('finds Valheim through Steam libraryfolders.vdf before trying Xbox', async (t) => {
  const xboxExecutable = `${xboxD}\\valheim.exe`
  const visited = setup(t, [`${customSteam}\\valheim.exe`, xboxExecutable], {
    'C:\\Program Files (x86)\\Steam\\steamapps\\libraryfolders.vdf': String.raw`
      "libraryfolders"
      {
        "1" { "path" "R:\\My Games" }
      }
    `,
  })

  assert.deepEqual(await findValheimDirectory(null), {
    directory: customSteam,
    running: false,
    source: 'steam_library',
  })
  assert.ok(!visited.includes(xboxExecutable))
})

test('finds a conventional SteamLibrary on another drive without VDF access', async (t) => {
  const directory = 'S:\\SteamLibrary\\steamapps\\common\\Valheim'
  setup(t, [`${directory}\\valheim.exe`])

  assert.deepEqual(await findValheimDirectory(null), {
    directory,
    running: false,
    source: 'steam_library',
  })
})

test('does not accept an Xbox directory without Valheim.exe', async (t) => {
  setup(t, ['D:\\XboxGames\\Valheim\\Content\\not-valheim.exe'])
  await assert.rejects(findValheimDirectory(null), /valheim-not-found/)
})

test('accepts a mod-manager profile root or its BepInEx folder, but not the game folder', async (t) => {
  const profile = 'C:\\Users\\Alice\\Profiles\\Modded'
  setup(t, [
    `${profile}\\BepInEx\\core\\BepInEx.dll`,
    `${steamX86}\\BepInEx\\core\\BepInEx.dll`,
    `${steamX86}\\valheim.exe`,
  ])
  assert.equal(await findSelectedTrackingProfile(profile), profile)
  assert.equal(await findSelectedTrackingProfile(`${profile}\\BepInEx`), profile)
  assert.equal(await findSelectedTrackingProfile(steamX86), null)
})

test('extracts the active profile from quoted and unquoted Valheim launch arguments', () => {
  const profile = 'C:\\Users\\Alice\\Thunderstore Mod Manager\\Valheim\\profiles\\My Mods'
  const preloader = `${profile}\\BepInEx\\core\\BepInEx.Preloader.dll`
  assert.equal(profileDirectoryFromValheimCommandLine(
    `"${steamX86}\\valheim.exe" --doorstop-enabled true --doorstop-target-assembly "${preloader}" --r2profile "My Mods"`,
  ), profile)
  assert.equal(profileDirectoryFromValheimCommandLine(
    `valheim.exe --doorstop-target=${preloader} --r2profile My Mods`,
  ), profile)
  assert.equal(profileDirectoryFromValheimCommandLine('valheim.exe --doorstop-enabled false'), null)
  assert.equal(profileDirectoryFromValheimCommandLine('valheim.exe --doorstop-target "C:\\Other\\file.dll"'), null)
})

test('auto-detects only a running Valheim profile with BepInEx', async (t) => {
  const profile = 'C:\\Users\\Alice\\Profiles\\Modded'
  setup(t, [`${profile}\\BepInEx\\core\\BepInEx.dll`])
  const gameInfo = {
    success: true,
    isRunning: true,
    classId: 21668,
    executionPath: `${steamX86}\\valheim.exe`,
    commandLine: `valheim.exe --doorstop-target "${profile}\\BepInEx\\core\\BepInEx.Preloader.dll"`,
  }
  Object.assign(overwolf.games, { getRunningGameInfo: (done: (result: object) => void) => done(gameInfo) })
  assert.equal(await findRunningTrackingProfile(), profile)
  gameInfo.classId = 99999
  assert.equal(await findRunningTrackingProfile(), null)
})

test('installing the bridge during gameplay leaves the existing loader alone and reports a restart', async t => {
  const companion = 'BepInEx/plugins/ValheimCompanion'
  const bridge = companion + '/ValheimCompanion.PositionBridge.dll'
  const lockedLoader = ['BepInEx/core/0Harmony.dll', 'BepInEx/core/BepInEx.dll', 'BepInEx/core/BepInEx.pdb']
  const missingLoader = 'BepInEx/core/Mono.Cecil.dll'
  const pathOf = (file: string) => steamX86 + '\\' + file.replaceAll('/', '\\')
  const marker = pathOf(companion + '/.valheim-companion-install')
  const shipped = { fingerprint: 'test-fingerprint', bytes: 1 }
  setup(t, [pathOf('valheim.exe'), ...lockedLoader.map(pathOf)], { [marker]: JSON.stringify(shipped) })
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  globalThis.fetch = async url => new Response(JSON.stringify(
    url === '/tracking-mod/payload-manifest.json' ? [...lockedLoader, missingLoader, bridge] : shipped,
  ))
  Object.assign(overwolf.games, {
    getRunningGameInfo: (done: (result: object) => void) => done({
      success: true, isRunning: true, classId: 21668, processId: 101, executionPath: pathOf('valheim.exe'),
    }),
  })
  const copied: string[] = []
  const writes = new Map<string, string>()
  Object.assign(overwolf.io, {
    writeFileContents: (path: string, contents: string, _encoding: unknown, _append: unknown, done: (result: object) => void) => {
      writes.set(path, contents)
      done({ success: true })
    },
    copyFile: (_source: string, target: string, _overwrite: unknown, _confirm: unknown, done: (result: object) => void) => {
      copied.push(target)
      done({ success: !lockedLoader.map(pathOf).includes(target) })
    },
  })
  assert.equal(await installTrackingMod(steamX86), 'installed-restart-required')
  assert.deepEqual(copied, [pathOf(missingLoader), pathOf(bridge)])
  assert.equal(JSON.parse(writes.get(marker)!).fingerprint, shipped.fingerprint)
})

test('profile install copies only the bridge and points it at the game data directory', async (t) => {
  const profile = 'C:\\Users\\Alice\\Profiles\\Modded'
  setup(t, [`${profile}\\BepInEx\\core\\BepInEx.dll`, `${steamX86}\\valheim.exe`])
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  globalThis.fetch = async () => new Response(JSON.stringify({ fingerprint: 'test-fingerprint', bytes: 1 }))
  const writes: Array<[string, string]> = []
  const copies: Array<[string, string]> = []
  Object.assign(overwolf.io, {
    writeFileContents: (path: string, contents: string, _encoding: unknown, _append: unknown, done: (result: object) => void) => {
      writes.push([path, contents])
      done({ success: true })
    },
    copyFile: (source: string, target: string, _overwrite: unknown, _confirm: unknown, done: (result: object) => void) => {
      copies.push([source, target])
      done({ success: true })
    },
  })

  assert.equal(await installTrackingProfile(`${profile}\\BepInEx`, steamX86), 'installed')
  assert.deepEqual(copies, [[
    'tracking-mod/payload/BepInEx/plugins/ValheimCompanion/ValheimCompanion.PositionBridge.dll',
    `${profile}\\BepInEx\\plugins\\ValheimCompanion\\ValheimCompanion.PositionBridge.dll`,
  ]])
  assert.ok(writes.some(([path, contents]) =>
    path === `${profile}\\BepInEx\\plugins\\ValheimCompanion\\companion-data-directory.txt`
    && contents === `${steamX86}\\BepInEx\\plugins\\ValheimCompanion`))
})

test('observer installation adds only its own DLL in the game and selected profile', async t => {
  const profile = 'C:\\Users\\Alice\\Profiles\\Modded'
  setup(t, [`${profile}\\BepInEx\\core\\BepInEx.dll`, `${steamX86}\\valheim.exe`])
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  globalThis.fetch = async () => new Response(JSON.stringify({ fingerprint: 'observer-v1', bytes: 1 }))
  const copies: Array<[string, string]> = []
  Object.assign(overwolf.io, {
    writeFileContents: (_path: string, _contents: string, _encoding: unknown, _append: unknown, done: (result: object) => void) => done({ success: true }),
    copyFile: (source: string, target: string, _overwrite: unknown, _confirm: unknown, done: (result: object) => void) => {
      copies.push([source, target]); done({ success: true })
    },
  })
  assert.equal(await installLocationObserver(steamX86, profile), 'installed')
  assert.deepEqual(copies, [steamX86, profile].map(root => [
    'tracking-mod/payload/BepInEx/plugins/ValheimCompanion/ValheimCompanion.LocationObserver.dll',
    `${root}\\BepInEx\\plugins\\ValheimCompanion\\ValheimCompanion.LocationObserver.dll`,
  ]))
})

test('a current observer never recopies the DLL or replaces Position Bridge', async t => {
  const root = `${steamX86}\\BepInEx\\plugins\\ValheimCompanion`
  setup(t, [`${steamX86}\\valheim.exe`, `${root}\\ValheimCompanion.LocationObserver.dll`, `${root}\\client-locations.json`], {
    [`${root}\\.client-location-observer-install`]: JSON.stringify({ fingerprint: 'observer-v1' }),
  })
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  globalThis.fetch = async () => new Response(JSON.stringify({ fingerprint: 'observer-v1', bytes: 1 }))
  Object.assign(overwolf.io, { copyFile: () => assert.fail('Current observer must not be copied') })
  assert.equal(await installLocationObserver(steamX86, null), 'already-current')
})

test('local exploration installs only its separate DLL, without touching either existing plugin or the client observation file', async t => {
  const profile = 'C:\\Users\\Alice\\Profiles\\Modded'
  setup(t, [`${profile}\\BepInEx\\core\\BepInEx.dll`, `${steamX86}\\valheim.exe`])
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  globalThis.fetch = async url => {
    assert.equal(url, '/tracking-mod/local-exploration-version.json')
    return new Response(JSON.stringify({ fingerprint: 'local-v1', bytes: 1 }))
  }
  const copies: Array<[string, string]> = []
  const writes: string[] = []
  Object.assign(overwolf.io, {
    writeFileContents: (path: string, _contents: string, _encoding: unknown, _append: unknown, done: (result: object) => void) => { writes.push(path); done({ success: true }) },
    copyFile: (source: string, target: string, _overwrite: unknown, _confirm: unknown, done: (result: object) => void) => { copies.push([source, target]); done({ success: true }) },
  })
  assert.equal(await installLocalExploration(steamX86, profile), 'installed')
  assert.deepEqual(copies, [steamX86, profile].map(root => [
    'tracking-mod/payload/BepInEx/plugins/ValheimCompanion/ValheimCompanion.LocalExploration.dll',
    `${root}\\BepInEx\\plugins\\ValheimCompanion\\ValheimCompanion.LocalExploration.dll`,
  ]))
  assert.ok(writes.every(path => path.endsWith('\\.local-exploration-install')))
})

test('local exploration repairs a missing DLL despite a matching marker and skips a complete installation', async t => {
  const root = `${steamX86}\\BepInEx\\plugins\\ValheimCompanion`
  setup(t, [`${steamX86}\\valheim.exe`], { [`${root}\\.local-exploration-install`]: JSON.stringify({ fingerprint: 'local-v1' }) })
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  globalThis.fetch = async () => new Response(JSON.stringify({ fingerprint: 'local-v1', bytes: 1 }))
  let copies = 0
  Object.assign(overwolf.io, {
    writeFileContents: (_path: string, _contents: string, _encoding: unknown, _append: unknown, done: (result: object) => void) => done({ success: true }),
    copyFile: (_source: string, _target: string, _overwrite: unknown, _confirm: unknown, done: (result: object) => void) => { copies++; done({ success: true }) },
  })
  assert.equal(await installLocalExploration(steamX86, null), 'installed')
  assert.equal(copies, 1)
  Object.assign(overwolf.io, { fileExists: (_path: string, done: (result: object) => void) => done({ success: true, found: true }) })
  assert.equal(await installLocalExploration(steamX86, null), 'already-current')
  assert.equal(copies, 1)
})

for (const copySucceeds of [true, false]) {
  test(`observer installed during gameplay reports ${copySucceeds ? 'restart required' : 'locked and restart required'}`, async t => {
    setup(t, [`${steamX86}\\valheim.exe`])
    const previousFetch = globalThis.fetch
    t.after(() => { globalThis.fetch = previousFetch })
    globalThis.fetch = async () => new Response(JSON.stringify({ fingerprint: 'observer-v1', bytes: 1 }))
    Object.assign(overwolf.games, {
      getRunningGameInfo: (done: (result: object) => void) => done({
        success: true, isRunning: true, classId: 21668, processId: 101, executionPath: `${steamX86}\\valheim.exe`,
      }),
    })
    Object.assign(overwolf.io, {
      writeFileContents: (_path: string, _contents: string, _encoding: unknown, _append: unknown, done: (result: object) => void) => done({ success: true }),
      copyFile: (_source: string, _target: string, _overwrite: unknown, _confirm: unknown, done: (result: object) => void) => done({ success: copySucceeds }),
    })
    assert.equal(await installLocationObserver(steamX86, null), copySucceeds ? 'installed-restart-required' : 'locked-restart-required')
    assert.equal(await runningValheimProcessId(), 101)
  })
}
