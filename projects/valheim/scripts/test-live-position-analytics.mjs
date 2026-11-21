import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const events = {
  LIVE_POSITION_CONNECTED: 'live_position_connected',
  LIVE_POSITION_MISSING: 'live_position_missing',
}
let now = 1_000_000
let nextTimerId = 1
let directoryFailure = null
let read = { position: null, outcome: 'empty', durationMs: 1 }
let readBarrier = null
let captures = []
const timeouts = new Map()
const intervals = new Map()

const windowMock = {
  setTimeout: (callback, delay) => {
    const id = nextTimerId++
    timeouts.set(id, { callback, delay })
    return id
  },
  clearTimeout: (id) => timeouts.delete(id),
  setInterval: (callback, delay) => {
    const id = nextTimerId++
    intervals.set(id, { callback, delay })
    return id
  },
  clearInterval: (id) => intervals.delete(id),
}

const source = await readFile(
  new URL('../src/lib/live-tracking/live-position-analytics.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const exports = {}
runInNewContext(compiled, {
  exports,
  require: (name) => ({
    '../analytics/analytics': {
      track: (event, properties) => captures.push({ event, properties }),
    },
    '../analytics/events': { EVENTS: events },
    '../../store/preferences': {
      readPreferences: () => ({ trackingInstallDirectory: 'C:\\Valheim' }),
    },
    './tracking-installer': {
      findValheimDirectory: async () => {
        if (directoryFailure) throw new Error(directoryFailure)
        return { directory: 'C:\\Valheim', running: true }
      },
      readPlayerPositionDetailed: async () => {
        if (readBarrier) await readBarrier
        return read
      },
    },
  })[name] ?? require(name),
  window: windowMock,
  Date: { now: () => now },
})

const settle = () => new Promise((resolve) => setImmediate(resolve))
const firstTimeout = () => [...timeouts.values()][0]
const firstInterval = () => [...intervals.values()][0]
const freshPosition = { x: 10, y: 20, z: 30, updatedAt: now - 100 }

// A fresh first sample reports success once and stops both session timers.
read = { position: freshPosition, outcome: 'ok', durationMs: 1 }
let cleanup = exports.startLivePositionAnalytics()
await settle()
assert.equal(captures.length, 1)
assert.equal(captures[0].event, events.LIVE_POSITION_CONNECTED)
assert.equal(captures[0].properties.wait_seconds, 0)
assert.equal(captures[0].properties.after_missing, false)
assert.equal(captures[0].properties.read_outcome, 'ok')
assert.equal(timeouts.size, 0)
assert.equal(intervals.size, 0)
cleanup()

// The pre-created but untouched position file identifies a mod that is not writing.
captures = []
read = { position: null, outcome: 'empty', durationMs: 1 }
cleanup = exports.startLivePositionAnalytics()
await settle()
const missingTimer = firstTimeout()
assert.equal(missingTimer.delay, 120_000)
missingTimer.callback()
assert.equal(captures[0].event, events.LIVE_POSITION_MISSING)
assert.equal(captures[0].properties.reason, 'tracker_not_writing')
assert.equal(captures[0].properties.last_read_outcome, 'empty')
assert.equal(captures[0].properties.install_directory_known, true)
cleanup()

// Directory discovery failures remain separately filterable in PostHog.
captures = []
directoryFailure = 'valheim-not-found'
cleanup = exports.startLivePositionAnalytics()
await settle()
firstTimeout().callback()
assert.equal(captures[0].properties.reason, 'game_directory_not_found')
assert.equal(captures[0].properties.install_directory_known, false)
cleanup()
directoryFailure = null

// A fix arriving after the grace window is marked as a recovered setup.
captures = []
read = { position: null, outcome: 'io-error', durationMs: 1 }
cleanup = exports.startLivePositionAnalytics()
await settle()
firstTimeout().callback()
now += 121_000
read = { position: { ...freshPosition, updatedAt: now - 100 }, outcome: 'ok', durationMs: 1 }
firstInterval().callback()
await settle()
assert.equal(captures.length, 2)
assert.equal(captures[0].properties.reason, 'position_file_unreadable')
assert.equal(captures[1].event, events.LIVE_POSITION_CONNECTED)
assert.equal(captures[1].properties.after_missing, true)
cleanup()

// Ending the game session suppresses an in-flight read that completes afterward.
captures = []
let releaseRead
readBarrier = new Promise((resolve) => { releaseRead = resolve })
cleanup = exports.startLivePositionAnalytics()
cleanup()
releaseRead()
await settle()
assert.equal(captures.length, 0)
readBarrier = null

console.log('Live-position analytics tests passed: connected, reasoned missing, directory failure, late recovery, and cleanup.')
