import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { build } from 'esbuild';

const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import i18next from 'i18next';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import Marker from './src/features/worlds/world-structure-marker';
import { useWorldKnowledgeCatalogs } from './src/features/worlds/use-world-knowledge-catalogs';
window.runRenderChecks = async () => {
  const check = (condition, message) => { if (!condition) throw Error(message); };
  const i18n = i18next.createInstance();
  await i18n.use(initReactI18next).init({ lng: 'en', fallbackLng: 'en', resources: {
    en: { translation: { structureMap: { types: { village: 'Village' }, marker: '{{name}} {{x}} {{z}}', cluster: '{{name}} {{count}}' } } },
    fr: { translation: { structureMap: { types: { village: 'Village FR' }, marker: '{{name}} {{x}} {{z}}', cluster: '{{name}} {{count}}' } } },
  }});
  let translations = 0, clicks = [];
  const original = i18n.t.bind(i18n); i18n.t = (...args) => { translations++; return original(...args); };
  const div = document.createElement('div'); document.body.append(div); const root = createRoot(div);
  const appearance = { color: '#fff', icon: 'home', markerScale: 1, iconScale: 1 };
  const activate = (...args) => clicks.push(args);
  const props = { id: 'one', type: 'village', left: 20, top: 30, width: 1000, count: 1, x: 4, z: 5,
    selected: false, interactive: true, appearance, onActivate: activate, targetX: 4, targetZ: 5, targetZoom: null };
  const render = (child) => flushSync(() => root.render(React.createElement(I18nextProvider, { i18n }, child)));
  render(React.createElement(Marker, props));
  div.querySelector('button').click(); check(clicks.length === 1 && clicks[0][0] === 'one', 'single marker activation');
  const first = translations; render(React.createElement(Marker, { ...props }));
  check(translations === first, 'unchanged telemetry must not translate static markers again');
  render(React.createElement(Marker, { ...props, x: 10, selected: true }));
  check(div.querySelector('button').getAttribute('aria-label').includes('10'), 'coordinate label updates');
  check(div.querySelector('button').getAttribute('aria-pressed') === 'true', 'selection updates');
  render(React.createElement(Marker, { ...props, count: 3, targetZoom: 2 }));
  div.querySelector('button').click(); check(clicks.at(-1)[3] === 2, 'cluster activation uses current target');
  render(React.createElement(Marker, { ...props, interactive: false }));
  const count = clicks.length; div.querySelector('button').click(); check(clicks.length === count, 'passive minimap marker');
  await i18n.changeLanguage('fr'); render(React.createElement(Marker, props));
  check(div.querySelector('button').getAttribute('aria-label').includes('FR'), 'language changes bypass memoization');
  await i18n.changeLanguage('en');
  const measure = Component => {
    const children = () => Array.from({ length: 200 }, (_, n) => React.createElement(Component, { ...props, key: n, id: String(n), left: n }));
    render(children()); translations = 0; const start = performance.now();
    for (let n = 0; n < 20; n++) render(children());
    return { ms: performance.now() - start, translations };
  };
  const before = measure(Marker.type), after = measure(Marker);
  check(before.translations >= 8000 && after.translations === 0, 'static marker translation work is eliminated');
  window.catalogProbe = { loads: 0, aborts: 0, mechanics: 0, recipes: 0 };
  function Catalog({ world, source }) { useWorldKnowledgeCatalogs(world.id, world.edition, source.version, source); return null; }
  const source = { edition: 'fixture', version: '1', itemIdentity: {}, recipeIdentity: {} };
  render(React.createElement(Catalog, { world: { id: 'world', edition: 'fixture' }, source }));
  for (let n = 0; n < 20; n++) render(React.createElement(Catalog, { world: { id: 'world', edition: 'fixture', personal: { resume: { x: n } } }, source }));
  check(window.catalogProbe.loads === 1 && window.catalogProbe.aborts === 0, 'position persistence must not reload or abort catalogs');
  check(window.catalogProbe.mechanics === 1 && window.catalogProbe.recipes === 1, 'built-in catalogs retain identity');
  render(React.createElement(Catalog, { world: { id: 'world', edition: 'fixture' }, source: { ...source, version: '2' } }));
  check(window.catalogProbe.loads === 2 && window.catalogProbe.aborts === 1, 'version change replaces catalog request');
  flushSync(() => root.unmount()); div.remove();
  check(window.catalogProbe.aborts === 2, 'unmount aborts pending request');
  return { checks: 12, before, after, catalogs: window.catalogProbe };
};`;
const mocks = {
  'remote-knowledge-catalog': `export const loadRemoteKnowledgeCatalogs = ({ signal }) => { window.catalogProbe.loads++; return new Promise((resolve, reject) => { signal.addEventListener('abort', () => { window.catalogProbe.aborts++; reject(new DOMException('Aborted', 'AbortError')); }); }); };`,
  'built-in-mechanics-catalog': `export const resolveBuiltInMechanicsCatalog = () => { window.catalogProbe.mechanics++; return null; };`,
  'built-in-recipe-catalog': `export const resolveBuiltInRecipeCatalog = () => { window.catalogProbe.recipes++; return null; };`,
};
const bundle = await build({ stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true,
  write: false, format: 'iife', platform: 'browser', jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
  plugins: [{ name: 'catalog-fixtures', setup(b) {
    b.onResolve({ filter: /\/(remote-knowledge-catalog|built-in-mechanics-catalog|built-in-recipe-catalog)$/ }, args => ({ path: args.path.split('/').at(-1), namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ contents: mocks[args.path], loader: 'js' }));
  }}] });
const browser = process.env.CHROME_BIN ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const server = createServer(); await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const port = server.address().port; await new Promise(ok => server.close(ok));
const profile = await mkdtemp(join(tmpdir(), 'map-render-check-'));
const child = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let ws;
try {
  let targets;
  for (let n = 0; n < 100; n++) { try { targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json(); break; } catch { await new Promise(ok => setTimeout(ok, 100)); } }
  assert.ok(targets?.length, 'Test browser must start');
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((ok, reject) => { ws.onopen = ok; ws.onerror = reject; });
  let id = 0; const pending = new Map();
  ws.onmessage = event => { const r = JSON.parse(event.data); if (r.id) { const p = pending.get(r.id); pending.delete(r.id); r.error ? p.reject(Error(JSON.stringify(r.error))) : p.resolve(r.result); } };
  const call = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  const installed = await call('Runtime.evaluate', { expression: bundle.outputFiles[0].text });
  assert.equal(installed.exceptionDetails, undefined, JSON.stringify(installed.exceptionDetails));
  const result = await call('Runtime.evaluate', { expression: 'runRenderChecks()', awaitPromise: true, returnByValue: true });
  assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
  console.log(JSON.stringify(result.result.value, null, 2));
  await call('Browser.close');
} finally { ws?.close(); child.kill(); }
