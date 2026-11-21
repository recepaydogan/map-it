/** Resumable public-source captures. No application or addon files are changed. */
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { jinaReaderHeaders, jinaReaderPaceMs } from './lib/jina-reader-config.mjs';
const root = 'data/site-research/update-2026-11-16';
await mkdir(`${root}/pages`, { recursive: true });
const audit = JSON.parse(await readFile('data/site-research/marker-audit-2026-11-16/comparison.json', 'utf8'));
const items = JSON.parse(await readFile('public/data/items/catalog.json', 'utf8')).items;
const names = ['Blessed Band of Light', "Channeler's Ring", 'Gloves of Holy Might', 'Glimmering Mithril Insignia', 'Taran Icebreaker', 'Everstaring Abomination Eye', 'The Bad Hat', 'Souvenir Sea Shell'];
const itemIds = [...new Set(['279471','2915','284097','274749','260212','282007', ...items.filter(i => names.includes(i.name) || /Darkspear.*Signet|Signet.*Darkspear/.test(i.name)).map(i => i.id)])];
const jobs = itemIds.flatMap(id => [['enUS',''],['deDE','de/'],['esES','es/'],['esMX','mx/'],['frFR','fr/'],['koKR','ko/'],['ptBR','pt/'],['zhCN','cn/'],['zhTW','tw/']].map(([lang, prefix]) => ({key:`item-${id}-${lang}`,url:`https://nether.wowhead.com/forever/${prefix}tooltip/item/${id}`})));
for (const id of [5214,96335,96076]) for (const [lang,prefix] of [['deDE','de/'],['esES','es/'],['esMX','mx/'],['frFR','fr/'],['koKR','ko/'],['ptBR','pt/'],['zhCN','cn/'],['zhTW','tw/']]) jobs.push({key:`quest-${id}-${lang}`,url:`https://nether.wowhead.com/forever/${prefix}tooltip/quest/${id}`});
for (const [id, title] of [[5214,'The Great Ezra Grimm'], [96335,'The Man in the Iron Chains'], [96076,'In Demand - Ancient Elven Curiosities'], ...audit.missingQuestDetails]) {
  if (/NYI|<TXT>|\[DNT\]|\[PH\]|Deprecated|Test Quest/i.test(title)) continue;
  jobs.push({key:`quest-${id}-enUS`,url:`https://nether.wowhead.com/forever/tooltip/quest/${id}`});
}
let next = 0, cursor = 0, completed = 0;
const sleep = ms => new Promise(r => setTimeout(r,ms));
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++], file = `${root}/pages/${job.key}.txt`;
    try { await access(file); continue; } catch {}
    const now = Date.now(), start = Math.max(now, next); next = start + Math.max(3500,jinaReaderPaceMs);
    await sleep(start-now);
    try {
      const response = await fetch(`https://r.jina.ai/${job.url}`, {headers:jinaReaderHeaders, signal:AbortSignal.timeout(60000)});
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = await response.text();
      if (!body.includes('Markdown Content:')) throw new Error('Missing reader content');
      await writeFile(file,body);
      completed++;
      if (completed%20===0) console.log(`${completed} captured; ${job.key}`);
    } catch(error) { console.log(`${job.key}: ${error.message}`); }
  }
}
await Promise.all(Array.from({length:4},worker));
console.log(`Capture complete: ${completed}/${jobs.length}`);
