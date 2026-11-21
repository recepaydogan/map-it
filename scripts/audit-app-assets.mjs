import fs from "node:fs/promises";
import path from "node:path";
import { parseEnv } from "node:util";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { parse } from "acorn";
import { transform } from "esbuild";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const apps = JSON.parse(await fs.readFile(path.join(root, "src/features/app-library/map-apps.json"), "utf8"));
const plan = JSON.parse(await fs.readFile(path.join(root, ".content-cache/plan.json"), "utf8"));
const release = JSON.parse(await fs.readFile(path.join(root, "config/app-content-release.json"), "utf8"));
const image = /\.(?:png|webp|jpe?g|gif|svg|avif|ico)(?:[?#].*)?$/i;
const output = path.join(root, ".content-cache/asset-audit-inventory.json");
const inventory = process.argv.includes("--resume") ? await fs.readFile(output,"utf8").then(JSON.parse).catch(() => ({})) : {};
async function walk(dir) { const result=[]; for (const item of await fs.readdir(dir,{withFileTypes:true})) { const f=path.join(dir,item.name); if(item.isDirectory()) result.push(...await walk(f)); else if(item.isFile()) result.push(f); } return result; }
function visit(n, callback) { if(!n||typeof n!=="object")return; callback(n); for(const [key,value]of Object.entries(n)) { if(["start","end","type"].includes(key))continue; if(Array.isArray(value))value.forEach(child=>visit(child,callback));else if(value&&typeof value==="object")visit(value,callback); } }
async function envFor(app) { const values={}; for(const name of [".env",".env.local",".env.production",".env.production.local"]) { try {Object.assign(values,parseEnv(await fs.readFile(path.join(root,"projects",app,name),"utf8")));}catch(e){if(e.code!=="ENOENT")throw e;} }return values; }
for (const app of apps) {
  if(inventory[app.id]) { console.log(JSON.stringify({app:app.id,reusedInventory:true,images:inventory[app.id].images.length})); continue; }
  const directory = path.join(root,"dist/apps",app.id);
  const references = new Map(), bases = new Set(), local = [];
  let legacyDataBase;
  const add = (value, file) => {
    if(typeof value!=="string"||value.startsWith("data:")||value.length>3000)return;
    if(app.id === "peak" && /^https:\/\/[^/]+\/.*data\/peak$/.test(value)) legacyDataBase=value;
    if(app.id === "project-zomboid" && /^https:\/\/[^/]+\/b[\w.-]+\/global$/.test(value)) legacyDataBase=value;
    if(/^https:\/\/[^/]+\.ingredientassets\.com\//.test(value)) {
      const found=value.match(/^(https:\/\/[^/]+\/(?:map-it\/v1\/[^/]+\/)?(?:valheim\/assets\/|maps\/releases\/|releases\/)[a-f0-9]{8,64})(?:\/|$)/);
      if(found)bases.add(found[1]);
    }
    if(!image.test(value)||/[{}<>\n]/.test(value))return;
    if(/^https?:\/\//.test(value))references.set(value,{url:value,source:file});
    else if(value.startsWith(`/apps/${app.id}/`))local.push({value,source:file});
  };
  for(const file of await walk(directory)) {
    const rel=path.relative(root,file).split(path.sep).join("/");
    if(!/\.(?:js|json|css|html)$/.test(file))continue;
    const text=await fs.readFile(file,"utf8");
    if(file.endsWith(".js")) {
      let ast;try{ast=parse(text,{ecmaVersion:"latest",sourceType:"module"});}catch{continue;}
      visit(ast,n=>{if(n.type==="Literal")add(n.value,rel);if(n.type==="TemplateLiteral"&&n.expressions.length===0)add(n.quasis[0].value.cooked,rel);});
    } else if(file.endsWith(".json")) {
      let data;try{data=JSON.parse(text);}catch{continue;}
      const scan=value=>{if(typeof value==="string")add(value,rel);else if(Array.isArray(value))value.forEach(scan);else if(value&&typeof value==="object")Object.values(value).forEach(scan);};scan(data);
    } else for(const match of text.matchAll(/(?:https?:\/\/|\/apps\/)[^\s"'`<>\\)]+/g))add(match[0],rel);
  }
  if(release.receipts[app.id])bases.add(release.receipts[app.id].baseUrl);
  for(const [file]of Object.entries(plan.apps[app.id].files))if(image.test(file)){const url=release.receipts[app.id].baseUrl+"/"+file.split("/").map(encodeURIComponent).join("/")+(release.receipts[app.id].urlSuffix||"");references.set(url,{url,source:"published-content-plan"});}
  const env=await envFor(app.id), listed=[];
  if(["R2_ACCOUNT_ID","R2_ACCESS_KEY_ID","R2_SECRET_ACCESS_KEY","R2_BUCKET"].every(k=>env[k])) {
    const client=new S3Client({region:"auto",endpoint:env.R2_ENDPOINT||`https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,credentials:{accessKeyId:env.R2_ACCESS_KEY_ID,secretAccessKey:env.R2_SECRET_ACCESS_KEY},requestChecksumCalculation:"WHEN_REQUIRED"});
    try {
      for(const base of bases) {
        const prefix=new URL(base).pathname.slice(1)+"/";let token,count=0,images=0;
        do {
          const result=await client.send(new ListObjectsV2Command({Bucket:env.R2_BUCKET,Prefix:prefix,ContinuationToken:token}));
          for(const object of result.Contents||[]) { count++;if(!image.test(object.Key))continue;images++;const suffix=app.id==="baldurs-gate-3"&&base.includes("/map-it/")?"?map-it=1":"";const url=new URL(base).origin+"/"+object.Key.split("/").map(encodeURIComponent).join("/")+suffix;references.set(url,{url,size:object.Size,etag:object.ETag,source:"published-bucket-inventory"});}
          token=result.IsTruncated?result.NextContinuationToken:undefined;
        }while(token);
        listed.push({base,objects:count,images});
      }
    }catch(e){listed.push({error:e.name});}finally{client.destroy();}
  }
  const configText=await fs.readFile(path.join(directory,"content-config.js"),"utf8");
  const config=JSON.parse(configText.slice(configText.indexOf("=")+1).trim().replace(/;$/,""));
  const missingLocal=[];
  for(const entry of local){const file=decodeURIComponent(entry.value.split(/[?#]/)[0]).slice(`/apps/${app.id}/`.length);const redirect=config.redirects[file];if(redirect){try{await fs.access(path.join(root,"dist",redirect.slice(1)));}catch{missingLocal.push(entry);}continue;}if(config.files[file])continue;try{await fs.access(path.join(directory,file));}catch{missingLocal.push(entry);}}
  const virtualMapImages=app.id==="elden-ring" ? missingLocal.filter(entry=>Object.keys(plan.apps[app.id].files).some(file=>file.startsWith("maps/tiles/"+path.basename(entry.value,path.extname(entry.value))+"/"))) : [];
  inventory[app.id]={bases:[...bases],legacyDataBase,listed,images:[...references.values()],missingLocal:missingLocal.filter(entry=>!virtualMapImages.includes(entry)),virtualMapImages};
  await fs.writeFile(output,JSON.stringify(inventory));
  console.log(JSON.stringify({app:app.id,images:references.size,listed,missingLocal:missingLocal.slice(0,20),missingLocalTotal:missingLocal.length}));
}

// PEAK's active catalog and PZ's sparse DZI manifest define their dynamic URLs.
// Empty DZI cells are intentionally absent; sample every floor/zoom boundary
// instead of treating the entire rectangular world as required image files.
const peakBase=inventory.peak.legacyDataBase||"https://peak.ingredientassets.com/peak/data/peak";
const peakResponse=await fetch(peakBase+"/catalog-v4.json",{signal:AbortSignal.timeout(30000)});
if(!peakResponse.ok)throw new Error("The active PEAK catalog is unavailable");
const peakCatalog=await peakResponse.json(),peakUrls=new Set();
const scanPeak=value=>{if(typeof value==="string"&&image.test(value)){if(value.startsWith("./data/peak/"))peakUrls.add(peakBase+"/"+value.slice("./data/peak/".length));else if(/^https:/.test(value))peakUrls.add(value);}else if(Array.isArray(value))value.forEach(scanPeak);else if(value&&typeof value==="object")Object.values(value).forEach(scanPeak);};
scanPeak(peakCatalog);
for(const level of [...peakCatalog.levels,...(peakCatalog.specialLevels||[])])if(level.mapImage){const slug=level.mapImage.split("/").at(-1).replace(/\.webp$/,"");for(let x=0;x<4;x++)for(let y=0;y<4;y++)peakUrls.add(`${peakBase}/maps/tiles/${slug}/${x}-${y}.webp`);}
inventory.peak.images=[...peakUrls].map(url=>({url,source:"active-catalog-and-tile-grid"}));
inventory.peak.catalog={url:peakBase+"/catalog-v4.json",schemaVersion:peakCatalog.schemaVersion,levels:peakCatalog.levels.length,specialLevels:peakCatalog.specialLevels?.length||0};

const pzBase=inventory["project-zomboid"].legacyDataBase||"https://pz.ingredientassets.com/b42.20.2-r1/global";
const pzResponse=await fetch(pzBase+"/manifest.json",{signal:AbortSignal.timeout(30000)});
if(!pzResponse.ok)throw new Error("The active Project Zomboid manifest is unavailable");
const manifest=await pzResponse.json();
const groundSource=await fs.readFile(path.join(root,"projects/project-zomboid/src/features/map/project-zomboid-map-b42-tile-ranges.ts"),"utf8");
const groundModule=await transform(groundSource,{loader:"ts",format:"cjs"});
const context={module:{exports:{}}};vm.runInNewContext(groundModule.code,context,{timeout:5000});
const floors=[...manifest.floors,{floor:0,format:"jpg",tileRanges:context.module.exports.PROJECT_ZOMBOID_MAP_B42_GROUND_TILE_RANGES}];
const pzUrls=new Set();
for(const floor of floors)for(const[level,ranges]of Object.entries(floor.tileRanges||{})){if(!ranges.length)continue;for(const range of [ranges[0],ranges[Math.floor(ranges.length/2)],ranges.at(-1)])for(const x of [range[1],Math.floor((range[1]+range[2])/2),range[2]])pzUrls.add(`${pzBase}/layer${floor.floor}_files/${level}/${x}_${range[0]}.${floor.format}`);}
inventory["project-zomboid"].images=[...pzUrls].map(url=>({url,source:"all-floor-and-zoom-range-boundary-samples"}));
inventory["project-zomboid"].tileCoverage={floors:floors.length,mode:"first/middle/last rows and columns at every published zoom level; sparse empty tiles excluded"};
await fs.writeFile(output,JSON.stringify(inventory));
console.log(JSON.stringify({dynamicAssets:{peak:peakUrls.size,projectZomboid:pzUrls.size}}));
console.log(JSON.stringify({status:"inventoried",file:path.relative(root,output)}));
