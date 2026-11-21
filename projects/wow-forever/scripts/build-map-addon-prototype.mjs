import { readFile, writeFile, mkdir, copyFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { writeTga, loadMapConfig, exportMarkers } from './lib/map-addon-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const addonName = 'wfm-map-prototype';
const output = path.join(root, 'dist', 'addon-prototype', addonName);
const json = async (name) => JSON.parse(await readFile(path.join(root, name), 'utf8'));
const en = await json('src/i18n/locales/en.json');
const metadata = await json('public/maps/world-atlas/metadata.json');
const projection = await json('public/data/live-position-projection.json');
const lookup = (key) => key?.split('.').reduce((value, part) => value?.[part], en);
const lua = (value) => {
  if (typeof value === 'string') return '"' + value.replace(/[\\"\x00-\x1f]/g, (c) => `\\${c.charCodeAt(0).toString().padStart(3, '0')}`) + '"';
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite Lua value'); return String(value); }
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `{${value.map(lua).join(',')}}`;
  if (value && typeof value === 'object') return `{${Object.entries(value).map(([key, v]) => `[${lua(key)}]=${lua(v)}`).join(',')}}`;
  throw new Error(`Unsupported Lua value: ${value}`);
};
await mkdir(output, { recursive: true });
const config = await loadMapConfig(root, output);
const exported = await exportMarkers(root, output, config, en);
const { categories, groups, markers, controls } = exported;
console.log(`Exported ${markers.length} markers and ${exported.sprites.length} native marker sprites.`);
const tiles = [];
let totalBytes = 0;
for (const layer of metadata.terrainLayers) {
  for (const level of [0, 2, 4]) {
    const coverage = layer.tileCoverage[layer.detailLevels.indexOf(level)];
    if (!coverage) throw new Error(`Missing level ${level}: ${layer.id}`);
    const destination = path.join(output, 'textures', layer.id, String(level));
    await mkdir(destination, { recursive: true });
    for (const address of coverage) {
      const [col, row] = address.split(',').map(Number);
      const relative = layer.tilePattern.replace('{level}', String(level)).replace('{x}', String(col)).replace('{y}', String(row));
      const source = path.resolve(root, 'public/maps/world-atlas', layer.basePath, relative);
      const name = `tile-${col}-${row}.tga`;
      const target = path.join(destination, name);
      const cached = await stat(target).catch(() => null);
      if (cached?.size === 1048594 && cached.mtimeMs >= (await stat(source)).mtimeMs) totalBytes += cached.size;
      else totalBytes += await writeTga(sharp(source), target);
      const size = layer.tileSize * 2 ** level;
      tiles.push({ level, x: layer.originX + (layer.sourceBounds.minX + col * size) * layer.scaleX,
        y: layer.originY + (layer.sourceBounds.minY + row * size) * layer.scaleY,
        width: size * layer.scaleX, height: size * layer.scaleY,
        path: `textures\\${layer.id}\\${level}\\${name}` });
    }
  }
}
const data = { strings: en.mapAddonPrototype, projection, categories, groups, controls, markerRules: exported.markerRules, spriteVariants: exported.spriteVariants, markers, tiles, documents: exported.documents };
await writeFile(path.join(output, 'map-data.lua'), `local _, NS = ...\nNS.Data = ${lua({ ...data, markers: [], documents: {} })}\n`);
// Keep each Lua chunk below the client's constant/instruction limits.
const chunks = [];
for (let i = 0; i < markers.length; i += 500) {
  const file = `marker-data-${String(i / 500).padStart(3, '0')}.lua`;
  chunks.push(file);
  await writeFile(path.join(output, file), 'local _, NS = ...\nlocal m = NS.Data.markers\n' + markers.slice(i, i + 500).map(p => `m[#m+1]=${lua(p)}`).join('\n') + '\n');
}
const documentChunks=[];
let documentLines=[], documentBytes=0;
async function flushDocuments() {
  if(!documentLines.length) return;
  const file=`detail-data-${String(documentChunks.length).padStart(3,'0')}.lua`;
  await writeFile(path.join(output,file),'local _, NS = ...\nlocal d=NS.Data.documents\n'+documentLines.join('\n')+'\n');
  documentChunks.push(file); documentLines=[]; documentBytes=0;
}
for(const [key,doc] of Object.entries(exported.documents)) {
  const line=`d[${lua(key)}]=${lua(doc)}`;
  if(documentBytes+Buffer.byteLength(line)>160000) await flushDocuments();
  documentLines.push(line); documentBytes+=Buffer.byteLength(line);
}
await flushDocuments();
await writeFile(path.join(output, `${addonName}.toc`), [
  '## Interface: 16001', `## Title: ${en.mapAddonPrototype.title}`, '## Version: 0.0.9',
  `## Notes: ${en.mapAddonPrototype.notes}`, '## Author: rastudio',
  '## SavedVariables: WFM_MapPrototypeDB',
  '', 'map-data.lua', ...chunks, ...documentChunks, 'map-core.lua', 'map-filters.lua', 'map-details.lua', 'map-prototype.lua', '',
].join('\n'));
for (const file of ['map-core.lua', 'map-filters.lua', 'map-details.lua', 'map-prototype.lua', 'Bindings.xml']) await copyFile(path.join(root, 'addons/map-prototype', file), path.join(output, file));
await copyFile(path.join(root, 'addons/map-prototype/README.md'), path.join(output, 'README.md'));
await writeFile(path.join(root, 'dist/addon-prototype/build-report.json'), JSON.stringify({ addonName, version: '0.0.9', tiles: tiles.length,
  markers: markers.length, textureBytes: totalBytes, levels: [0, 2, 4], sprites: exported.sprites, missingIcons: exported.missingIcons, data }, null, 2));
await writeFile(path.join(root,'dist/addon-prototype/detail-coverage.json'),JSON.stringify(exported.detailCoverage,null,2));
for (const tile of tiles) await stat(path.join(output, tile.path.replaceAll('\\', '/')));
console.log(JSON.stringify({ output, tiles: tiles.length, markers: markers.length, textureMiB: +(totalBytes / 1024 / 1024).toFixed(1) }));
