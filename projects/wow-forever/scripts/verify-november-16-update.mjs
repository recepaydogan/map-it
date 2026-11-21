/** Focused data-contract verification; does not load or test the addon. */
import assert from 'node:assert/strict';
import { readFile, access, writeFile } from 'node:fs/promises';
import { createGameDictionary } from '../src/i18n/game-dictionary.ts';
import { createQuestTextDictionary, mergeWowheadQuestProse } from '../src/i18n/quest-text-dictionary.ts';
import { applyClassGuideText } from '../src/features/classes/class-guide-localization.ts';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const base='public/data/locales/wow-forever/';
const languages={de:'deDE',es:'esES','es-MX':'esMX',fr:'frFR',ko:'koKR','pt-BR':'ptBR','zh-Hans':'zhCN','zh-Hant':'zhTW'};
const [source,qs,qf,common,classes,stats]=await Promise.all([base+'source.json',base+'quest-text-source.json',base+'quest-text-app-fallbacks.json',base+'quest-prose-wowhead.json','public/data/classes/guides/class-guides.json','public/data/classes/guides/stats.json'].map(read));
let guidePacks=0;
for(const [language,locale] of Object.entries(languages)) {
  createGameDictionary(source,await read(base+locale+'.json'));
  const dictionary=createQuestTextDictionary(qs,await read(base+`quest-text-${locale}.json`),qf.locales[locale]);
  for(const pack of [await read(base+`quest-objective-wowhead-${locale}.json`),await read(base+`quest-prose-wowhead-${locale}.json`),common]) mergeWowheadQuestProse(dictionary,pack,locale);
  for(const id of ['druid','mage','paladin','priest','shaman','warlock','warrior']) {
    const root='public/data/classes/guides/';
    const bundle={guide:classes.classes[id[0].toUpperCase()+id.slice(1)],play:await read(root+id+'-play.json'),builds:await read(root+id+'-builds.json'),stats};
    const localized=applyClassGuideText(bundle,(await read(root+`locales/${language}/${id}.json`)).edits);
    assert.notEqual(localized.guide.specs[0].forever,bundle.guide.specs[0].forever);
    guidePacks++;
  }
  const ui=await read(`src/i18n/locales/${language}.json`);
  assert.equal(Object.keys(ui.map.november16Notes).length,16);
  assert(!ui.map.gatherableTypes['ore-heavy-thorium-vein'].startsWith('['));
}
const inventory=await read('data/site-research/marker-audit-2026-11-16/local-marker-inventory.json');
const maps=await Promise.all(inventory.files.map(f=>read('public/maps/world-atlas/'+f)));
const points=maps.flatMap(d=>d.locations);
assert.equal(new Set(points.map(p=>p.id)).size,points.length,'Duplicate active marker IDs');
const quests=(await read('public/data/quests/quest-details.json')).quests;
const newPoints=points.filter(p=>p.id.startsWith('forever-20261116'));
for(const p of newPoints){assert(Number.isFinite(p.x)&&Number.isFinite(p.y));if(p.iconPath)await access('public/'+p.iconPath);for(const q of p.questOffers??[])assert(quests[q.id]);}
assert(!newPoints.some(p=>p.entityId==='165189'));
assert.equal(points.filter(p=>p.subtype==='ore-heavy-thorium-vein').length,85);
assert.equal(points.filter(p=>p.subtype==='fish-whimsyfin').length,17);
const catalog=(await read('public/data/items/catalog.json')).items;
assert.equal(new Set(catalog.map(i=>i.id)).size,catalog.length);
for(const i of catalog.filter(i=>i.source==='wowhead-2026-11-16'))await access('public/'+i.icon);
const band=catalog.find(i=>i.id==='272407');assert(!band.sections.flatMap(s=>s.stats).some(s=>s.label==='Hit Rating'));
const ring=catalog.find(i=>i.id==='272406');assert(ring.sections.flatMap(s=>s.stats).some(s=>s.label==='Spell Power'&&s.value==='+9'));
for(const id of [408120,1238214,1238215])assert.equal((await read(`public/data/spells/foreverdb/${id%64}.json`))[id].sp,.066);
for(const e of (await read('public/data/rares/details.json')).entries)assert(['rare','rare-elite'].includes(e.classification));
const report={gameLocalePacks:8,questLocaleMerges:8,classGuideLocalePacks:guidePacks,newObservationMarkers:newPoints.length,markerIdentityAndIcons:'passed',itemAndSpellHotfixes:'passed'};
await writeFile('data/site-research/update-2026-11-16/verification.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
