import assert from 'node:assert/strict';
import { readFile, writeFile, copyFile, mkdir } from 'node:fs/promises';
import { join, resolve, basename, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const [stageArgument, previousArgument] = process.argv.slice(2);
if (!stageArgument || !previousArgument) throw new Error('Usage: reuse-bounded-peak-captures.mjs <stage> <last-published-v4-root>');
const stage = resolve(stageArgument), previousRoot = resolve(previousArgument);
assert.notEqual(stage, previousRoot);
const catalog = JSON.parse(await readFile(join(stage, 'catalog.json')));
const previousBytes = await readFile(join(previousRoot, 'catalog.json'));
const previous = JSON.parse(previousBytes);
assert.equal(catalog.schemaVersion, 4);
assert.equal(previous.schemaVersion, 4);
const response = await fetch(`https://peak.ingredientassets.com/peak/data/peak/catalog-v4.json?reuse=${Date.now()}`,
  { cache: 'no-store', signal: AbortSignal.timeout(45000) });
assert.ok(response.ok);
assert.ok(Buffer.from(await response.arrayBuffer()).equals(previousBytes), 'Local previous catalog is not the published v4 release');
// Full rendering/generator inputs and recorded image hashes must still match.
execFileSync(process.execPath, ['scripts/check-peak-map-compatibility.mjs', '--data-directory', previousRoot, '--local'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/validate-peak-data.mjs', '--data-directory', previousRoot], { stdio: 'inherit' });
assert.deepEqual(catalog.source, previous.source, 'Source identity changed; recapture instead of reusing');
const identity = entry => {
  const { mapImage, mapBuildId, mapRevision, ...metadata } = entry;
  return metadata;
};
const pending = [];
let reused = 0;
for (const entry of [...catalog.levels, ...catalog.specialLevels]) {
  const previousEntry = [...previous.levels, ...previous.specialLevels].find(candidate => candidate.kind === entry.kind && candidate.scene === entry.scene);
  if (!previousEntry || JSON.stringify(identity(entry)) !== JSON.stringify(identity(previousEntry))) {
    pending.push(entry);
    continue;
  }
  const slug = basename(previousEntry.mapImage, '.webp');
  const paths = [`maps/${slug}.webp`];
  for (let row = 0; row < 4; row++) for (let column = 0; column < 4; column++) paths.push(`maps/tiles/${slug}/${column}-${row}.webp`);
  for (const path of paths) {
    await mkdir(dirname(join(stage, path)), { recursive: true });
    await copyFile(join(previousRoot, path), join(stage, path));
  }
  Object.assign(entry, previousEntry);
  reused++;
}
await writeFile(join(stage, 'catalog.json'), JSON.stringify(catalog));
await writeFile(join(stage, 'capture-targets.json'), JSON.stringify(pending));
console.log(`Reused ${reused} fully verified captures; ${pending.length} require capture.`);
