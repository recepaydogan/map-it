import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const entry = readFileSync(new URL('../../src/windows/uninstall/uninstall-entry.ts', import.meta.url), 'utf8')
const surveyUrl = 'https://docs.google.com/forms/d/e/test-valheim-survey/viewform'
const apiKey = 'phc_test_uninstall'
const preferenceKey = 'valheim-companion:preferences'
const compile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText
const dependencies = new Map([
  ['../../lib/analytics/events', '../../src/lib/analytics/events.ts'],
  ['../../store/preferences', '../../src/store/preferences.ts'],
].map(([specifier, file]) => [specifier, compile(readFileSync(new URL(file, import.meta.url), 'utf8'))]))

// Execute the actual entry and its local dependencies, mocking only host APIs.
// This never reads real localStorage, sends requests, opens tabs, or uninstalls.
async function run(options = {}) {
  const calls = { opened: [], beacons: [], fetches: [], removed: [], warnings: [] }
  const localStorage = {
    getItem(key) {
      if (options.storageThrows) throw new Error('Storage unavailable')
      return key === `ph_${apiKey}_posthog`
        ? (options.identity === undefined ? '{"distinct_id":"existing-user"}' : options.identity)
        : null
    },
    removeItem(key) { calls.removed.push(key) },
  }
  const open = (...args) => {
    if (options.openThrows) throw new Error('Browser unavailable')
    calls.opened.push(args)
  }
  const sandbox = {
    URL, Blob, localStorage,
    console: { warn: (...args) => calls.warnings.push(args) },
    navigator: { sendBeacon: options.beaconMissing ? undefined : (url, blob) => {
      if (options.beaconThrows) throw new Error('Beacon unavailable')
      calls.beacons.push({ url, blob })
      return options.beaconAccepted ?? true
    } },
    fetch: (url, init) => {
      calls.fetches.push({ url, init })
      if (options.fetchThrows) throw new Error('Fetch unavailable')
      return options.fetchRejects ? Promise.reject(new Error('Offline')) : Promise.resolve({ ok: true })
    },
    window: { localStorage, open },
    exports: {},
  }
  if (!options.browserOnly) sandbox.overwolf = { utils: { openUrlInDefaultBrowser: open } }
  sandbox.require = (specifier) => {
    assert.ok(dependencies.has(specifier), `Unexpected import: ${specifier}`)
    const exports = {}
    vm.runInNewContext(dependencies.get(specifier), { ...sandbox, exports })
    return exports
  }
  const env = {
    VITE_POSTHOG_ENABLED: 'true',
    VITE_POSTHOG_KEY: apiKey,
    VITE_POSTHOG_HOST: 'https://analytics.example.test/',
    ...options.env,
  }
  const source = entry
    .replace(/const SURVEY_URL: string = .*?;/, `const SURVEY_URL: string = ${JSON.stringify(options.url ?? surveyUrl)};`)
    .replaceAll('import.meta.env', JSON.stringify(env))
  vm.runInNewContext(compile(source), sandbox)
  await Promise.resolve()
  return calls
}

test('opens the exact survey URL through Overwolf and preserves analytics identity and cleanup', async () => {
  const calls = await run()
  assert.deepEqual(calls.opened, [[surveyUrl]])
  assert.deepEqual(calls.removed, [preferenceKey])
  assert.equal(calls.fetches.length, 0)
  assert.equal(calls.beacons.length, 1)
  assert.equal(calls.beacons[0].url, 'https://analytics.example.test/capture/')
  const payload = JSON.parse(await calls.beacons[0].blob.text())
  assert.equal(payload.event, 'app_uninstalled')
  assert.equal(payload.properties.distinct_id, 'existing-user')
  assert.equal(payload.properties.surface, 'uninstall')
})

test('opens the survey with analytics disabled, absent, or using the example key', async () => {
  for (const env of [
    { VITE_POSTHOG_ENABLED: 'false' },
    { VITE_POSTHOG_KEY: '' },
    { VITE_POSTHOG_KEY: 'phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
  ]) {
    const calls = await run({ env })
    assert.deepEqual(calls.opened, [[surveyUrl]])
    assert.equal(calls.beacons.length + calls.fetches.length, 0)
    assert.deepEqual(calls.removed, [preferenceKey])
  }
})

test('browser-only fallback uses a new tab without opener access', async () => {
  const calls = await run({ browserOnly: true })
  assert.deepEqual(calls.opened, [[surveyUrl, '_blank', 'noopener,noreferrer']])
})

test('empty, placeholder, malformed, and non-web URLs never open', async () => {
  for (const url of ['', '  ', 'YOUR-SURVEY-URL', 'not a url', 'javascript:alert(1)', 'file:///uninstall.html', 'overwolf-extension://test/uninstall.html']) {
    const calls = await run({ url })
    assert.equal(calls.opened.length, 0, url)
    assert.deepEqual(calls.removed, [preferenceKey])
    assert.ok(calls.warnings.length > 0)
  }
})

test('beacon failures fall back to keepalive without delaying survey or cleanup', async () => {
  for (const options of [{ beaconAccepted: false }, { beaconMissing: true }, { beaconThrows: true }]) {
    const calls = await run(options)
    assert.equal(calls.fetches.length, 1)
    assert.equal(calls.fetches[0].init.keepalive, true)
    assert.equal(calls.fetches[0].init.method, 'POST')
    assert.deepEqual(calls.opened, [[surveyUrl]])
    assert.deepEqual(calls.removed, [preferenceKey])
  }
})

test('failed analytics requests cannot interrupt survey or cleanup', async () => {
  for (const options of [{ fetchThrows: true }, { fetchRejects: true }]) {
    const calls = await run({ beaconAccepted: false, ...options })
    assert.deepEqual(calls.opened, [[surveyUrl]])
    assert.deepEqual(calls.removed, [preferenceKey])
  }
})

test('missing, malformed, or inaccessible stored identity does not block survey', async () => {
  for (const options of [
    { identity: null }, { identity: 'invalid json' }, { identity: 'null' },
    { identity: '{"distinct_id":42}' }, { identity: '{"distinct_id":""}' }, { storageThrows: true },
  ]) {
    const calls = await run(options)
    assert.deepEqual(calls.opened, [[surveyUrl]])
    assert.equal(calls.beacons.length + calls.fetches.length, 0)
    assert.deepEqual(calls.removed, [preferenceKey])
  }
})

test('failed browser launch cannot prevent preference cleanup', async () => {
  const calls = await run({ openThrows: true })
  assert.deepEqual(calls.removed, [preferenceKey])
  assert.ok(calls.warnings.length > 0)
})

test('manifest and build retain the invisible uninstall entry', () => {
  const manifest = JSON.parse(readFileSync(new URL('../../public/manifest.json', import.meta.url), 'utf8'))
  assert.equal(manifest.data.uninstall_window.file, 'uninstall.html')
  assert.ok(manifest.data.uninstall_window.required_runtime > 0)
  const html = readFileSync(new URL('../../uninstall.html', import.meta.url), 'utf8')
  assert.match(html, /src="\/src\/windows\/uninstall\/uninstall-entry.ts"/)
  const config = readFileSync(new URL('../../vite.config.ts', import.meta.url), 'utf8')
  assert.match(config, /uninstall: resolve\(__dirname, 'uninstall.html'\)/)
})
