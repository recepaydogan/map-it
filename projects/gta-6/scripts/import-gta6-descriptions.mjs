import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = path.resolve(import.meta.dirname, '..');
const read = async relative => JSON.parse(await fs.readFile(path.join(root, relative), 'utf8'));
const [markers, mediaReport, summaries] = await Promise.all([
  read('artifacts/gtabase-import/markers.json'),
  read('artifacts/gtabase-import/media-report.json'),
  read('scripts/data/gta6-location-descriptions.json'),
]);
const sourceById = new Map(markers.map(marker => [marker.id, marker]));
const matches = new Map(mediaReport.matched.map(match => [match.sourceId, match]));
const records = {}, applied = [], skipped = [];
// Reuse the reviewed photo identities. A nearby point or a similar name is not
// sufficient to transfer a description to a different building or branch.
for (const [sourceId, description] of Object.entries(summaries)) {
  const source = sourceById.get(sourceId);
  assert(source?.description?.trim(), `Missing source description: ${sourceId}`);
  assert(typeof description === 'string' && description.trim() && !/[<>]/.test(description), `Invalid summary: ${sourceId}`);
  const match = matches.get(sourceId);
  if (!match) { skipped.push({ sourceId, reason: 'No reviewed location match' }); continue; }
  assert.equal(source.name, match.name, `Changed location identity: ${sourceId}`);
  assert(!records[match.landmarkId], `Multiple descriptions target ${match.landmarkId}`);
  records[match.landmarkId] = description.trim();
  applied.push({ sourceId, landmarkId: match.landmarkId, name: match.name,
    sourceHash: createHash('sha256').update(source.description).digest('hex') });
}
for (const match of matches.values()) {
  if (sourceById.get(match.sourceId)?.description?.trim()) {
    assert(summaries[match.sourceId], `Review a summary for newly matched location: ${match.sourceId}`);
  }
}
await fs.writeFile(path.join(root, 'public/data/gta6/descriptions.json'), JSON.stringify({ records }, null, 2) + '\n');
await fs.writeFile(path.join(root, 'artifacts/gtabase-import/descriptions-report.json'), JSON.stringify({ applied, skipped }, null, 2) + '\n');
console.log(JSON.stringify({ descriptions: applied.length, skipped: skipped.length }));
