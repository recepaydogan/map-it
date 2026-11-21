import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { localizeTalentCatalog } from '../src/features/classes/talent-catalog-localization.ts';
import { applyClassGuideText } from '../src/features/classes/class-guide-localization.ts';
import { createQuestTextDictionary, mergeWowheadQuestProse, getQuestText } from '../src/i18n/quest-text-dictionary.ts';
const audit='data/site-research/hotfix-2026-11-11';
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const staged=process.argv.includes('--stage');
const stageAudit=process.argv.includes('--refinement')?`${audit}/refinement`:audit;
const cr=staged?(await json(`${stageAudit}/content-release.json`)).stage:'public';
const lr=staged?(await json(`${stageAudit}/locales-release.json`)).stage:'public';
const c=p=>json(path.join(cr,p));
const l=p=>json(path.join(lr,p));
const spell=async id=>(await c(`data/spells/foreverdb/${id%64}.json`))[id];
assert.equal((await spell(17364)).cd,8000);
assert.match((await spell(17364)).d,/100% normalized/);
assert.deepEqual((await spell(415140)).rk.map(s=>Number(s.match(/(\d+)%/)[1])),[33,66,100]);
assert.deepEqual((await spell(408498)).rk.map(s=>Number(s.match(/approximately (\d+)/)[1])),[6,7,8,9,10]);
for(const text of (await spell(408498)).rk) assert.match(text,/by 20%/);
assert.doesNotMatch((await spell(17804)).d,/other Affliction/);
assert.match((await spell(1316697)).d,/100% faster/);
assert.equal((await spell(1316697)).ef[0].pl,1.75);
for(const id of [3044,14281,14282,14283,14284,14285,14286,14287,1293241,1293525,1293526,1293527]) assert.deepEqual((await spell(id)).co,[[11,'Mana',1]]);
assert.equal((await spell(1310077)).n,'Holy Power');
for(const id of [409946,415713,410100,416055]) assert.deepEqual(await spell(id),(await json(`${audit}/before/public/data/spells/foreverdb/${id%64}.json`))[id],'Historical rune records must remain unchanged');
const items=(await c('data/items/catalog.json')).items;
for(const [id,price] of [['4390',125],['247754',5]]) assert.equal(items.find(x=>String(x.id)===id).clientDetails.sellPriceCopper,price);
for(const id of ['274387','274388']) assert.equal(items.find(x=>String(x.id)===id).clientDetails.bonding,0);
const rage=(await c('data/items/foreverdb-enrichment.json')).entries[280604];
for(const stats of [rage.stats,rage.current.stats]) {
  assert.equal(stats.find(x=>x.key==='fd-damage').value,'102–154');
  assert.equal(stats.find(x=>x.key==='fd-stat-4').value,'+16');
  assert.ok(!stats.some(x=>x.label==='Intellect'));
}
assert.deepEqual((await c('data/professions/details/enchanting.json')).recipes.find(x=>x.s===1263056).tools,['Runed Golden Rod']);
const quests=(await c('data/quests/quest-details.json')).quests;
assert.match(quests[97968].objective,/Shen'dar/);
const talents=await c('data/classes/talent-calculator.json');
const classes=(await c('data/classes/guides/class-guides.json')).classes;
const questSource=await l('data/locales/wow-forever/quest-text-source.json');
const fallbacks=await l('data/locales/wow-forever/quest-text-app-fallbacks.json');
assert.equal(questSource.provenance.catalogSha256,createHash('sha256').update(await readFile(path.join(cr,'data/quests/quest-details.json'))).digest('hex'));
const guideIndex=await c('data/guides/index.json');
assert.ok(guideIndex.guides.some(x=>x.id==='dawn-waker'));
const source=await l('data/spells/writeups/locales/source.json');
const languages={de:'deDE',es:'esES','es-MX':'esMX',fr:'frFR',ko:'koKR','pt-BR':'ptBR','zh-Hans':'zhCN','zh-Hant':'zhTW'};
for(const [lang,locale] of Object.entries(languages)) {
  const tp=await l(`data/classes/locales/talents-${lang}.json`);
  localizeTalentCatalog(talents.classes,talents.sourceBuild,lang,tp);
  for(const cls of ['Shaman','Warlock']) {
    const key=cls.toLowerCase();
    const bundle={guide:classes[cls],builds:await c(`data/classes/guides/${key}-builds.json`),play:await c(`data/classes/guides/${key}-play.json`),stats:await c('data/classes/guides/stats.json')};
    applyClassGuideText(bundle,(await l(`data/classes/guides/locales/${lang}/${key}.json`)).edits);
  }
  const pack=await l(`data/spells/writeups/locales/${lang}.json`);
  assert.equal(source.strings.length,pack.values.length,`Writeup alignment: ${lang}`);
  const dictionary=createQuestTextDictionary(questSource,await l(`data/locales/wow-forever/quest-text-${locale}.json`),fallbacks.locales[locale]);
  for(const file of [`quest-objective-wowhead-${locale}.json`,`quest-prose-wowhead-${locale}.json`,'quest-prose-wowhead.json']) mergeWowheadQuestProse(dictionary,await l(`data/locales/wow-forever/${file}`),locale);
  assert.notEqual(getQuestText(dictionary,'97968','objective',quests[97968].objective),quests[97968].objective,`Quest objective localized: ${lang}`);
  const index=await l(`data/guides/locales/${lang}/index-v2.json`);
  assert.equal(Object.keys(index.summaries).length,guideIndex.guides.length);
  assert.deepEqual(await l(`data/guides/locales/${lang}/index.json`),await json(`${audit}/before/public/data/guides/locales/${lang}/index.json`),'Legacy guide index preserved');
  const guide=await l(`data/guides/locales/${lang}/dawn-waker.json`);
  assert.equal(guide.headings.length,5);
  assert.ok(guide.html.includes('72.7, 37.2'));
}
const markers=(await c('maps/world-atlas/locations-forever-all-quests.json')).locations;
assert.equal(markers.filter(p=>p.id.startsWith('dawn-waker-')).length,16);
assert.equal(new Set(markers.map(p=>p.id)).size,markers.length);
const search = await c('data/map-search/index.json');
const oldSearch = await json(`${audit}/before/public/data/map-search/index.json`);
assert.deepEqual(search.locations.slice(0, oldSearch.locations.length),oldSearch.locations,'Existing source indices preserved');
for(const pin of markers.filter(p=>p.id.startsWith('dawn-waker-'))) {
  const row=search.locations.find(x=>x.point.id===pin.id);
  assert.deepEqual(row.point,pin);
  assert.ok(row.names.includes('Dawn Waker'));
}
const guide=(await c('data/dungeons/boss-guides.json')).entries;
assert.deepEqual(guide['mapgenie-instance-949862'].bosses.map(b=>b.npcId),['272561','262297','261974']);
for(const id of ['mapgenie-instance-949862','mapgenie-instance-949860']) for(const boss of guide[id].bosses) assert.deepEqual(boss.loot,[],'No inferred loot');
const protectedFiles=await json(`${audit}/excluded-addon-hashes.json`);
for(const [file,hash] of Object.entries(protectedFiles)) assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),hash,`Protected addon modified: ${file}`);
console.log(`Verified ${staged?'frozen CDN stages':'local content'}: mechanics, 8 locale loaders, 16 markers, 4 bosses; ${Object.keys(protectedFiles).length} addon files unchanged.`);
