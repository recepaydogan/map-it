import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import sharp from 'sharp'

const runtime = path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')
const { chromium } = await import(pathToFileURL(runtime).href)
const base = process.env.VALHEIM_QA_URL ?? 'http://127.0.0.1:5184'
const output = path.resolve('artifacts/local-exploration-ui')
fs.mkdirSync(output, { recursive: true })
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
const errors = []
const page = await context.newPage()
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(15_000)
const packed = (positions) => {
  const bits = Buffer.alloc(2048 * 2048 / 8)
  for (const [x, z] of positions) {
    // Reveal a few cells around each target so icons fit inside the mask.
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const index = (1024 + z / 12 + dy) * 2048 + 1024 + x / 12 + dx
      bits[index >> 3] |= 1 << (index & 7)
    }
  }
  return gzipSync(bits).toString('base64')
}
try {
  await context.addInitScript(() => {
    if (!localStorage.getItem('valheim-companion:map-filters')) localStorage.setItem('valheim-companion:map-filters', JSON.stringify({version:8,state:{showSpoilers:false,selectedBiomes:[],activeFilterKeys:['type:camps']}}))
  })
  // The production reader and renderer run together against an isolated,
  // in-memory Overwolf filesystem. No installed plugin or save is modified.
  await context.route('**/__exploration-qa', route => route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
  </script><script type="module">
    import React from '/node_modules/.vite/deps/react.js'; const {useState}=React;
    import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'; const {createRoot}=ReactDOM;
    import '/src/index.css'; import '/src/i18n/index.ts';
    import {PlacementRulesMap} from '/src/components/placement-rules-map.tsx';
    import {useLocalExploration} from '/src/hooks/use-local-exploration.ts';
    import {useCustomMarkerStore} from '/src/store/custom-marker-store.ts';
    import {useMapFilterStore} from '/src/store/map-filter-store.ts';
    import {MapSpoilerControl} from '/src/components/map-spoiler-control.tsx';
    import {OnboardingTour} from '/src/features/onboarding/onboarding-tour.tsx';
    import {useOnboarding} from '/src/features/onboarding/use-onboarding.ts';
    import {CharacterSelector} from '/src/components/character-selector.tsx';
    localStorage.setItem('valheim-companion:onboarded-v1','1');
    window.qaInitialMode=useMapFilterStore.getState().spoilerMode;
    window.qaInitialFilters={biomes:useMapFilterStore.getState().selectedBiomes,locations:useMapFilterStore.getState().activeFilterKeys};
    localStorage.setItem('valheim-companion:preferences', JSON.stringify({language:'en',trackingInstallDirectory:'C:\\\\QA',positionTrackingEnabled:false}));
    window.qaWire={payloadVersion:1,isLocal:true,worldUid:'123',worldName:'World',seedName:'Seed',characterId:'42',characterName:'A',textureSize:2048,pixelSize:12,personalGzip:${JSON.stringify(packed([[0, 0]]))}};
    window.qaReads=0;
    window.qaRefreshes=0;
    window.overwolf={io:{enums:{eEncoding:{UTF8:'UTF8'}},readFileContents(_path,_encoding,callback){window.qaReads++;setTimeout(()=>callback({success:true,content:JSON.stringify({...window.qaWire,updatedAt:Date.now()})}),5)}}};
    const pins=[{name:'PERSONAL_PIN',x:0,z:0,height:30,type:'icon1',ownerId:'42',checked:false},{name:'HIDDEN_PIN',x:300,z:0,height:30,type:'icon1',ownerId:'42',checked:false}];
    const chest=(id,x)=>({id,x,z:0,y:30,prefab:'piece_chest_wood',name:id,owner:'own',creator:'42',private:false,loaded:true,items:[],worldUid:'123',updatedAt:Date.now()});
    if(!useCustomMarkerStore.getState().markers.length){
      useCustomMarkerStore.getState().add({worldKey:'world:123',x:0,z:0,name:'PERSONAL_CUSTOM',category:'star'});
      useCustomMarkerStore.getState().add({worldKey:'world:123',x:300,z:0,name:'HIDDEN_CUSTOM',category:'star'});
    }
    function QA(){
      const mode=useMapFilterStore(s=>s.spoilerMode);const restricted=mode!=='full';
      const [character,setCharacter]=useState('A'); const [remote,setRemote]=useState(false);const [intro,setIntro]=useState(false);
      window.qaSetRestricted=value=>useMapFilterStore.getState().setSpoilerMode(value?'personal':'full');
      window.qaSetCharacter=setCharacter;window.qaSetRemote=setRemote;window.qaStartIntro=setIntro;window.qaStartTour=()=>useOnboarding.getState().start();
      const live=useLocalExploration(restricted&&!remote,{uid:'123',name:'World',seedName:'Seed',characterId:character==='A'?'42':'43',characterName:character,manualCharacter:false},false);
      const exploration=restricted&&!remote?live.exploration:undefined;
      return React.createElement('div',{id:'tour-boundary',style:{position:'relative',width:'100vw',height:'100vh'}},React.createElement(PlacementRulesMap,{
        exploration,showUnexploredTerrain:!remote&&mode==='terrain',explorationContext:intro?character+'-123':undefined,
        filtersOpen:false,selected:null,onSelect(){},onClearSelection(){},locations:[],visibleLocationIds:new Set(),seedName:'QA',customMarkerWorldKey:'world:123',
        generatedMarkers:[],generating:false,loadingWorldSave:false,generationProgress:null,generationError:null,initialZoom:12,cameraKey:'qa',
        playerPins:pins,visiblePinTypes:new Set(['icon1']),translatePinToken:()=>null,
        resourcePoints:[{x:0,z:0,nodePrefab:'Copper',label:'PERSONAL_RESOURCE'},{x:300,z:0,nodePrefab:'Copper',label:'HIDDEN_RESOURCE'}],
        resourceAreas:[{key:'ore',label:'Ore',color:'#71808f',points:[{x:0,z:0},{x:300,z:0}]}],
        structurePaths:['M-20,-20h40v40h-40z M280,-20h40v40h-40z'],
        nearbyCreatures:[{id:'personal',prefab:'Boar',name:'PERSONAL_CREATURE',x:0,z:0,y:30,level:1,tamed:false},{id:'hidden',prefab:'Boar',name:'HIDDEN_CREATURE',x:300,z:0,y:30,level:1,tamed:false}],
        containers:{list:[chest('PERSONAL_CHEST',0),chest('HIDDEN_CHEST',300)],live:true,containerName:token=>token,itemFor:()=>null}
      }),React.createElement('div',{'data-map-identity-controls':true,style:{position:'absolute',top:12,left:12,zIndex:50,display:'flex',gap:8}},
        React.createElement('button',{'data-tour':'world',type:'button',style:{height:36,padding:'0 12px',background:'var(--overlay-background)',borderRadius:'var(--radius-full)',color:'var(--text)'}},'World'),
        React.createElement(CharacterSelector,{characters:[{id:'42',name:'A'},{id:'43',name:'B'}],characterName:character,activeCharacterName:null,selectedCharacterId:character==='A'?'42':'43',loading:false,unavailable:false,onSelect:id=>setCharacter(id==='43'?'B':'A'),onRefresh:()=>window.qaRefreshes++})),
        !remote&&React.createElement('div',{style:{position:'absolute',bottom:12,left:12,zIndex:50}},React.createElement(MapSpoilerControl,{mode,characterName:character,hint:'Spoiler controls',onChange:mode=>useMapFilterStore.getState().setSpoilerMode(mode)})),React.createElement(OnboardingTour));
    }
    createRoot(document.getElementById('root')).render(React.createElement(QA));
  </script>` }))
  await context.route('**/src/components/seed-biome-map.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: `import React from '/node_modules/.vite/deps/react.js'; export function SeedBiomeMap({seedName,onRenderStateChange}){React.useEffect(()=>onRenderStateChange({seedName,status:'ready'}),[seedName,onRenderStateChange]);return React.createElement('div',{'data-qa-terrain':true,style:{position:'absolute',inset:0,background:'#517a81'}})}` }))
  await page.goto(`${base}/__exploration-qa`, { waitUntil: 'domcontentloaded' })
  await page.getByTitle(/PERSONAL_PIN/).waitFor()
  assert.equal(await page.evaluate(()=>window.qaInitialMode),'personal','Legacy spoiler-off preference did not migrate')
  assert.deepEqual(await page.evaluate(()=>window.qaInitialFilters),{biomes:[],locations:['type:camps']},'Upgrading changed existing map filters')
  const characterButton=page.getByRole('button',{name:'Character',exact:true})
  assert.equal(await page.locator('[data-map-identity-controls] [data-character-selector]').count(),1)
  await characterButton.click()
  await page.getByRole('button',{name:'Reload character saves',exact:true}).click()
  assert.equal(await page.evaluate(()=>window.qaRefreshes),1)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByTitle(/HIDDEN_PIN/).count(), 0)
  assert.equal(await page.getByRole('button', { name: 'HIDDEN_CHEST', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: /HIDDEN_RESOURCE/ }).count(), 0)
  assert.equal(await page.getByRole('button', { name: /HIDDEN_CREATURE/ }).count(), 0)
  assert.ok(await page.locator('[data-exploration-layers]').evaluate(node => getComputedStyle(node).maskImage.includes('svg')))
  const screenshot = await page.screenshot({ path: path.join(output, 'personal-layers.png') })
  const samples = await page.locator('[data-map-circle]').evaluate(node => {
    const bounds = node.getBoundingClientRect()
    return [[36,36],[240,120]].map(([x,z]) => ({ x: Math.floor(bounds.left + (0.5 + x/21000) * bounds.width), y: Math.floor(bounds.top + (0.5 - z/21000) * bounds.height) }))
  })
  const { data: pixels, info } = await sharp(screenshot).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const rgb = ({ x,y }) => [...pixels.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 3)]
  assert.ok(Math.max(...rgb(samples[1])) < 45, 'Unexplored terrain or geometry escaped the fog')
  assert.ok(Math.max(...rgb(samples[0])) > 60, 'Personal terrain remained hidden')
  const chooseMode = async label => {
    await page.getByRole('button', {name:'Show spoilers',exact:true}).click()
    await page.getByRole('menuitemradio', {name:label}).click()
  }
  await chooseMode(/^Spoilers: Terrain only/)
  assert.equal(await page.locator('[data-exploration-fog]').count(), 0)
  assert.equal(await page.locator('[data-exploration-terrain]').evaluate(node=>getComputedStyle(node).maskImage),'none')
  assert.ok(await page.locator('[data-exploration-layers]').evaluate(node=>getComputedStyle(node).maskImage.includes('svg')))
  assert.equal(await page.getByTitle(/HIDDEN_PIN/).count(),0)
  assert.equal(await page.getByRole('button',{name:'HIDDEN_CHEST',exact:true}).count(),0)
  await page.screenshot({path:path.join(output,'terrain-only.png')})
  await page.reload({waitUntil:'domcontentloaded'})
  await page.getByTitle(/PERSONAL_PIN/).waitFor()
  assert.equal(await page.evaluate(()=>window.qaInitialMode),'terrain','Terrain preference did not survive reload')
  assert.equal(await page.getByTitle(/HIDDEN_PIN/).count(),0)
  await chooseMode(/^Spoilers: On/)
  await page.getByTitle(/HIDDEN_PIN/).waitFor()
  assert.equal(await page.locator('[data-exploration-layers]').evaluate(node=>getComputedStyle(node).maskImage),'none')
  await chooseMode(/^Spoilers: Off/)
  await page.waitForFunction(()=>!document.querySelector('[title^="HIDDEN_PIN"]'))
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('valheim-companion:map-filters')).state.spoilerMode),'personal')
  // Keyboard operation and the dedicated onboarding step use the real menu.
  await page.getByRole('button',{name:'Show spoilers',exact:true}).focus()
  await page.keyboard.press('ArrowDown')
  await page.getByRole('menu').waitFor()
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('menu').count(),0)
  await page.evaluate(()=>window.qaStartTour())
  for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight')
  await page.getByRole('heading',{name:'Choose how much to reveal'}).waitFor()
  assert.ok((await page.getByRole('dialog').innerText()).includes('bottom-left spoiler menu'))
  await page.screenshot({path:path.join(output,'spoilers-onboarding.png')})
  await page.keyboard.press('Escape')
  await page.evaluate(gzip => { window.qaWire.personalGzip = gzip }, packed([[0, 0], [300, 0]]))
  await page.getByTitle(/HIDDEN_PIN/).waitFor()
  await page.getByRole('button', { name: 'HIDDEN_CHEST', exact: true }).waitFor()
  await page.screenshot({ path: path.join(output, 'live-discovery.png') })
  // A different character cannot inherit A's still-fresh file.
  await page.getByRole('button',{name:'Character',exact:true}).click()
  await page.getByRole('option',{name:'B',exact:true}).click()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-exploration-layers]')).visibility === 'hidden')
  assert.equal(await page.getByTitle(/PERSONAL_PIN/).count(), 0)
  await page.evaluate(gzip => { Object.assign(window.qaWire, { characterId:'43',characterName:'B',personalGzip:gzip }) }, packed([[300, 0]]))
  await page.getByTitle(/HIDDEN_PIN/).waitFor()
  assert.equal(await page.getByTitle(/PERSONAL_PIN/).count(), 0)
  await page.evaluate(()=>window.qaStartIntro(true))
  await page.locator('[data-personal-exploration-hint]').waitFor()
  const transform = () => page.locator('[data-map-stage]').evaluate(node=>node.style.transform)
  const initialTransform=await transform()
  assert.ok(Number(/scale\(([^)]+)\)/.exec(initialTransform)?.[1])>12,'Small initial exploration was not framed')
  await page.screenshot({path:path.join(output,'new-character-framing.png')})
  await page.locator('[data-map-viewport]').hover()
  await page.getByRole('button',{name:'Zoom out',exact:true}).click()
  const manualTransform=await transform()
  assert.notEqual(manualTransform,initialTransform)
  await page.evaluate(gzip=>{window.qaWire.personalGzip=gzip},packed([[300,0],[600,0]]))
  await page.waitForTimeout(1200)
  assert.equal(await transform(),manualTransform,'A live discovery overrode the user camera')
  await page.locator('[data-personal-exploration-hint]').getByRole('button').click()
  await page.evaluate(()=>window.qaStartIntro(false))
  await page.waitForFunction(()=>!document.querySelector('[data-personal-exploration-hint]'))
  await page.evaluate(()=>window.qaStartIntro(true))
  await page.waitForTimeout(100)
  assert.equal(await page.locator('[data-personal-exploration-hint]').count(),0)
  assert.equal(await transform(),manualTransform,'Reopening a personal view lost the chosen camera')
  // Remote/unrestricted rendering takes the original data path; polling stops.
  await page.evaluate(() => window.qaSetRemote(true))
  await page.getByTitle(/PERSONAL_PIN/).waitFor()
  assert.equal(await page.locator('[data-exploration-fog]').count(), 0)
  assert.equal(await page.locator('[data-exploration-layers]').evaluate(node => getComputedStyle(node).maskImage), 'none')
  const reads = await page.evaluate(() => window.qaReads)
  await page.waitForTimeout(1200)
  assert.equal(await page.evaluate(() => window.qaReads), reads)
  await page.evaluate(()=>window.qaStartTour())
  for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight')
  await page.getByRole('heading',{name:'Choose how much to reveal'}).waitFor()
  assert.ok((await page.getByRole('dialog').innerText()).includes('Select a local world save'))
  await page.keyboard.press('Escape')
  await page.evaluate(() => window.qaSetRemote(false))
  await page.getByTitle(/HIDDEN_PIN/).waitFor()
  await page.evaluate(async () => {
    const {readPreferences,writePreferences}=await import('/src/store/preferences.ts')
    writePreferences({...readPreferences(),positionTrackingEnabled:true})
  })
  await page.waitForTimeout(1200)
  await page.evaluate(async () => {
    const {readPreferences,writePreferences}=await import('/src/store/preferences.ts')
    writePreferences({...readPreferences(),positionTrackingEnabled:false})
  })
  const previousMask = await page.locator('[data-exploration-terrain]').evaluate(node=>node.style.maskImage)
  const activeReads = await page.evaluate(() => window.qaReads)
  await page.evaluate(gzip=>{window.qaWire.personalGzip=gzip},packed([[300,0],[600,0],[900,0]]))
  await page.waitForFunction(mask=>document.querySelector('[data-exploration-terrain]').style.maskImage!==mask,previousMask)
  assert.ok(await page.evaluate(() => window.qaReads) > activeReads,'Local exploration stopped with position tracking disabled')
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('valheim-companion:preferences')).positionTrackingEnabled),false)
  assert.deepEqual(errors, [])
  console.log('PASS: three persisted spoiler modes, terrain/marker separation, onboarding, small-character framing, preserved manual camera, live discoveries, character isolation and unchanged remote rendering. Screenshots:', output)
} catch (error) { console.error('Browser errors:', errors); throw error }
finally { await browser.close() }
