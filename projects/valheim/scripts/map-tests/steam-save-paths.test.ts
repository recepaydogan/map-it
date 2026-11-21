/// <reference types="@overwolf/types" />
/// <reference lib="dom" />
import assert from 'node:assert/strict'
import test from 'node:test'
import { discoverSteamRoots } from '../../src/lib/valheim/steam-save-paths.ts'
import { discoverValheimCharacters } from '../../src/lib/valheim/world-save-service.ts'

const x86 = 'C:\\Program Files (x86)\\Steam'
const x64 = 'C:\\Program Files\\Steam'
const local = 'C:\\Users\\Player\\AppData\\LocalLow\\IronGate\\Valheim'

function setup(t: test.TestContext, games: object = {}, files: Record<string, string[]> = {}) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'overwolf')
  const visited: string[] = []
  Object.defineProperty(globalThis, 'overwolf', { configurable: true, value: {
    games,
    io: {
      paths: { programFilesX86: 'C:\\Program Files (x86)', programFiles: 'C:\\Program Files', localAppData: 'C:\\Users\\Player\\AppData\\Local' },
      readBinaryFile() {},
      dir(path: string, callback: (result: object) => void) {
        visited.push(path)
        callback(path in files ? { success: true, data: files[path].map(name => ({ name, type: /^\d+$/.test(name) ? 'dir' : 'file' })) } : { success: false })
      },
    },
  } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'overwolf', previous)
    else Reflect.deleteProperty(globalThis, 'overwolf')
  })
  return visited
}

test('missing optional APIs preserve both default Steam locations', async t => {
  setup(t)
  assert.deepEqual(await discoverSteamRoots(), [x86, x64])
})

test('launcher and installed-game paths find custom Steam without confusing another launcher', async t => {
  setup(t, {
    launchers: { getRunningLaunchersInfo: (done: (r: object) => void) => done({ success: true, launchers: [
      { path: 'D:/Clients/Steam/steam.exe' }, { path: 'E:/Other/launcher.exe' },
      { path: 'd:/clients/steam/STEAM.EXE' },
    ] }) },
    getGameInfo: (id: number, done: (r: object) => void) => {
      assert.equal(id, 21668)
      done({ success: true, gameInfo: { LauncherPath: 'D:/Clients/Steam/steam.exe', ProcessPath: 'F:/Library/steamapps/common/Valheim/valheim.exe' } })
    },
  })
  assert.deepEqual(await discoverSteamRoots(), [x86, x64, 'D:\\Clients\\Steam', 'F:\\Library'])
})

test('API exceptions and error results do not disable default discovery', async t => {
  setup(t, {
    launchers: { getRunningLaunchersInfo() { throw new Error('unavailable') } },
    getGameInfo: (_: number, done: (r: object) => void) => done({ success: false }),
  })
  assert.deepEqual(await discoverSteamRoots(), [x86, x64])
})

test('an API that never calls back cannot stall save discovery', async t => {
  setup(t, { launchers: { getRunningLaunchersInfo() {} } })
  assert.deepEqual(await discoverSteamRoots(), [x86, x64])
})

test('local, legacy and default cloud characters survive while custom cloud characters are added', async t => {
  const custom = 'D:\\Clients\\Steam'
  const visited = setup(t, {
    launchers: { getRunningLaunchersInfo: (done: (r: object) => void) => done({ success: true, launchers: [{ path: `${custom}\\steam.exe` }] }) },
  }, {
    [`${local}\\characters_local`]: ['Local.fch', 'Local_backup.fch', 'Local.fch.old'],
    [`${local}\\characters`]: ['Legacy.fch'],
    [`${x86}\\userdata`]: ['11'],
    [`${x86}\\userdata\\11\\892970\\remote\\characters`]: ['Default.fch'],
    [`${custom}\\userdata`]: ['22', '33', 'anonymous'],
    [`${custom}\\userdata\\22\\892970\\remote\\characters`]: ['Cloud.fch'],
    // Account 33 and the x64 default are inaccessible; other results must survive.
  })
  const characters = await discoverValheimCharacters()
  assert.deepEqual(characters.map(file => [file.fileName, file.source]), [
    ['Local', 'local'], ['Legacy', 'local'], ['Default', 'steam-cloud'], ['Cloud', 'steam-cloud'],
  ])
  assert.ok(!visited.some(path => path.includes('anonymous\\')))
  // Character discovery must not require a local or cloud world directory.
  assert.ok(!visited.some(path => path.endsWith('\\worlds')))
})
