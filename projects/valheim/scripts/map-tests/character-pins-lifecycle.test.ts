import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'
import { resolveCharacterPins } from '../../src/lib/valheim/character-pin-selection.ts'
import type { CharacterSave } from '../../src/lib/valheim/character-save-format.ts'
import type { CharacterPinsState } from '../../src/hooks/use-character-pins.ts'
import { UnsupportedCharacterVersionError, type CharacterCompatibility } from '../../src/lib/valheim/character-compatibility.ts'

// Exercise the real hook's IO effects, including cancellation, with a tiny hook
// host. No browser/Overwolf installation or user save files are required.
function host() {
  const values: unknown[] = []
  const effects: Array<{ deps: unknown[]; cleanup?: () => void }> = []
  const timers = new Map<number, () => void>()
  const intervals = new Map<number, () => void>()
  const listeners = new Map<string, () => void>()
  let compatibility: CharacterCompatibility | null = null
  let compatibilityRequests = 0
  let lastReadCompatibility: CharacterCompatibility | null = null
  const reads: Array<(save: CharacterSave) => void> = []
  const failures: Array<(error: unknown) => void> = []
  let nextTimer = 0
  let stateIndex = 0
  let effectIndex = 0
  let scans = 0
  const history = new Map<string, { name: string; updatedAt: number }>()
  const exports: { useCharacterPins?: (world: string, name: string | null, token: number, lastObserved: null, refreshExploration: boolean) => CharacterPinsState } = {}
  const source = ts.transpileModule(readFileSync(new URL('../../src/hooks/use-character-pins.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  runInNewContext(source, {
    exports,
    window: {
      setTimeout: (fn: () => void) => { timers.set(++nextTimer, fn); return nextTimer },
      clearTimeout: (id: number) => timers.delete(id),
      setInterval: (fn: () => void) => { intervals.set(++nextTimer, fn); return nextTimer },
      clearInterval: (id: number) => intervals.delete(id),
      addEventListener: (event: string, fn: () => void) => listeners.set(event, fn),
      removeEventListener: (event: string) => listeners.delete(event),
    },
    require: (name: string) => {
      if (name === 'react') return {
        useState: (initial: unknown) => {
          const index = stateIndex++
          if (!(index in values)) values[index] = initial
          return [values[index], (next: unknown) => { values[index] = typeof next === 'function' ? next(values[index]) : next }]
        },
        useMemo: (fn: () => unknown) => fn(),
        useEffect: (fn: () => (() => void) | undefined, deps: unknown[]) => {
          const index = effectIndex++
          const old = effects[index]
          if (old && deps.every((dep, i) => Object.is(dep, old.deps[i]))) return
          old?.cleanup?.()
          effects[index] = { deps, cleanup: fn() }
        },
      }
      if (name.includes('character-pin-selection')) return { resolveCharacterPins }
      if (name.includes('character-compatibility-client')) return { characterCompatibility: {
        getSnapshot: () => null,
        refresh: async () => { compatibilityRequests++; return compatibility },
      } }
      if (name.includes('character-compatibility')) return { UnsupportedCharacterVersionError }
      if (name.includes('character-save-recency')) return {
        readLastPlayedCharacter: (world: string) => history.get(world) ?? null,
        rememberPlayedCharacter: (world: string, name: string) => history.set(world, { name, updatedAt: Date.now() }),
      }
      if (name.includes('world-save-service')) return {
        discoverValheimCharacters: async () => { scans++; return [{ id: 'save', fileName: 'save', path: 'save.fch', source: 'local' }] },
        loadValheimCharacter: (_file: unknown, policy: CharacterCompatibility | null) => {
          lastReadCompatibility = policy
          return new Promise<CharacterSave>((resolve, reject) => { reads.push(resolve); failures.push(reject) })
        },
      }
      if (name.includes('save-diagnostics')) return { saveDiagnostic: () => {} }
      if (name.includes('overwolf')) return { isOverwolf: () => true }
      throw new Error(`Unexpected import: ${name}`)
    },
  })
  return {
    render(world: string, name: string | null, token = 0, refreshExploration = false) {
      stateIndex = 0; effectIndex = 0
      return exports.useCharacterPins!(world, name, token, null, refreshExploration)
    },
    async tick() {
      const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn())
      // Drain the async discovery/load/Promise.all chain deterministically.
      for (let i = 0; i < 12; i++) await Promise.resolve()
    },
    complete(name: string, world: string) {
      assert.ok(reads.length)
      failures.shift()
      reads.shift()!({ playerName: name, playerId: name, playerVersion: 47,
        worlds: new Map([[world, { worldUid: world, hasMapData: true, pins: [] }]]) })
    },
    fail(error: unknown) { assert.ok(failures.length); reads.shift(); failures.shift()!(error) },
    get scans() { return scans },
    get compatibilityRequests() { return compatibilityRequests },
    get readCompatibility() { return lastReadCompatibility },
    publish(policy: CharacterCompatibility) { compatibility = policy },
    poll() { intervals.forEach(fn => fn()) },
    focus() { listeners.get('focus')?.() },
    get subscriptions() { return intervals.size + listeners.size },
    dispose() { effects.forEach(effect => effect.cleanup?.()) },
  }
}

test('character and world changes re-read saves; ordinary renders do not; manual choice resets', async () => {
  const h = host()
  h.render('123', 'A'); await h.tick(); h.complete('A', '123'); await h.tick()
  let state = h.render('123', 'A')
  assert.equal(state.characterName, 'A')
  state.selectCharacter('save')
  state = h.render('123', 'A'); await h.tick()
  assert.equal(state.manualCharacterId, 'save')
  assert.equal(h.scans, 1)
  state = h.render('123', 'B')
  assert.equal(state.manualCharacterId, null)
  assert.equal(state.selectedCharacterId, null)
  assert.equal(state.characterName, 'B')
  await h.tick(); h.complete('B', '123'); await h.tick()
  assert.equal(h.render('123', 'B').selectedCharacterId, 'save')
  h.render('456', 'B'); await h.tick(); h.complete('B', '456'); await h.tick()
  assert.equal(h.scans, 3)
  state = h.render('456', 'B'); state.refresh()
  h.render('456', 'B'); await h.tick(); h.complete('B', '456'); await h.tick()
  assert.equal(h.scans, 4)
  h.render('456', 'B', 1); await h.tick()
  assert.equal(h.scans, 5)
  assert.equal(h.compatibilityRequests, 1)
  h.dispose()
})

test('a late load from the previous character cannot overwrite the new character', async () => {
  const h = host()
  h.render('123', 'A'); await h.tick()
  h.render('123', 'B'); await h.tick()
  h.complete('A', '123'); await h.tick()
  assert.equal(h.render('123', 'B').selectedCharacterId, null)
  h.complete('B', '123'); await h.tick()
  assert.equal(h.render('123', 'B').characterName, 'B')
  assert.equal(h.render('123', 'B').selectedCharacterId, 'save')
  h.dispose()
})

test('exploration mode refreshes saved discoveries on focus and polling, then stops when disabled', async () => {
  const h = host()
  h.render('123', 'A', 0, true); await h.tick(); h.complete('A', '123'); await h.tick()
  assert.equal(h.subscriptions, 2)
  assert.equal(h.scans, 1)
  h.poll(); h.render('123', 'A', 0, true); await h.tick()
  assert.equal(h.scans, 2)
  h.complete('A', '123'); await h.tick()
  h.focus(); h.render('123', 'A', 0, true); await h.tick()
  assert.equal(h.scans, 3)
  h.complete('A', '123'); await h.tick()
  h.render('123', 'A', 0, false); await h.tick()
  assert.equal(h.subscriptions, 0)
  assert.equal(h.compatibilityRequests, 1)
  h.dispose()
})

test('compatibility loads once at startup; focus, time and local refresh do not fetch again', async () => {
  const h = host()
  const policy: CharacterCompatibility = { schema_version: 1, revision: 2, parser_profile: 'grouped-stats-v1', compatible_versions: [48] }
  h.publish(policy)
  h.render('123', 'A'); await h.tick(); h.complete('A', '123'); await h.tick()
  h.render('123', 'A'); await h.tick()
  assert.equal(h.scans, 2)
  assert.equal(h.readCompatibility, policy)
  h.complete('A', '123'); await h.tick()
  h.poll(); await h.tick(); h.render('123', 'A'); await h.tick()
  assert.equal(h.scans, 2)
  const revoked = { ...policy, revision: 3, compatible_versions: [] }
  h.publish(revoked); h.focus(); await h.tick(); h.render('123', 'A'); await h.tick()
  assert.equal(h.scans, 2)
  h.render('123', 'A').refresh()
  h.render('123', 'A'); await h.tick()
  assert.equal(h.scans, 3)
  assert.equal(h.readCompatibility, policy)
  assert.equal(h.compatibilityRequests, 1)
  assert.equal(h.subscriptions, 0)
  h.dispose()

  const reopened = host()
  reopened.publish(revoked)
  reopened.render('123', 'A'); await reopened.tick(); reopened.complete('A', '123'); await reopened.tick()
  reopened.render('123', 'A'); await reopened.tick()
  assert.equal(reopened.readCompatibility, revoked)
  assert.equal(reopened.compatibilityRequests, 1)
  reopened.dispose()
})

test('a retained window rechecks an unsupported future format and uses newly approved config', async () => {
  const h = host()
  h.render('123', 'A'); await h.tick(); h.complete('A', '123'); await h.tick()
  const policy: CharacterCompatibility = { schema_version: 1, revision: 2, parser_profile: 'grouped-stats-v1', compatible_versions: [48] }
  h.publish(policy)
  h.render('123', 'B'); await h.tick()
  h.fail(new UnsupportedCharacterVersionError(48)); await h.tick()
  h.render('123', 'B'); await h.tick()
  assert.equal(h.compatibilityRequests, 2)
  assert.equal(h.readCompatibility, policy)
  h.complete('B', '123'); await h.tick()
  assert.equal(h.render('123', 'B').characterName, 'B')
  assert.equal(h.subscriptions, 0)
  h.dispose()
})

test('an unknown format with unchanged config does not rescan in a loop; corrupt and legacy files do not refetch', async () => {
  const h = host()
  h.render('123', 'A'); await h.tick()
  h.fail(new UnsupportedCharacterVersionError(48)); await h.tick()
  h.render('123', 'A'); await h.tick()
  assert.equal(h.compatibilityRequests, 2)
  assert.equal(h.scans, 1)
  h.render('123', 'B'); await h.tick(); h.fail(new Error('truncated save')); await h.tick()
  h.render('123', 'C'); await h.tick(); h.fail(new UnsupportedCharacterVersionError(29)); await h.tick()
  assert.equal(h.compatibilityRequests, 2)
  h.dispose()
})
