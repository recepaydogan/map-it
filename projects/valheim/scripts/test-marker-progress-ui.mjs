import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const runtime = path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const { chromium } = await import(pathToFileURL(runtime).href)
const base = process.env.VALHEIM_QA_URL ?? 'http://127.0.0.1:5185'
const output = path.resolve('artifacts/marker-progress-ui')
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const errors = []
const assertMatchingActions = async page => {
  await page.mouse.move(1200, 50)
  await page.waitForFunction(() => {
    const nodes = [...document.querySelectorAll('[data-map-selection-panel] button[aria-pressed]')]
    return nodes.length === 2 && getComputedStyle(nodes[0]).backgroundColor === getComputedStyle(nodes[1]).backgroundColor
  })
  const buttons = await page.locator('[data-map-selection-panel] button[aria-pressed]').evaluateAll(nodes => nodes.map(node => {
    const bounds = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return { width: bounds.width, height: bounds.height, background: style.backgroundColor, radius: style.borderRadius, font: style.font }
  }))
  assert.equal(buttons.length, 2)
  assert.ok(Math.abs(buttons[0].width - buttons[1].width) < 1, 'Action widths differ')
  assert.equal(buttons[0].height, buttons[1].height, 'Action heights differ')
  assert.equal(buttons[0].background, buttons[1].background, 'Action backgrounds differ')
  assert.equal(buttons[0].radius, buttons[1].radius, 'Action shapes differ')
  assert.equal(buttons[0].font, buttons[1].font, 'Action typography differs')
}
try {
  await context.addInitScript(() => {
    localStorage.setItem('valheim-companion:preferences', JSON.stringify({ language: 'en' }))
  })
  await context.route('**/__marker-progress-qa', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    </script><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';const {createRoot}=ReactDOM;
      import '/src/index.css';import '/src/i18n/index.ts';
      import {PlacementRulesMap} from '/src/components/placement-rules-map.tsx';
      import {FilterRail} from '/src/components/filter-rail.tsx';
      import {WhatsNewSurface} from '/src/features/whats-new/whats-new-surface.tsx';
      import {useMarkerProgress} from '/src/hooks/use-marker-progress.ts';
      import {countLocationProgress,locationProgressId} from '/src/lib/marker-progress.ts';
      import {useCustomMarkerStore} from '/src/store/custom-marker-store.ts';
      import {ALL_BIOME_KEYS} from '/src/lib/valheim/marker-biome-filter.ts';
      const locationRecord={id:'qa-crypt',prefabName:'Crypt2',enabled:true,placement:{biomes:['Black Forest']},contents:null};
      const markers=[300,900].map((x,i)=>({id:'qa-'+i,locationId:locationRecord.id,prefabName:'Crypt2',x,y:0,height:30,zoneX:0,zoneY:0,source:'save'}));
      if(!useCustomMarkerStore.getState().markers.length)useCustomMarkerStore.getState().add({worldKey:'world:qa',x:600,z:500,name:'QA custom marker',category:'type:traders'});
      function QA(){
        const [worldKey,setWorld]=React.useState('world:qa');window.qaSetWorld=setWorld;
        const [selected,setSelected]=React.useState(null);const [active,setActive]=React.useState(['type:dungeons']);
        const progress=useMarkerProgress(worldKey);const counts=countLocationProgress(markers,[locationRecord],progress.found);
        return React.createElement('div',{style:{position:'relative',height:'100vh',width:'100vw'}},
          React.createElement(PlacementRulesMap,{filtersOpen:true,selected,onSelect:(location,marker)=>setSelected({location,marker}),onClearSelection:()=>setSelected(null),
            locations:[locationRecord],visibleLocationIds:new Set(active.includes('type:dungeons')?[locationRecord.id]:[]),seedName:'qa',customMarkerWorldKey:worldKey,
            generatedMarkers:active.includes('type:dungeons')?markers:[],generating:false,loadingWorldSave:false,generationProgress:null,generationError:null,initialZoom:8,cameraKey:'qa-progress'}),
          React.createElement('div',{style:{position:'absolute',left:8,top:12,bottom:12,zIndex:30,display:'flex'}},React.createElement(FilterRail,{
            customMarkerWorldKey:worldKey,activeFilters:new Set(active),selectedBiomes:ALL_BIOME_KEYS,onSetBiomes(){},counts:counts.totals,foundCounts:counts.completed,
            shown:markers.filter(m=>(!progress.hideFound||!progress.found.has(locationProgressId(m)))&&(!progress.hideFavorites||!progress.favorites.has(locationProgressId(m)))).length,
            onToggle:key=>setActive(active.includes(key)?[]:[key]),onSetMany:(keys,on)=>setActive(on?keys:[]),onShowOnly:keys=>setActive(keys),onClose(){}
          })));
      }
      const appRoot=createRoot(document.getElementById('root'));appRoot.render(React.createElement(QA));
      window.qaShowNotes=()=>appRoot.render(React.createElement(WhatsNewSurface,{onClose(){},onOpenMarkerCustomization(){},onOpenCharacterPins(){},onOpenFeedback(){}}));
    </script>` }))
  await context.route('**/src/components/seed-biome-map.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: `
    import React from '/node_modules/.vite/deps/react.js';export function SeedBiomeMap({seedName,onRenderStateChange}){React.useEffect(()=>onRenderStateChange({seedName,status:'ready'}),[seedName,onRenderStateChange]);return React.createElement('div',{style:{position:'absolute',inset:0,background:'#233137'}});}` }))
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') console.error(message.text()) })
  page.setDefaultTimeout(15_000)
  await page.goto(`${base}/__marker-progress-qa`)
  await page.locator('[data-custom-marker]').waitFor()
  assert.equal(await page.getByRole('button', { name: 'Hide found', exact: true }).getAttribute('aria-pressed'), 'false')
  assert.equal(await page.getByTitle('0 found / 2 total').count() > 0, true)
  const marker = page.locator('[data-marker-id="qa-0"]')
  await marker.waitFor()
  await marker.click()
  await assertMatchingActions(page)
  await page.screenshot({ path: path.join(output, 'matching-actions.png') })
  await page.getByRole('button', { name: 'Mark as found', exact: true }).click()
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click()
  await assertMatchingActions(page)
  assert.equal(await marker.getAttribute('data-marker-found'), 'true')
  assert.equal(await marker.getAttribute('data-marker-favorite'), 'true')
  assert.equal(await page.getByTitle('1 found / 2 total').count() > 0, true)
  await page.screenshot({ path: path.join(output, 'found-favorite.png') })

  await page.getByRole('button', { name: 'Hide found', exact: true }).click()
  await marker.waitFor({ state: 'detached' })
  assert.equal(await page.getByTitle('1 found / 2 total').count() > 0, true, 'Hide found changed total progress')
  // A selected detail stays available so a hidden mark can be undone.
  await page.getByRole('button', { name: 'Found', exact: true }).click()
  await marker.waitFor()
  await page.getByRole('button', { name: 'Hide favorites', exact: true }).click()
  await marker.waitFor({ state: 'detached' })
  await page.getByRole('button', { name: 'Hide found', exact: true }).click()
  await page.getByRole('button', { name: 'Hide favorites', exact: true }).click()
  await marker.waitFor()
  await page.getByRole('button', { name: 'Mark as found', exact: true }).click()
  await page.reload()
  await marker.waitFor()
  assert.equal(await marker.getAttribute('data-marker-found'), 'true')
  assert.equal(await marker.getAttribute('data-marker-favorite'), 'true')

  await page.evaluate(() => window.qaSetWorld('world:other'))
  await page.waitForFunction(() => !document.querySelector('[data-marker-found]'))
  assert.equal(await page.getByTitle('0 found / 2 total').count() > 0, true)
  await page.evaluate(() => window.qaSetWorld('world:qa'))
  await page.waitForFunction(() => document.querySelector('[data-marker-found]'))
  await page.locator('[data-custom-marker]').click()
  await page.getByRole('button', { name: 'Mark as found', exact: true }).click()
  await page.getByRole('button', { name: 'Add to favorites', exact: true }).click()
  assert.equal(await page.getByTitle('1 found / 1 total').count() > 0, true)
  await page.getByRole('button', { name: 'Hide favorites', exact: true }).click()
  await page.locator('[data-custom-marker]').waitFor({ state: 'detached' })
  await page.screenshot({ path: path.join(output, 'hidden-favorites.png') })

  const other = await context.newPage()
  await other.goto(`${base}/__marker-progress-qa`)
  await other.getByRole('button', { name: 'Hide favorites', exact: true }).waitFor()
  assert.equal(await other.getByRole('button', { name: 'Hide favorites', exact: true }).getAttribute('aria-pressed'), 'true')
  await other.getByRole('button', { name: 'Hide favorites', exact: true }).click()
  await page.locator('[data-custom-marker]').waitFor()
  await other.close()
  // All supported languages must fit without horizontal overflow.
  for (const language of ['en', 'ru', 'zh-Hans', 'pt-BR']) {
    await page.evaluate(async language => { const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage(language) }, language)
    assert.equal(await page.locator('aside').first().evaluate(node => node.scrollWidth <= node.clientWidth), true, language)
    await assertMatchingActions(page)
    await page.screenshot({ path: path.join(output, `filters-${language}.png`) })
  }
  await page.evaluate(() => window.qaShowNotes())
  await page.locator('#whats-new-v413').waitFor()
  for (const language of ['en', 'ru', 'zh-Hans', 'pt-BR']) {
    await page.evaluate(async language => { const {default:i18n}=await import('/src/i18n/index.ts');await i18n.changeLanguage(language) }, language)
    const release = page.locator('article').first()
    assert.equal(await release.locator('h2').getAttribute('id'), 'whats-new-v413')
    assert.equal(await release.locator('li').count(), 2)
    await page.screenshot({ path: path.join(output, `whats-new-${language}.png`) })
  }
  assert.deepEqual(errors, [])
  console.log('PASS: real marker actions and badges, found/total counters, intersecting hide switches, undo while hidden, reload persistence, world isolation, custom markers, cross-window sync and four-language layout; no browser errors.')
} catch (error) {
  console.error('Browser errors:', errors)
  const page = context.pages()[0]
  if (page) await page.screenshot({ path: path.join(output, 'failure.png') })
  throw error
} finally {
  await browser.close()
}
