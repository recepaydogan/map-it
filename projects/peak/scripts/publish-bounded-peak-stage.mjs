import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { openSync, closeSync, unlinkSync } from 'node:fs';

const [stageArgument, mode] = process.argv.slice(2);
if (!stageArgument || !['assets', 'catalog'].includes(mode)) throw new Error('Usage: publish-bounded-peak-stage.mjs <stage> assets|catalog');
const stage = resolve(stageArgument);
const lockPath = resolve('artifacts/peak-maintenance.lock');
const lock = openSync(lockPath, 'wx');
process.on('exit', () => { closeSync(lock); unlinkSync(lockPath); });
const base = 'https://peak.ingredientassets.com/peak/data/peak';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const plan = JSON.parse(await readFile(join(stage, 'publication-plan.json')));
const catalogBytes = await readFile(join(stage, 'catalog.json'));
const catalog = JSON.parse(catalogBytes);
assert.equal(catalog.schemaVersion, 4);
assert.equal(hash(catalogBytes), plan.catalogSha256);
const run = (script, args = []) => execFileSync(process.execPath, ['scripts/' + script, ...args], { stdio: 'inherit' });
const assertInstalled = async () => {
  const manifest = await readFile('C:/Program Files (x86)/Steam/steamapps/appmanifest_3527290.acf', 'utf8');
  assert.equal(manifest.match(/"StateFlags"\s+"(\d+)"/u)?.[1], '4', 'Steam installation is not stable');
  assert.equal(manifest.match(/"buildid"\s+"(\d+)"/u)?.[1], catalog.source.buildId, 'Installed build changed');
};
const checkRemotePointer = async (key, expected) => {
  const response = await fetch(`${base}/${key}?publication=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(45000) });
  if (expected === null) { assert.equal(response.status, 404, 'Another v4 release was published'); return; }
  assert.ok(response.ok);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), expected, `Live pointer changed: ${key}`);
};
await assertInstalled();
run('peak-source-snapshot.mjs', ['verify', join(stage, 'source-bundles-snapshot.json')]);
run('validate-peak-data.mjs', ['--data-directory', stage]);
run('check-peak-map-compatibility.mjs', ['--data-directory', stage, '--local', '--check-window']);
for (const test of ['test-map-view.mjs', 'test-map-catalog.mjs', 'test-map-converter.mjs', 'test-peak-publication.mjs']) run(test);
for (const test of ['test-biome-enum.py', 'test-final-levels.py', 'test-scene-bundles.py']) {
  execFileSync('py', ['-3', '-B', 'scripts/peak-data/' + test], { stdio: 'inherit' });
}
for (const asset of plan.assets) assert.equal(hash(await readFile(join(stage, asset.key))), asset.sha256, `Staged asset changed: ${asset.key}`);
await checkRemotePointer('catalog.json', plan.legacySha256);
await checkRemotePointer('catalog-v4.json', plan.previousV4Sha256);
const upload = ['--source-root', join(stage, 'publication-upload'), '--validation-root', stage, '--catalog-key', 'catalog-v4.json'];
const verify = ['--source-root', join(stage, 'publication-verify'), '--base-url', base, '--catalog-key', 'catalog-v4.json'];
if (mode === 'assets') {
  run('upload-peak-cdn.mjs', [...upload, '--assets-only']);
  run('verify-peak-cdn.mjs', [...verify, '--assets-only']);
  await writeFile(join(stage, 'assets-verified.json'), JSON.stringify({ catalogSha256: plan.catalogSha256,
    assets: plan.assets.map(asset => ({ key: asset.key, sha256: asset.sha256 })), verifiedAt: new Date().toISOString() }));
  console.log('All immutable assets verified; live catalogs unchanged.');
} else {
  const proof = JSON.parse(await readFile(join(stage, 'assets-verified.json')));
  assert.equal(proof.catalogSha256, plan.catalogSha256);
  assert.deepEqual(proof.assets, plan.assets.map(asset => ({ key: asset.key, sha256: asset.sha256 })));
  assert.ok(Date.now() - Date.parse(proof.verifiedAt) < 4 * 60 * 60 * 1000, 'Asset verification expired');
  // Revalidate all referenced assets immediately before the release switch.
  run('verify-peak-cdn.mjs', [...verify, '--assets-only']);
  run('peak-source-snapshot.mjs', ['verify', join(stage, 'source-bundles-snapshot.json')]);
  await assertInstalled();
  await checkRemotePointer('catalog.json', plan.legacySha256);
  await checkRemotePointer('catalog-v4.json', plan.previousV4Sha256);
  run('upload-peak-cdn.mjs', [...upload, '--catalog-only']);
  run('verify-peak-cdn.mjs', [...verify, '--catalog-only']);
  await checkRemotePointer('catalog.json', plan.legacySha256);
  const result = { publishedAt: new Date().toISOString(), sourceBuild: plan.sourceBuild,
    targetBuild: plan.targetBuild, catalogUrl: base + '/catalog-v4.json', catalogSha256: plan.catalogSha256,
    dailyWindow: catalog.dailyWindow, dailyMaps: catalog.levels.length, finalMaps: catalog.specialLevels.length,
    verifiedAssets: plan.assets.length, uploadedAssets: plan.assets.filter(asset => asset.upload).length,
    legacyCatalogUnchanged: true };
  await writeFile(join(stage, 'publication-result.json'), JSON.stringify(result, null, 2));
  const canonical = resolve('artifacts/peak-data-v4');
  for (const path of [...plan.assets.map(asset => asset.key), 'map-capture.json', 'source-bundles-snapshot.json', 'publication-result.json']) {
    await mkdir(dirname(join(canonical, path)), { recursive: true });
    await copyFile(join(stage, path), join(canonical, path));
  }
  await copyFile(join(stage, 'catalog.json'), join(canonical, 'catalog.json'));
  console.log(JSON.stringify(result, null, 2));
}
