import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = "https://foreverdb.net";
const headers = { "User-Agent": "WowForeverMapContentResearch/1.0" };
const classes = ["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"];

const decodeHtml = (text) => text.replace(/&(?:#(\d+)|#x([\da-f]+)|amp|quot|apos|lt|gt|nbsp);/gi, (entity, decimal, hex) => {
  if (decimal) return String.fromCodePoint(Number(decimal));
  if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
  return { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " }[entity.toLowerCase()] ?? entity;
});
const clean = (html) => decodeHtml(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

const classLinks = {};
const spellIds = new Set();
for (const name of classes) {
  const classId = name.toLowerCase();
  const response = await fetch(`${baseUrl}/class/${name}`, { headers });
  if (!response.ok) throw new Error(`ForeverDB ${name}: HTTP ${response.status}`);
  const html = await response.text();
  const links = [];
  const seenNames = new Set();
  for (const match of html.matchAll(/<a\s+href="\/spell\/(\d+)"[^>]*>([\s\S]*?)<\/a>(?:\s*\(level\s*(\d+)\))?/gi)) {
    const [, id, rawName, rawLevel] = match;
    const spellName = clean(rawName);
    if (!spellName || seenNames.has(spellName)) continue;
    seenNames.add(spellName);
    links.push({ id, name: spellName, ...(rawLevel ? { level: Number(rawLevel) } : {}) });
    spellIds.add(id);
  }
  classLinks[classId] = links;
}

const descriptions = {};
const missingPages = [];
const ids = [...spellIds];
let next = 0;
async function worker() {
  while (next < ids.length) {
    const id = ids[next++];
    const response = await fetch(`${baseUrl}/spell/${id}`, { headers });
    if (!response.ok) { missingPages.push({ id, status: response.status }); continue; }
    const html = await response.text();
    const main = html.match(/<main\b[\s\S]*?<\/main>/i)?.[0];
    const paragraph = main?.match(/<h1[^>]*>[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/i)?.[1];
    const description = paragraph ? clean(paragraph) : "";
    if (description && description !== "No description in the client.") descriptions[id] = description;
  }
}
await Promise.all(Array.from({ length: 4 }, worker));

const entries = Object.fromEntries(Object.entries(classLinks).map(([classId, links]) => [classId,
  links.filter((link) => descriptions[link.id]).map((link) => ({
    ...link,
    description: descriptions[link.id],
    sourceUrl: `${baseUrl}/spell/${link.id}`,
  })),
]));
await mkdir("public/data/spells", { recursive: true });
await writeFile("public/data/spells/foreverdb-class-spells.json", `${JSON.stringify({
  version: 1,
  source: `${baseUrl}/spells`,
  entries,
}, null, 2)}\n`);
await writeFile("docs/foreverdb-spell-review.json", `${JSON.stringify({
  version: 1,
  classPageLinks: Object.fromEntries(Object.entries(classLinks).map(([id, links]) => [id, links.length])),
  withDescriptions: Object.fromEntries(Object.entries(entries).map(([id, spells]) => [id, spells.length])),
  missingPages,
}, null, 2)}\n`);
console.log(`Imported ${Object.values(entries).reduce((count, spells) => count + spells.length, 0)} class spell entries from ${ids.length} unique spell pages; ${missingPages.length} pages unavailable.`);
