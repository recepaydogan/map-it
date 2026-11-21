import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {loadEnv} from 'vite';
const root=process.cwd(), out=path.join(root,'data/site-research/cdn-audit-2026-11-16');
await mkdir(out,{recursive:true});
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
const cfg=await readFile('src/game-config.ts','utf8'),reg=await readFile('src/features/map/map-registry.ts','utf8');
const bases=Object.fromEntries(['content','dungeon','locale'].map(k=>[k,cfg.match(new RegExp('DEFAULT_'+(k==='content'?'':k.toUpperCase()+'_')+'CONTENT_BASE_URL = "([^"]+)"'))[1]]));
const origin=new URL(bases.content).origin;
const get=async url=>{for(let i=0;;i++){try{const r=await fetch(url,{signal:AbortSignal.timeout(45000),cache:'no-store'});if(!r.ok)throw Error(`${r.status} ${url}`);return Buffer.from(await r.arrayBuffer());}catch(e){if(i===2)throw e;}}};
const parallel=async(list,fn,n=10)=>{let i=0;await Promise.all(Array.from({length:n},async()=>{while(i<list.length)await fn(list[i++]);}));};
const manifests={};await parallel(Object.entries(bases),async([k,url])=>{manifests[k]=JSON.parse(await get(url+'/release-manifest.json'));if(manifests[k].fingerprint!==url.split('/').at(-1))throw Error('Manifest identity');});
const channel=JSON.parse(await get(origin+'/locales/wow-forever/current.json'));
const localePath=p=>/^data\/(?:locales\/|classes\/(?:guides\/)?locales\/|guides\/locales\/|spells\/writeups\/locales\/)/.test(p);
const route=p=>localePath(p)?'locale':/^(data|maps)\/dungeons\//.test(p)?'dungeon':'content';
const entries=[];for(const[k,m]of Object.entries(manifests))for(const f of m.files)if(route(f.path)===k)entries.push({...f,kind:k});
const staged=[];
for(const a of ['guide-beta-cleanup-2026-11-16','update-2026-11-16'])for(const k of ['content','dungeons','locales']){try{staged.push((await read(`data/site-research/${a}/${k}-release.json`)).stage);}catch{}}
const report={time:new Date().toISOString(),bases,localeChannel:channel,pinned:cfg.includes('USE_PINNED_LOCALE_RELEASE = true'),counts:{},differences:[],missingLocal:[],unpublished:[],excluded:[],subscription:[]};
const count=(k,v)=>report.counts[k]=(report.counts[k]??0)+v;
function diff(a,b,p='',rows=[]){if(isDeepStrictEqual(a,b))return rows;if(rows.length>=12)return rows;if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){for(const k of new Set([...Object.keys(a),...Object.keys(b)]))diff(a[k],b[k],p+'/'+k,rows);}else{const cut=x=>typeof x==='string'?x.slice(0,160):Array.isArray(x)?`array(${x.length})`:x;rows.push({path:p,local:cut(a),cdn:cut(b)});}return rows;}
await parallel(entries,async e=>{
 count('filesCompared',1);
 const localPath=e.path.startsWith('data/locales/app/')?'src/i18n/locales/'+path.basename(e.path):'public/'+e.path;
 let bytes;try{bytes=await readFile(localPath);}catch{report.missingLocal.push(e.path);return;}
 if(sha(bytes)===e.sha256){count('identicalBytes',1);return;}
 if(!e.path.endsWith('.json')){report.differences.push({kind:e.kind,path:e.path,type:'binary'});return;}
 let remote;for(const dir of staged){try{const candidate=await readFile(path.join(dir,e.path));if(sha(candidate)===e.sha256){remote=candidate;break;}}catch{}}
 if(!remote){remote=await get(bases[e.kind]+'/'+e.path);if(sha(remote)!==e.sha256)throw Error('CDN hash mismatch: '+e.path);count('downloadedDifferenceFiles',1);}
 let a=JSON.parse(bytes),b=JSON.parse(remote);
 if(e.path.startsWith('data/locales/app/')&&a.mapAddonPrototype){delete a.mapAddonPrototype;count('excludedPrototypeLocaleSections',1);}
 if(isDeepStrictEqual(a,b)){count('formatOrExcludedOnly',1);return;}
 const details=diff(a,b);
 report.differences.push({kind:e.kind,path:e.path,type:'json',details});
 const cache=path.join(out,'remote',e.path);await mkdir(path.dirname(cache),{recursive:true});await writeFile(cache,remote);
});
const published=new Set(entries.map(e=>e.path));
async function walk(dir){for(const d of await readdir('public/'+dir,{withFileTypes:true})){const p=dir+'/'+d.name;if(/addon|prototype/i.test(p)){report.excluded.push(p);continue;}if(d.isDirectory())await walk(p);else if(d.isFile()&&!published.has(p))report.unpublished.push(p);}}
await walk('data');
const maps=[...reg.match(/MAP_BUNDLED_ASSET_DIRS\s*=\s*\[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map(m=>m[1]);
for(const m of maps)await walk('maps/'+m);
const sc=JSON.parse(cfg.match(/SUBSCRIPTION_LOCALE_CONFIG = (\{[^;]+\}) as const/)[1]);
const prefix=`${origin}/locales/${sc.slug}/subscriptions`;
const sp=JSON.parse(await get(prefix+'/current.json'));report.subscriptionChannel=sp;
await parallel(sc.languages,async l=>{const local=await read(`src/i18n/locales/${l}.json`);const body=JSON.parse(await get(`${prefix}/${sp.fingerprint}/${l}.json`));const selected=Object.fromEntries(['premiumPlans','subscriptionSettings','ads'].map(k=>[k,local[k]]));report.subscription.push({language:l,match:isDeepStrictEqual(selected,body),details:diff(selected,body)});});
const env=loadEnv('production',root,'');report.overrides=Object.fromEntries(['VITE_CONTENT_BASE_URL','VITE_LOCALE_CONTENT_BASE_URL'].filter(k=>env[k]!==undefined).map(k=>[k,env[k]]));
const assetFiles=await readdir('dist/assets');const configFile=assetFiles.find(f=>f.startsWith('game-config-')&&f.endsWith('.js'));const built=await readFile('dist/assets/'+configFile,'utf8');report.distPins=Object.fromEntries(Object.entries(bases).map(([k,v])=>[k,built.includes(v)]));
report.differences.sort((a,b)=>a.path.localeCompare(b.path));report.unpublished.sort();
await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts:report.counts,differences:report.differences.length,missingLocal:report.missingLocal.length,unpublished:report.unpublished.length,subscription:report.subscription.map(x=>({language:x.language,match:x.match})),channelMatches:channel.fingerprint===bases.locale.split('/').at(-1),distPins:report.distPins,overrides:report.overrides,groups:report.differences.reduce((a,e)=>{const k=e.path.split('/').slice(0,e.path.includes('/locales/')?4:3).join('/');a[k]=(a[k]??0)+1;return a;},{})}));
