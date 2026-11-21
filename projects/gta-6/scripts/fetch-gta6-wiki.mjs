import fs from 'node:fs/promises';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');
const root = new URL('../artifacts/gta6-wiki-import/', import.meta.url);
const seeds = JSON.parse(await fs.readFile(new URL('seeds.json', root), 'utf8'));
await fs.mkdir(new URL('details/', root), { recursive: true });
let next = 0, done = 0;
const failures = [];
await Promise.all(Array.from({ length: 1 }, async () => {
  while (next < seeds.length) {
    const seed = seeds[next++], file = new URL(`details/${seed.id}.html`, root);
    try {
      const cached = await fs.readFile(file, 'utf8').catch(() => '');
      if (!cached.includes('com-content-article__body')) {
        let html;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            await new Promise(resolve => setTimeout(resolve, 1200));
            const response = await fetch(new URL(seed.sourcePath, 'https://www.gtabase.com'), { signal: AbortSignal.timeout(30000) });
            if (response.status === 429) {
              const delay = Math.max(30, Number(response.headers.get('retry-after')) || 30);
              console.log(`Rate limit: waiting ${delay}s before retrying ${seed.id}`);
              await new Promise(resolve => setTimeout(resolve, delay * 1000));
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            html = await response.text();
            if (!html.includes('com-content-article__body')) throw new Error('Missing article body');
            break;
          } catch (error) {
            if (attempt === 2) throw error;
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
        await fs.writeFile(file, html);
      }
      done++;
      if (done % 40 === 0) console.log(`Wiki pages ${done}/${seeds.length}`);
    } catch (error) { failures.push({ id: seed.id, error: String(error) }); }
  }
}));
await fs.writeFile(new URL('fetch-report.json', root), JSON.stringify({ done, failures }, null, 2));
console.log(JSON.stringify({ done, failures }));
if (failures.length) process.exitCode = 1;
