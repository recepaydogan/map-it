import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { resolve, join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const stage = resolve(process.argv[2]);
const base = 'https://peak.ingredientassets.com/peak/data/peak';
const catalogBytes = await readFile(join(stage, 'catalog.json'));
const catalog = JSON.parse(catalogBytes);
assert.equal(catalog.schemaVersion, 4);
execFileSync(process.execPath, ['scripts/validate-peak-data.mjs', '--data-directory', stage], { stdio: 'inherit' });
const reports = JSON.parse(await readFile(join(stage, 'render-qa/report.json')));
assert.equal(reports.length, 14, 'All fourteen maps need render verification');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const remote = async key => {
  const response = await fetch(`${base}/${key}?preflight=${Date.now()}`, { signal: AbortSignal.timeout(45000), cache: 'no-store' });
  if (response.status === 404) return null;
  assert.ok(response.ok, `CDN read failed: ${key}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};
const legacy = await remote('catalog.json');
assert.ok(legacy?.equals(await readFile(join(stage, 'previous-live-catalog.json'))), 'Legacy release changed');
const previous = await remote('catalog-v4.json');
const paths = new Set([...Object.values(catalog.markerIcons), ...catalog.items.map(item => item.icon).filter(Boolean)]
  .map(path => path.replace(/^\.\/data\/peak\//u, '')));
for (const level of [...catalog.levels, ...catalog.specialLevels]) {
  const slug = basename(level.mapImage, '.webp');
  assert.ok(reports.some(report => report.slug === slug));
  paths.add(`maps/${slug}.webp`);
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) paths.add(`maps/tiles/${slug}/${column}-${row}.webp`);
}
const upload = join(stage, 'publication-upload');
const verify = join(stage, 'publication-verify');
await mkdir(upload);
await mkdir(verify);
await copyFile(join(stage, 'catalog.json'), join(upload, 'catalog.json'));
await copyFile(join(stage, 'catalog.json'), join(verify, 'catalog.json'));
const pending = [...paths].sort();
let index = 0;
const entries = [];
const worker = async () => {
  while (index < pending.length) {
    const key = pending[index++];
    assert.match(key, /^(?:icons|items|maps)\/[a-zA-Z0-9\/-]+\.(?:png|webp)$/u);
    assert.ok(!key.includes('..'));
    const content = await readFile(join(stage, key));
    const existing = await remote(key);
    if (existing && !existing.equals(content)) throw new Error(`Immutable CDN collision: ${key}; allocate a new revision, never overwrite it`);
    await mkdir(dirname(join(verify, key)), { recursive: true });
    await copyFile(join(stage, key), join(verify, key));
    if (!existing) {
      await mkdir(dirname(join(upload, key)), { recursive: true });
      await copyFile(join(stage, key), join(upload, key));
    }
    entries.push({ key, sha256: hash(content), bytes: content.length, upload: !existing });
    if (entries.length % 50 === 0) console.log(`Checked ${entries.length}/${pending.length} immutable CDN paths`);
  }
};
await Promise.all(Array.from({ length: 4 }, worker));
entries.sort((a, b) => a.key.localeCompare(b.key));
await writeFile(join(stage, 'publication-plan.json'), JSON.stringify({ createdAt: new Date().toISOString(),
  sourceBuild: JSON.parse(previous ?? legacy).source.buildId, targetBuild: catalog.source.buildId,
  legacySha256: hash(legacy), previousV4Sha256: previous ? hash(previous) : null,
  catalogSha256: hash(catalogBytes), assets: entries }, null, 2));
console.log(`Prepared ${entries.filter(entry => entry.upload).length} new assets; ${entries.length} total references. No uploads performed.`);
