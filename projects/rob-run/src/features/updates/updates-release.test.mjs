import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

test("patch releases keep existing notes and all languages have the displayed release",async()=>{
  const root=new URL("../../../",import.meta.url);
  const manifest=JSON.parse(await readFile(new URL("public/manifest.json",root),"utf8"));
  const pkg=JSON.parse(await readFile(new URL("package.json",root),"utf8"));
  const lock=JSON.parse(await readFile(new URL("package-lock.json",root),"utf8"));
  const bundle=await build({entryPoints:[fileURLToPath(new URL("./updates-release.ts",import.meta.url))],bundle:true,write:false,format:"esm",platform:"node"});
  const {UPDATES_VERSION,resolveUpdatesVersion}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
  assert.equal(pkg.version,manifest.meta.version);
  assert.equal(lock.version,manifest.meta.version);assert.equal(lock.packages[""].version,manifest.meta.version);
  const releases=[{version:"4.4.9",items:["Existing notes"]},{version:"4.4.11",items:["Future notes"]},{version:"4.4.10",items:[]}];
  assert.equal(resolveUpdatesVersion("4.4.10",releases),"4.4.9");
  assert.equal(resolveUpdatesVersion("4.4.11",releases),"4.4.11");
  assert.equal(resolveUpdatesVersion("4.4.10",[{version:"4.4.9",items:["Notes"]},{version:"4.4.8",items:["Older notes"]}]),"4.4.9");
  const key=`v${UPDATES_VERSION.replaceAll(".","")}`;
  for(const code of ["en","de","es","es-MX","fr","ko","pt-BR","zh-Hans","zh-Hant"]){
    const locale=JSON.parse(await readFile(new URL(`src/i18n/locales/${code}.json`,root),"utf8"));
    assert.equal(locale.updates.releases[key].version,UPDATES_VERSION,code);
    assert.ok(locale.updates.releases[key].items.length,code);
    assert.deepEqual(locale.updates.releases.v4416.items.flatMap(note=>note.parts?.flatMap(part=>part.target?[part.target]:[])??[]),
      ["dungeons","dungeon-map-picker"],code);
    if(code==="en")assert.ok(locale.updates.releases.v449.items.includes("Live location tracker support will be back again soon."));
  }
});
