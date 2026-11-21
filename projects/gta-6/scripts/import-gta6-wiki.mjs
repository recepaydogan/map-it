import fs from 'node:fs/promises';
import path from 'node:path';
import dns from 'node:dns';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
dns.setDefaultResultOrder('ipv4first');
const root = path.resolve(import.meta.dirname, '..');
const cache = path.join(root, 'artifacts/gta6-wiki-import');
const imageSourceIndex = path.join(cache, 'image-sources.json');
const readJsonIfPresent = async file => fs.readFile(file, 'utf8').then(JSON.parse).catch(error => {
  if (error.code !== 'ENOENT') throw error;
  return null;
});
const knownSources = await readJsonIfPresent(imageSourceIndex) ?? Object.fromEntries(
  (await readJsonIfPresent(path.join(cache, 'provenance.json')) ?? []).map(entry => [entry.id, entry.imageUrl]),
);
await fs.writeFile(imageSourceIndex, JSON.stringify(knownSources, null, 2) + '\n');
execFileSync('python', ['scripts/parse-gta6-wiki.py'], { cwd: root, stdio: 'inherit' });
const catalog = JSON.parse(await fs.readFile(path.join(cache, 'catalog-draft.json'), 'utf8'));
const missingDescriptions = catalog.records.filter(entry => !entry.description.length);
if (missingDescriptions.length) throw new Error(`Missing catalog descriptions: ${missingDescriptions.map(entry => entry.id).join(', ')}`);
const images = JSON.parse(await fs.readFile(path.join(cache, 'images.json'), 'utf8'));
await fs.mkdir(path.join(cache, 'images'), { recursive: true });
let next = 0, done = 0;
const failures = [];
await Promise.all(Array.from({ length: 2 }, async () => {
  while (next < images.length) {
    const item = images[next++];
    try {
      const original = path.join(cache, 'images', item.id);
      let bytes = knownSources[item.id] === item.url ? await fs.readFile(original).catch(error => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      }) : null;
      if (!bytes) {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
          await new Promise(resolve => setTimeout(resolve, 600));
          const response = await fetch(item.url, { signal: AbortSignal.timeout(30000) });
          if (response.status === 429 && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, Math.max(30, Number(response.headers.get('retry-after')) || 30) * 1000));
            continue;
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          bytes = Buffer.from(await response.arrayBuffer());
          break;
          } catch (error) {
            if (attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
          }
        }
        const info = await sharp(bytes).metadata();
        if (!info.width || info.width < 100) throw new Error('Invalid entry image');
        await fs.writeFile(original, bytes);
        knownSources[item.id] = item.url;
      }
      await fs.mkdir(path.dirname(path.join(root, 'public', item.path)), { recursive: true });
      await sharp(bytes).resize({ width: 1200, withoutEnlargement: true }).webp({ quality: 86 }).toFile(path.join(root, 'public', item.path));
      await sharp(bytes).resize({ width: 420, withoutEnlargement: true }).webp({ quality: 80 }).toFile(path.join(root, 'public', item.thumbnail));
      done++;
      if (done % 50 === 0) console.log(`Wiki artwork ${done}/${images.length}`);
    } catch (error) { failures.push({ id: item.id, error: String(error) }); }
  }
}));
await fs.writeFile(imageSourceIndex, JSON.stringify(knownSources, null, 2) + '\n');
await fs.writeFile(path.join(cache, 'image-report.json'), JSON.stringify({ done, failures }, null, 2));
if (failures.length) throw new Error(`Wiki artwork incomplete: ${JSON.stringify(failures)}`);
await fs.mkdir(path.join(root, 'public/data/gta6/wiki'), { recursive: true });
await fs.copyFile(path.join(cache, 'catalog-draft.json'), path.join(root, 'public/data/gta6/wiki/catalog.json'));
console.log(JSON.stringify({ status: 'passed', entries: catalog.records.length, images: done * 2 }));
