import { readFile, writeFile } from "node:fs/promises";

const guides = JSON.parse(await readFile("public/data/dungeons/boss-guides.json", "utf8"));
const catalog = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const enrichment = JSON.parse(await readFile("public/data/items/foreverdb-enrichment.json", "utf8"));
const byId = new Map(catalog.items.map((item) => [item.id, item]));
const ids = [...new Set(Object.values(guides.entries).flatMap((entry) =>
  entry.bosses.flatMap((boss) => boss.loot)))];
const items = {};
for (const id of ids) {
  const item = byId.get(id);
  if (!item) throw new Error(`Missing dungeon guide loot item ${id}`);
  items[id] = {
    id,
    name: item.name,
    icon: item.icon,
    grade: item.grade,
    itemLevel: item.itemLevel,
    slot: item.slot,
    stats: [
      ...(item.sections.find((section) => section.key === "base")?.stats ?? []),
      ...(enrichment.entries[id]?.stats ?? []),
    ].slice(0, 4).map(({ label, value }) => ({ label, value })),
  };
}
await writeFile("public/data/dungeons/loot-items.json", `${JSON.stringify({ version: 1, items }, null, 2)}\n`);
console.log(`Published ${ids.length} linked dungeon loot items.`);
