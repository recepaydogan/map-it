/** Merge captured NPC facts with the map's complete rare identity set. */
import { readFile, writeFile } from "node:fs/promises";

const map = JSON.parse(await readFile("public/maps/world-atlas/locations-forever-all-rares.json", "utf8"));
const current = JSON.parse(await readFile("public/data/rares/details.json", "utf8"));
const items = JSON.parse(await readFile("public/data/items/catalog.json", "utf8"));
const captured = (await readFile("data/site-research/forever-all-detail-pages.jsonl", "utf8"))
  .trim().split("\n").map((line) => JSON.parse(line)).filter((record) => record.kind === "rare" && record.title);
const byId = new Map(captured.map((record) => [record.id, record]));
const previous = new Map(current.entries.map((entry) => [entry.id, entry]));
const itemIds = new Set(items.items.map((item) => item.id));
const facts = (record, prefix) => record?.facts.find((fact) => fact.startsWith(prefix))?.slice(prefix.length).trim();
const uniquePoints = new Map(map.locations.map((point) => [Number(point.entityId), point]));
const entries = [...uniquePoints].map(([id, point]) => {
  const old = previous.get(id);
  const record = byId.get(id);
  const type = facts(record, "Type: ")?.toLowerCase();
  const level = facts(record, "Level: ");
  const numericLevel = level && /^\d+$/.test(level) ? Number(level) : undefined;
  const drops = record?.drops.map((drop) => {
    const sampleSize = drop.outof > 0 ? drop.outof : undefined;
    const observed = drop.count >= 0 && sampleSize ? drop.count : undefined;
    const rate = observed !== undefined && sampleSize ? observed / sampleSize * 100 : undefined;
    const percent = rate === undefined ? undefined
      : Number(rate.toFixed(rate > 0 && rate < 0.1 ? 3 : rate < 1 ? 2 : 1));
    return { id: String(drop.id), name: drop.name,
      icon: `data/items/site-icons/${drop.icon}.jpg`,
      inItemCatalog: itemIds.has(String(drop.id)),
      ...(percent !== undefined ? { percent, observed, sampleSize } : {}),
    };
  });
  const { npcSourceUrl: _npcSourceUrl, dropSourceUrl: _dropSourceUrl, ...prior } = old ?? {};
  return { ...prior, id, classification: point.category,
    ...(old?.type || type ? { type: old?.type ?? type } : {}),
    ...(numericLevel ? { level: numericLevel } : {}),
    ...(level && !numericLevel ? { levelRange: level } : {}),
    ...(record?.facts.some((fact) => fact.startsWith("Tameable")) ? { tameable: true } : {}),
    ...(facts(record, "Health: ") ? { health: facts(record, "Health: ") } : {}),
    ...(facts(record, "Mana: ") ? { mana: facts(record, "Mana: ") } : {}),
    ...(drops ? { drops } : {}),
  };
});
for (const entry of current.entries) if (!uniquePoints.has(entry.id)) {
  const { npcSourceUrl: _npcSourceUrl, dropSourceUrl: _dropSourceUrl, ...prior } = entry;
  entries.push(prior);
}
current.entries = entries;
current.source = { mapCapturedAt: "2026-10-15", detailCapturedAt: "2026-10-15",
  allNpcCount: uniquePoints.size,
  capturedDetailCount: byId.size };
await writeFile("public/data/rares/details.json", `${JSON.stringify(current, null, 2)}\n`);
console.log(JSON.stringify({ allNpcCount: uniquePoints.size, capturedDetailCount: byId.size,
  totalEntries: entries.length, withDrops: entries.filter((entry) => entry.drops?.length).length }));
