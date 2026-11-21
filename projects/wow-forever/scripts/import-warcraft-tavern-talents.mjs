import { access, mkdir, writeFile } from "node:fs/promises";

const root = new URL("../public/data/classes/talent-calculator.json", import.meta.url);
const api = "https://forever.warcraftdb.com/api/v1/talents";
const slugs = ["warrior", "paladin", "hunter", "rogue", "priest", "shaman", "mage", "warlock", "druid"];

async function getJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

const classes = await Promise.all(slugs.map(async (slug) => {
  const entry = await getJson(`${api}/${slug}`);
  if (entry.class_slug !== slug || entry.max_points !== 51 || entry.trees?.length !== 3) throw new Error(`Unexpected talent data for ${slug}`);
  const trees = entry.trees.map((tree) => {
    const ids = new Set(tree.talents.map((talent) => talent.id));
    const slots = new Set();
    const talents = tree.talents.map((talent) => {
      const slot = `${talent.tier}:${talent.column}`;
      if (slots.has(slot) || talent.tier < 0 || talent.tier > 6 || talent.column < 0 || talent.column > 3) throw new Error(`Invalid ${slug}/${tree.name} slot ${slot}`);
      slots.add(slot);
      if (talent.descriptions?.length !== talent.max_rank || talent.max_rank < 1) throw new Error(`Incomplete ranks for ${slug}/${talent.name}`);
      if (talent.prereq_talent && (!ids.has(talent.prereq_talent) || !talent.prereq_rank)) throw new Error(`Invalid prerequisite for ${slug}/${talent.name}`);
      return {
        id: talent.id,
        row: talent.tier,
        col: talent.column,
        n: talent.name,
        ic: talent.icon,
        ranks: Array.from({ length: talent.max_rank }, (_, index) => index + 1),
        d: talent.descriptions,
        pre: talent.prereq_talent ? [[talent.prereq_talent, talent.prereq_rank - 1]] : [],
        passive: talent.passive,
        header: talent.header,
        requires: talent.requires,
      };
    });
    return { n: tree.name, ic: tree.icon, talents };
  });
  return { n: entry.class_name, trees };
}));

await mkdir(new URL("../public/data/classes/", import.meta.url), { recursive: true });
await writeFile(root, `${JSON.stringify({ version: 1, source: api, classes })}\n`);
const icons = new Set(classes.flatMap((entry) => entry.trees.flatMap((tree) => [tree.ic, ...tree.talents.map((talent) => talent.ic)])));
const iconDirectory = new URL("../public/data/spells/icons/", import.meta.url);
await mkdir(iconDirectory, { recursive: true });
for (const id of icons) {
  const path = new URL(`${id}.webp`, iconDirectory);
  try { await access(path); continue; } catch { /* Download icons absent from the local catalog. */ }
  const response = await fetch(`https://forever.warcraftdb.com/api/v1/casc/blp/${id}.webp`);
  if (!response.ok) throw new Error(`Icon ${id}: HTTP ${response.status}`);
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
}
console.log(`Imported ${classes.length} classes and ${classes.flatMap((entry) => entry.trees.flatMap((tree) => tree.talents)).length} talents`);
