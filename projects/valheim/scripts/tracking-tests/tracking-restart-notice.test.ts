import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { syncTrackingRestartNotice } from '../../src/lib/live-tracking/tracking-restart-notice.ts'
import { useAppToastStore as store } from '../../src/store/app-toast-store.ts'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} } })
test.beforeEach(() => { storage.clear(); store.setState({ toasts: [] }) })

test('installing the observer during gameplay creates a sticky restart warning', () => {
  assert.equal(syncTrackingRestartNotice(['already-current', 'already-current', 'installed-restart-required'], 101), true)
  assert.equal(store.getState().toasts.length, 1)
  assert.equal(store.getState().toasts[0].kind, 'tracker-restart-required')
  assert.equal(store.getState().toasts[0].sticky, true)
})

test('a second install check or duplicate game-start event cannot clear the warning', () => {
  syncTrackingRestartNotice(['installed-restart-required'], 101)
  const originalId = store.getState().toasts[0].id
  assert.equal(syncTrackingRestartNotice(['already-current', 'already-current', 'already-current'], 101), true)
  assert.equal(store.getState().toasts.length, 1)
  assert.equal(store.getState().toasts[0].id, originalId)
})

test('reopening the app while the same game runs restores the warning from storage', () => {
  syncTrackingRestartNotice(['installed-restart-required'], 101)
  store.setState({ toasts: [] })
  assert.equal(syncTrackingRestartNotice(['already-current'], 101), true)
  assert.equal(store.getState().toasts[0].sticky, true)
})

test('a new Valheim process clears the warning even if the app missed game exit', () => {
  syncTrackingRestartNotice(['installed-restart-required'], 101)
  assert.equal(syncTrackingRestartNotice(['already-current'], 202), false)
  assert.deepEqual(store.getState().toasts, [])
  assert.equal(storage.size, 0)
})

test('installation before launch needs no warning and game exit clears an existing warning', () => {
  assert.equal(syncTrackingRestartNotice(['installed'], null), false)
  assert.deepEqual(store.getState().toasts, [])
  syncTrackingRestartNotice(['installed-restart-required'], 101)
  assert.equal(syncTrackingRestartNotice(['already-current'], null), false)
  assert.equal(storage.size, 0)
  assert.deepEqual(store.getState().toasts, [])
})

test('a locked plugin warns; an unchanged installation does not warn unnecessarily', () => {
  assert.equal(syncTrackingRestartNotice(['already-current'], 101), false)
  assert.deepEqual(store.getState().toasts, [])
  assert.equal(syncTrackingRestartNotice(['locked-restart-required'], 101), true)
  assert.equal(store.getState().toasts[0].kind, 'tracker-restart-required')
})

test('the actual toast UI renders the Valheim restart instruction and dismiss button', async t => {
  // Render the production component with React; no browser or game is started.
  const directory = await mkdtemp(join(tmpdir(), 'valheim-toast-test-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const bundled = await build({
    stdin: { contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { createInstance } from 'i18next';
      import { I18nextProvider } from 'react-i18next';
      import { AppToastList } from './src/components/app-toasts.tsx';
      export async function render(toasts, translations) {
        const i18n = createInstance();
        await i18n.init({ lng: 'en', resources: { en: { translation: translations } }, initImmediate: false });
        return renderToStaticMarkup(React.createElement(I18nextProvider, { i18n },
          React.createElement(AppToastList, { toasts, onDismiss: () => {} })));
      }
    `, resolveDir: resolve('.'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', write: false,
  })
  const path = join(directory, 'render.cjs')
  await writeFile(path, bundled.outputFiles[0].contents)
  const { render } = createRequire(import.meta.url)(path)
  const translations = JSON.parse(await readFile('src/i18n/locales/en.json', 'utf8'))
  syncTrackingRestartNotice(['installed-restart-required'], 101)
  const html: string = await render(store.getState().toasts, translations)
  assert.ok(html.includes('Restart Valheim to finish'))
  assert.ok(html.includes('Restart Valheim once to activate them.'))
  assert.match(html, /<button[^>]+aria-label="Dismiss notification"/)
  assert.ok(html.includes('aria-live="polite"'))
  assert.equal(await render([], translations), '')
})
