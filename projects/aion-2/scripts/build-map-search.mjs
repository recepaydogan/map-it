import { existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import { acquisitionKind, createSourceCollector, expandContainerSources, isSearchableRewardSource, REWARD_KINDS, resolveAcquisitionTargets, sectionLinks } from "./map-search-sources.mjs";

const root = new URL("../public/", import.meta.url);
const read = path => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const files = path => readdirSync(new URL(path, root)).filter(file => file.endsWith(".json")).sort();
const registry = readFileSync(new URL("../src/features/map/map-registry.ts", import.meta.url), "utf8");
// Region labels also have ids and names; only map definitions have a dataUrl.
const mapIds = [...registry.matchAll(/\{ id: "([a-z0-9-]+)", name: [^\r\n]*?, dataUrl:/g)].map(match => match[1]);
if (!mapIds.length) throw new Error("No registered maps found");
const locations = [], regions = [], byMarker = new Map(), byEntity = new Map(), groups = new Map();
const collector = createSourceCollector();
const items = new Map(read("data/items/catalog.json").items.map(item => [item.id, item]));
const artwork = read("data/reference/entity-artwork.json");
const companions = read("data/reference/map-companion-sources.json").sources;
const eventEntrances = existsSync(new URL("data/event-entrances.json", root))
  ? read("data/event-entrances.json").npcs : {};
const referenceNames = new Map(read("data/reference/index.json").entries.map(entry => [entry.id, entry.name]));

for (const mapId of mapIds) {
  const metadata = read(`maps/${mapId}/metadata.json`);
  for (const region of metadata.regions ?? []) {
    if (!region.id || !region.name || !Number.isFinite(region.x) || !Number.isFinite(region.y)) continue;
    regions.push({ mapId, mapName: metadata.displayName,
      region: { id: region.id, name: region.name, x: region.x, y: region.y } });
  }
  const aliases = new Set(metadata.locations.flatMap(point => point.aliasIds ?? []));
  const points = [...metadata.locations];
  for (const layer of ["gatherables", "collectables"]) {
    const path = `maps/${mapId}/${layer}.json`;
    if (existsSync(new URL(path, root))) points.push(...read(path).locations);
  }
  for (const point of points) {
    if (point.hiddenFromMap || aliases.has(point.id)) continue;
    const reference = point.reference?.id;
    const iconPath = point.iconPath
      ?? (point.itemId ? artwork.items[point.itemId] : undefined)
      ?? (reference ? artwork.icons[reference] : undefined);
    const event = point.category === "event-entrance" ? eventEntrances[point.entityId] : undefined;
    const eventNames = event ? [event.eventId, event.destinationId]
      .map(id => referenceNames.get(id)).filter(Boolean) : [];
    // Display names never identify records, including bound item variants.
    const key = JSON.stringify([mapId, point.category, point.insetId ?? point.regionId ?? "", reference ?? point.itemId ?? point.id]);
    let index = groups.get(key);
    if (index === undefined) {
      index = locations.length;
      groups.set(key, index);
      locations.push({ mapId, mapName: metadata.displayName, count: 0,
        names: [...new Set([point.name, ...eventNames, ...(companions[reference] ?? []).map(row => row.companion.name)])],
        point: { id: point.id, name: point.name, category: point.category, x: point.x, y: point.y,
          region: point.region ?? "", regionId: point.regionId ?? "", label: point.label ?? "", subtype: point.subtype ?? point.category,
          ...(reference ? { reference: point.reference } : {}), ...(point.itemId ? { itemId: point.itemId } : {}),
          ...(iconPath ? { iconPath } : {}) } });
    }
    locations[index].count++;
    byMarker.set(`${mapId}:${point.id}`, index);
    for (const alias of point.aliasIds ?? []) byMarker.set(`${mapId}:${alias}`, index);
    if (reference) {
      const targets = byEntity.get(reference) ?? [];
      if (!targets.some(target => target.index === index)) targets.push({ mapId, index });
      byEntity.set(reference, targets);
    }
    if (point.itemId) collector.add(point.itemId, { location: index, kind: point.category.startsWith("gather-") ? "gather" : "pickup" });
    for (const row of companions[reference] ?? []) collector.add(row.soul.id, { location: index, kind: "companion" });
  }
}

for (const file of files("data/items/acquisition/")) {
  for (const [id, acquisition] of Object.entries(read(`data/items/acquisition/${file}`).items ?? {})) {
    for (const source of Object.values(acquisition).flat()) {
      const kind = acquisitionKind(source.kind);
      if (!kind) throw new Error(`Unknown acquisition kind: ${source.kind}`);
      for (const location of resolveAcquisitionTargets(source, byMarker, byEntity)) {
        collector.add(id, { location, kind, ...(source.price ? { price: source.price } : {}) });
      }
    }
  }
}

for (const mapId of read("data/items/acquisition/marker-items/index.json").maps) {
  const data = read(`data/items/acquisition/marker-items/${mapId}.json`);
  for (const [markerId, markerItems] of Object.entries(data.markers)) {
    const location = byMarker.get(`${mapId}:${markerId}`);
    if (location === undefined) continue;
    const category = locations[location].point.category;
    const kind = ["boss", "dungeon-boss", "enemy"].includes(category) ? "loot" : ["merchant", "event-npc"].includes(category) ? "purchase" : category.startsWith("gather-") ? "gather" : "related";
    for (const item of markerItems) collector.add(item.id, { location, kind, rates: item.rewardRates });
    for (const group of data.rewards?.[markerId] ?? []) {
      for (const item of [...group.items, ...group.packages.flatMap(pack => pack.items)]) collector.add(item.id, { location, kind });
    }
  }
}

// Reference rewards cover quests, interiors and bosses absent from legacy acquisition shards.
const entries = new Map();
for (const category of ["creatures", "quests", "dungeons", "activities", "exploration", "boxes"]) {
  for (const file of files(`data/reference/${category}/`)) {
    for (const entry of Object.values(read(`data/reference/${category}/${file}`).entries)) entries.set(entry.id, entry);
  }
}
const targetsFor = entry => [...new Set([
  ...(byEntity.get(entry.id) ?? []).map(target => target.index),
  ...entry.locations.map(location => byMarker.get(`${location.mapId}:${location.markerId}`)),
].filter(index => index !== undefined))];
for (const entry of entries.values()) {
  if (!isSearchableRewardSource(entry)) continue;
  const targets = targetsFor(entry);
  for (const section of entry.sections) {
    const kind = REWARD_KINDS.get(section.title);
    if (!kind) continue;
    for (const link of sectionLinks(section).filter(link => link.category === "items")) {
      for (const location of targets) collector.add(link.id, { location,
        kind: entry.category === "quests" ? "quest" : kind,
        ...(["quests", "dungeons", "activities"].includes(entry.category) ? { via: [{ id: entry.id, name: entry.name, category: entry.category }] } : {}),
        rates: link.rewardRates });
    }
  }
}

const contents = new Map();
for (const file of files("data/reference/items/")) {
  for (const [id, sections] of Object.entries(read(`data/reference/items/${file}`).items)) {
    for (const section of sections) {
      if (section.title === "reference.labels.box-contents") {
        const children = contents.get(id) ?? new Set();
        for (const link of sectionLinks(section)) {
          const box = entries.get(link.id);
          if (link.category !== "boxes" || !box) continue;
          for (const part of box.sections.filter(part => ["reference.labels.contents", "reference.labels.possible-contents", "reference.labels.choose-a-reward"].includes(part.title))) {
            for (const item of sectionLinks(part).filter(item => item.category === "items")) children.add(item.id);
          }
        }
        contents.set(id, children);
      }
      if (section.title === "reference.labels.additional-acquisition-sources") {
        for (const link of sectionLinks(section)) {
          const entry = entries.get(link.id);
          if (!entry || entry.category === "boxes" || !isSearchableRewardSource(entry)) continue;
          const kind = ({ creatures: "loot", quests: "quest", dungeons: "reward", activities: "reward", exploration: "gather" })[entry.category];
          if (!kind) continue;
          for (const location of targetsFor(entry)) collector.add(id, { location, kind,
            ...(["quests", "dungeons", "activities"].includes(entry.category) ? { via: [{ id: entry.id, name: entry.name, category: entry.category }] } : {}) });
        }
      }
    }
  }
}
expandContainerSources(collector, contents, items);

const output = new URL("data/map-search/", root);
mkdirSync(output, { recursive: true });
const write = async (name, data) => {
  const target = new URL(name, output);
  const body = JSON.stringify({ version: 1, ...data }) + "\n";
  for (let attempt = 0; ; attempt++) {
    try {
      await writeFile(target, body);
      return;
    } catch (error) {
      // OneDrive can briefly hold generated files while syncing them.
      if (!["EBUSY", "EPERM", "EACCES", "UNKNOWN"].includes(error.code) || attempt === 5) throw error;
      await setTimeout(200 * (attempt + 1));
    }
  }
};
const shards = new Map();
const catalog = [];
for (const [id, sources] of collector.sources) {
  const item = items.get(id);
  if (!item || !item.nameVerified || !sources.size) continue;
  const chunk = id.slice(0, 4);
  catalog.push({ id, name: item.name, category: item.category, grade: item.grade, icon: item.icon, chunk, sourceCount: sources.size });
  const shard = shards.get(chunk) ?? {};
  shard[id] = [...sources.values()];
  shards.set(chunk, shard);
}
await write("index.json", { locations, items: catalog, regions });
const merchantMaps = new Map();
for (const location of locations.filter(({ point }) => ["merchant", "event-npc"].includes(point.category) && point.reference?.id)) {
  const id = location.point.reference.id;
  const maps = merchantMaps.get(id) ?? new Set();
  maps.add(location.mapId);
  merchantMaps.set(id, maps);
}
await write("merchant-locations.json", { npcs: Object.fromEntries([...merchantMaps].sort(([a], [b]) => a.localeCompare(b))
  .map(([id, maps]) => [id, [...maps].sort()])) });
for (const [chunk, sources] of shards) await write(`${chunk}.json`, { sources });
console.log(`Built global search: ${locations.length} location groups, ${catalog.length} obtainable items, ${[...shards.values()].reduce((count, shard) => count + Object.values(shard).reduce((sum, rows) => sum + rows.length, 0), 0)} source links.`);
