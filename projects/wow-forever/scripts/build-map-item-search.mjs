/** Join existing acquisition evidence to published map identities, never by NPC name. */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { indexItemSourceMapLocations, getItemSourceMapLocations } from "../src/features/database/item-source-map-links.ts";

const publicRoot = process.argv.find(arg => arg.startsWith("--public-root="))?.slice("--public-root=".length)
  ?? fileURLToPath(new URL("../public", import.meta.url));
const contentPath = value => path.join(publicRoot, ...value.split("/"));
const read = async value => JSON.parse(await readFile(contentPath(value), "utf8"));
const [index, catalog, enrichment, inventories, gathering, rewards, rares] = await Promise.all([
  "data/map-search/index.json", "data/items/catalog.json", "data/items/foreverdb-enrichment.json",
  "data/vendors/inventories.json", "data/items/forever-gathering-sources.json",
  "data/items/forever-quest-rewards.json", "data/rares/details.json",
].map(read));
const mapIndex = indexItemSourceMapLocations(index.locations);
const addresses = new Map(index.locations.map((entry, i) => [`${entry.mapId}:${entry.point.id}`, i]));
const items = new Map([...catalog.items, ...enrichment.newItems].map(item => [item.id, {
  id: item.id, name: enrichment.entries[item.id]?.current?.name ?? item.name,
  category: item.category, grade: item.grade, icon: item.icon,
}]));
const sources = new Map();
const add = (id, targets, source) => {
  id = String(id);
  if (!items.has(id)) return;
  for (const target of targets) {
    const location = addresses.get(`${target.mapId}:${target.markerId}`);
    if (location === undefined) continue;
    const entries = sources.get(id) ?? new Map();
    const key = `${location}:${source.kind}:${source.via?.map(entry => entry.id).join(",") ?? ""}`;
    entries.set(key, { ...entries.get(key), ...source, location });
    sources.set(id, entries);
  }
};
const resolve = source => getItemSourceMapLocations(source, mapIndex);
const rate = percent => Number.isFinite(percent) ? { rates: [{ kind: "direct", percent, quantityMin: 1, quantityMax: 1 }] } : {};
const vendorOffers = new Map();
const vendorItems = new Map();
const addVendorOffer = (npc, id, copper) => {
  const item = items.get(id);
  if (!npc || !item) return;
  const offers = vendorOffers.get(npc) ?? new Map();
  if (!offers.has(id)) offers.set(id, Number.isSafeInteger(copper) && copper >= 0 ? [id, copper] : [id]);
  vendorOffers.set(npc, offers);
  vendorItems.set(id, { name: item.name, icon: item.icon });
};
for (let shard = 0; shard < 64; shard++) {
  const [records, sold] = await Promise.all([read(`data/items/research/sources/${shard}.json`), read(`data/items/research/sold/${shard}.json`)]);
  for (const [id, entries] of Object.entries(records)) for (const source of entries) {
    const kind = { drop: "loot", vendor: "purchase", quest: "quest", object: "pickup" }[source.t];
    if (!kind) continue;
    add(id, resolve(source), { kind, ...rate(source.pct), ...(source.t === "quest" && source.q
      ? { via: [{ id: String(source.q), name: source.n ?? `Quest #${source.q}`, category: "quests" }] } : {}) });
    if (source.t === "vendor" && !sold[id]?.v.length) addVendorOffer(source.npc, id);
  }
  for (const [id, record] of Object.entries(sold)) for (const vendor of record.v) {
    add(id, resolve({ ...vendor, t: "vendor" }), { kind: "purchase" });
    addVendorOffer(vendor.npc, id, vendor.p);
  }
}
// Exact map inventories and rare-panel drops take precedence over broad research rows.
for (const [npc, entries] of Object.entries(inventories.vendors)) for (const item of entries) {
  add(item.id, resolve({ t: "vendor", npc }), { kind: "purchase" });
}
for (const rare of rares.entries) for (const drop of rare.drops ?? []) {
  add(drop.id, resolve({ t: "drop", npc: rare.id }), { kind: "loot", ...rate(drop.percent) });
}
for (const [id, entry] of Object.entries(gathering.items)) for (const region of entry.regions) {
  add(id, [{ mapId: "azeroth", markerId: region.markerId }], { kind: "gather" });
}
for (const [id, entries] of Object.entries(rewards.items)) for (const quest of entries) {
  add(id, resolve({ t: "quest", q: quest.questId }), { kind: "quest",
    via: [{ id: quest.questId, name: quest.name, category: "quests" }] });
}
for (const { mapId, point } of index.locations) if (point.itemId) {
  add(point.itemId, [{ mapId, markerId: point.id }], { kind: point.category.startsWith("gatherable-") ? "gather" : "pickup" });
}
const chunks = Array.from({ length: 64 }, () => ({ version: 1, sources: {} }));
const searchable = [...sources].map(([id, entries]) => {
  const shard = Number(id) % 64;
  chunks[shard].sources[id] = [...entries.values()];
  return { ...items.get(id), chunk: `items-${shard}`, sourceCount: entries.size };
}).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
const outputs = new Map(chunks.map((chunk, shard) => [`data/map-search/items-${shard}.json`, chunk]));
outputs.set("data/map-search/index.json", { ...index, items: searchable });
outputs.set("data/vendors/item-source-offers.json", {
  version: 1,
  items: Object.fromEntries(vendorItems),
  vendors: Object.fromEntries([...vendorOffers].map(([npc, offers]) => [npc, [...offers.values()].sort(([a], [b]) =>
    vendorItems.get(a).name.localeCompare(vendorItems.get(b).name, "en") || Number(a) - Number(b))])),
});
for (const [path, value] of outputs) {
  if (process.argv.includes("--vendor-offers-only") && path !== "data/vendors/item-source-offers.json") continue;
  const bytes = `${JSON.stringify(value)}\n`;
  if (process.argv.includes("--check")) {
    if (await readFile(contentPath(path), "utf8") !== bytes) throw new Error(`Stale map search: ${path}`);
  } else await writeFile(contentPath(path), bytes);
}
if (process.argv.includes("--vendor-offers-only")) console.log(`Indexed item source offers for ${vendorOffers.size} vendors.`);
else console.log(`Indexed ${searchable.length} items with ${[...sources.values()].reduce((sum, entries) => sum + entries.size, 0)} mapped acquisition routes.`);
