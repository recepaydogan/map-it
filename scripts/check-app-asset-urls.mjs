import fs from "node:fs/promises";
import path from "node:path";
const root=path.resolve(import.meta.dirname,"..");
const inventory=JSON.parse(await fs.readFile(path.join(root,".content-cache/asset-audit-inventory.json"),"utf8"));
const cacheFile=path.join(root,".content-cache/asset-url-probes.json");
const probes=await fs.readFile(cacheFile,"utf8").then(JSON.parse).catch(()=>({}));
const resume=process.argv.includes("--resume");
const urls=[...new Set(Object.values(inventory).flatMap(app=>app.images.map(i=>i.url)))];
let cursor=0,done=0;
await Promise.all(Array.from({length:20},async()=>{
  while(cursor<urls.length){const url=urls[cursor++];if(resume&&probes[url]?.ok){done++;continue;}
    for(let attempt=0;attempt<2;attempt++)try{
      const r=await fetch(url,{method:"HEAD",headers:{Origin:"http://localhost:5192"},signal:AbortSignal.timeout(20000)});
      const type=r.headers.get("content-type")||"";
      probes[url]={ok:r.ok&&type.startsWith("image/"),status:r.status,type,cors:r.headers.get("access-control-allow-origin"),length:Number(r.headers.get("content-length"))};
      if(r.status>=500&&attempt===0)continue;break;
    }catch(e){probes[url]={ok:false,error:e.name};}
    done++;if(done%250===0){await fs.writeFile(cacheFile,JSON.stringify(probes));console.log(JSON.stringify({checked:done,total:urls.length,failed:Object.values(probes).filter(p=>!p.ok).length}));}
  }
}));
await fs.writeFile(cacheFile,JSON.stringify(probes));
const summary=Object.fromEntries(Object.entries(inventory).map(([app,record])=>[app,{images:record.images.length,passed:record.images.filter(i=>probes[i.url]?.ok).length,failed:record.images.filter(i=>!probes[i.url]?.ok).map(i=>({...i,result:probes[i.url]})),missingLocal:record.missingLocal,coverage:record.tileCoverage||{mode:record.catalog?"active catalog images and every 4x4 map tile":"all discovered published image objects and literal image references"},virtualMapIdentifiers:record.virtualMapImages?.length||0}]));
await fs.writeFile(path.join(root,"docs/map-it-asset-audit.json"),JSON.stringify({checkedUrls:urls.length,method:"Public HEAD, image MIME type, read CORS; immutable bucket inventory plus local path resolution",apps:summary},null,2)+"\n");
for(const [app,s]of Object.entries(summary))console.log(JSON.stringify({app,images:s.images,passed:s.passed,failed:s.failed.length,missingLocal:s.missingLocal.length}));
