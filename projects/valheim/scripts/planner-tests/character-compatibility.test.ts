import assert from 'node:assert/strict'
import { test } from 'node:test'
import { characterLayoutVersion, createCharacterCompatibilityStore, parseCharacterCompatibility } from '../../src/lib/valheim/character-compatibility.ts'

const config = (versions = [47, 48], revision = 1) => ({
  schema_version: 1 as const, revision, parser_profile: 'grouped-stats-v1' as const, compatible_versions: versions,
})

test('exact allowlist never admits intermediate or unknown versions; built-in support remains offline', () => {
  assert.equal(characterLayoutVersion(49, config([49])), 47)
  assert.throws(() => characterLayoutVersion(48, config([49])), /Unsupported/)
  assert.throws(() => characterLayoutVersion(48, null), /Unsupported/)
  for (let v = 30; v <= 47; v++) assert.equal(characterLayoutVersion(v, null), v)
  assert.equal(characterLayoutVersion(47, config([])), 47)
})

test('invalid schema, profile, revision, version types and oversized lists are rejected', () => {
  for (const value of [null, {}, { ...config(), schema_version: 2 }, { ...config(), parser_profile: 'unimplemented' },
    { ...config(), revision: 0 }, { ...config(), compatible_versions: ['48'] }, config([48.5]), config([46]),
    config([2147483648]), config(Array(129).fill(48))]) {
    assert.equal(parseCharacterCompatibility(value), null)
  }
  assert.deepEqual(parseCharacterCompatibility(config([49, 47, 49]))?.compatible_versions, [47, 49])
})

test('validated cache survives offline startup, invalid responses, blocked storage and request timeouts', async () => {
  let remote: unknown = config([49], 2)
  let fail = true
  const store = createCharacterCompatibilityStore({
    readCache: () => config(),
    writeCache: () => { throw new Error('storage blocked') },
    fetchRemote: async () => { if (fail) throw new Error('offline'); return remote },
  })
  const cached = store.getSnapshot()
  assert.equal(await store.refresh(), cached)
  fail = false
  remote = { ...config(), parser_profile: 'unknown' }
  assert.equal(await store.refresh(true), cached)
  remote = config([49], 2)
  assert.deepEqual((await store.refresh(true))?.compatible_versions, [49])

  let signal: AbortSignal | undefined
  const timed = createCharacterCompatibilityStore({
    readCache: () => config(), writeCache: () => {}, timeoutMs: 5,
    fetchRemote: s => { signal = s; return new Promise(() => {}) },
  })
  assert.deepEqual((await timed.refresh())?.compatible_versions, [47, 48])
  assert.equal(signal?.aborted, true)

  const badCache = createCharacterCompatibilityStore({
    readCache: () => ({ ...config(), schema_version: 2 }), writeCache: () => {},
    fetchRemote: async () => { throw new Error('offline') },
  })
  assert.equal(await badCache.refresh(), null)
})

test('concurrent character scans share one request, unchanged results preserve identity, refreshes are throttled', async () => {
  let resolve!: (value: unknown) => void
  let calls = 0
  let time = 0
  let writes = 0
  const store = createCharacterCompatibilityStore({
    readCache: () => null, writeCache: () => { writes++ }, now: () => time,
    fetchRemote: () => { calls++; return new Promise(r => { resolve = r }) },
  })
  const a = store.refresh(), b = store.refresh()
  assert.equal(a, b)
  resolve(config())
  const first = await a
  assert.equal(calls, 1)
  assert.equal(await store.refresh(), first)
  assert.equal(calls, 1)
  time = 60_000
  const next = store.refresh()
  resolve(config([48, 47]))
  assert.equal(await next, first)
  assert.equal(writes, 1)
})

test('a newer list can revoke a future format and replace the offline cache; stale revisions cannot restore it', async () => {
  let remote = config([], 3)
  let saved: unknown
  const store = createCharacterCompatibilityStore({
    readCache: () => config([48], 2), writeCache: v => { saved = v }, fetchRemote: async () => remote,
  })
  const revoked = await store.refresh()
  assert.throws(() => characterLayoutVersion(48, revoked), /Unsupported/)
  assert.deepEqual(saved, config([], 3))
  remote = config([48], 2)
  assert.equal(await store.refresh(true), revoked)
})
