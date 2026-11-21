import assert from 'node:assert/strict'
import fs from 'node:fs'
import { runInNewContext } from 'node:vm'
import ts from 'typescript'

const source = fs.readFileSync(new URL('../src/lib/analytics/analytics.ts', import.meta.url), 'utf8')
const eventSource = fs.readFileSync(new URL('../src/lib/analytics/events.ts', import.meta.url), 'utf8')
const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText
const eventModule = { exports: {} }
runInNewContext(compile(eventSource), eventModule)
const { EVENTS } = eventModule.exports
let config
const calls = []
const wire = []
const posthog = {
  init(_key, options) { config = options },
  capture(event, properties) {
    calls.push(JSON.parse(JSON.stringify({ event, properties })))
    const payload = config.before_send({ event, uuid: 'event-id', $set: { private: 'not needed' }, $set_once: { private: 'not needed' }, properties: {
      token: 'test-token', distinct_id: 'test-id', $cookieless_mode: 'never', $process_person_profile: false,
      $browser: 'Edge', $current_url: 'overwolf-extension://private/index.html', $session_id: 'session',
      $set: { private: 'not needed' }, $set_once: { private: 'not needed' },
      ...properties,
    } })
    wire.push(JSON.parse(JSON.stringify(payload)))
  },
}
const module = { exports: {} }
runInNewContext(compile(source.replaceAll('import.meta.env', 'environment')), {
  ...module,
  require: name => {
    if (name === 'posthog-js') return { default: posthog }
    if (name === './events') return { EVENTS }
    if (name === './app-context') return {
      readAppVersion: async () => '4.1.2', readScreenContext: async () => ({ screen_count: 2 }),
    }
    throw new Error(`Unexpected runtime import: ${name}`)
  },
  environment: { VITE_POSTHOG_ENABLED: 'true', VITE_POSTHOG_KEY: 'phc_test' },
  setTimeout() {}, console,
})
const analytics = module.exports
analytics.trackSpoilerModeChanged('full', 'personal')
assert.equal(calls.length, 0, 'Disabled analytics captured a change')
analytics.initAnalytics('desktop')
analytics.setAnalyticsContext({ world_name: 'private', character: 'private', surface: 'desktop', screen_count: 2 })
for (const from of ['full', 'terrain', 'personal']) for (const to of ['full', 'terrain', 'personal']) {
  const count = calls.length
  analytics.trackSpoilerModeChanged(from, to)
  if (from === to) {
    assert.equal(calls.length, count, 'An unchanged selection emitted an event')
    continue
  }
  assert.deepEqual(calls.at(-1), { event: 'map_spoiler_mode_changed', properties: { from, to } })
  assert.deepEqual(wire.at(-1).properties, {
    from, to, token: 'test-token', distinct_id: 'test-id', $cookieless_mode: 'never', $process_person_profile: false,
  }, 'Spoiler events must discard all optional SDK/environment properties')
  assert.equal(wire.at(-1).$set, undefined)
  assert.equal(wire.at(-1).$set_once, undefined)
}
assert.equal(calls.length, 6, 'Every actual transition must emit exactly once')
const other = { event: 'existing_event', properties: { anything: 'preserved' } }
assert.equal(config.before_send(other), other, 'Other events changed')
assert.equal(config.before_send(null), null, 'An event dropped by the SDK pipeline must stay dropped')
await new Promise(resolve => setImmediate(resolve))
analytics.track('existing_event', { feature: 'existing' })
assert.equal(calls.at(-1).properties.world_name, 'private', 'The existing event context changed')
assert.equal(calls.at(-1).properties.feature, 'existing')
console.log('PASS: six spoiler transitions, duplicate/disabled suppression, from/to-only custom data, optional SDK metadata removed, unrelated events unchanged.')
