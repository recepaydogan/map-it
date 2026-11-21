import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const out = path.resolve('data/site-research/hotfix-2026-11-11/tooltips');
await mkdir(out, { recursive: true });
const jobs = [17364, 415140, 408498, 17804, 1316697, 1263056, 1307252, 3326].map(id => ['en', 'spell', id]);
for (const language of ['de', 'es', 'mx', 'fr', 'ko', 'pt', 'cn', 'tw']) {
  for (const id of [1316697, 17804]) jobs.push([language, 'spell', id]);
}
let next = 0;
for (const [language, type, id] of jobs) {
  const file = path.join(out, `${language}-${type}-${id}.json`);
  if (await readFile(file).then(() => true, () => false)) continue;
  await new Promise(resolve => setTimeout(resolve, Math.max(0, next - Date.now())));
  next = Date.now() + 10000;
  const url = `https://nether.wowhead.com/forever/${language === 'en' ? '' : `${language}/`}tooltip/${type}/${id}`;
  try {
    const response = await fetch(`https://r.jina.ai/${url}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    if (!text.includes(`URL Source: ${url}`)) throw new Error('Source identity mismatch');
    const tooltip = JSON.parse(text.split('Markdown Content:\n')[1].trim());
    if (!tooltip.tooltip || !tooltip.name) throw new Error('Invalid tooltip');
    await writeFile(file, JSON.stringify({ url, capturedAt: new Date().toISOString(), ...tooltip }, null, 2));
    console.log(`${language}/${id}: captured`);
  } catch (error) { console.log(`${language}/${id}: ${error.message}`); }
}
