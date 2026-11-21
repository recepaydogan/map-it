import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { createNativeCharacterEquipmentResolver } from "./lib/native-character-equipment.mjs";
import { readVerifiedEquipmentItemCatalog, createEquipmentLootProfiler, applyEquipmentLootProfile } from "./lib/equipment-loot-profile.mjs";
import { findUniqueEquipmentClass } from "./lib/unique-equipment.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  if (!process.argv[index].startsWith("--") || process.argv[index + 1] === undefined) throw new Error("Expected --name value arguments");
  args.set(process.argv[index].slice(2), process.argv[index + 1]);
}
for (const key of ["maps-source", "equipment-item-catalog", "output-stage"]) if (!args.has(key)) throw new Error(`Missing --${key}`);
const source = fs.realpathSync(path.resolve(root, args.get("maps-source")));
const requested = path.resolve(root, args.get("output-stage"));
const output = path.join(fs.realpathSync(path.dirname(requested)), path.basename(requested));
const relativeOutput = path.relative(fs.realpathSync(path.join(root, "map-sources/audits")), output);
if (!relativeOutput || relativeOutput.startsWith("..") || path.isAbsolute(relativeOutput) || fs.existsSync(output)) throw new Error("Equipment staging needs a new child directory of audits");
const hashes = {}, pending = [], entries = [], unresolved = [];
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).split(path.sep).join("/"), digest = hash(value);
  if (hashes[key] && hashes[key] !== digest) throw new Error(`Equipment staging input changed: ${key}`);
  hashes[key] = digest;
  return value;
};
const read = (file) => JSON.parse(bytes(file).toString("utf8"));
const catalogPath = path.resolve(root, args.get("equipment-item-catalog"));
bytes(catalogPath);
const input = readVerifiedEquipmentItemCatalog(catalogPath, root), profiler = createEquipmentLootProfiler(input);
for (const file of Object.keys(input.catalog.hashes)) bytes(file);
const config = read("map-sources/config/placement-maps.json");
const templates = read(config.rootTemplates).templates, members = read(config.partyMembers).members;
const gameplay = read(config.gameplayStats).entries;
const itemById = new Map(input.items.map((item) => [item.id, item]));
const resolver = createNativeCharacterEquipmentResolver({ projectRoot: root, templates, members,
  placementRoots: [...new Set([...Object.values(config.placementRoots), ...config.supplementaryPlacementRoots])].map((file) => path.resolve(root, file)) });
const mapIds = readRegisteredMapIds(bytes("src/features/map/map-registry.ts").toString("utf8"));
let appearances = 0, changedAppearances = 0, lootAppearances = 0, dropRows = 0, dropAmount = 0;
for (const mapId of mapIds) {
  const content = read(path.join(source, mapId, "content.json"));
  const locations = read(path.join(source, mapId, "locations.json"));
  const metadata = bytes(path.join(source, mapId, "metadata.json"));
  const newDrops = new Map();
  const update = (entity) => {
    appearances++;
    if (entity.gameplay?.type !== "Character" && !entity.partyMember && !entity.storyDestination) return entity;
    const native = resolver.resolve(entity), resolved = profiler(entity, native);
    if (!resolved) {
      unresolved.push({ mapId, contentId: entity.id, ...native });
      return entity;
    }
    const next = applyEquipmentLootProfile(entity, resolved);
    changedAppearances++;
    if (resolved.drops.length) {
      lootAppearances++; dropRows += resolved.drops.length;
      dropAmount += resolved.drops.reduce((sum, drop) => sum + drop.amount, 0);
      newDrops.set(entity.id, resolved.drops);
    }
    entries.push({ mapId, contentId: entity.id, characterId: native.characterId, definitionId: resolved.profile.definitionId,
      dropRows: resolved.drops.length, states: resolved.profile.groups.flatMap((group) => group.entries.map(({ status }) => status)) });
    return next;
  };
  const entities = Array.isArray(content.entities) ? content.entities.map(update)
    : Object.fromEntries(Object.entries(content.entities).map(([key, entity]) => [key, update(entity)]));
  const nextLocations = locations.locations.map((location) => {
    const drops = newDrops.get(location.contentId);
    if (!drops) return location;
    const additions = [...new Set(drops.flatMap((drop) => [drop.title, drop.itemName, drop.rarity]).filter(Boolean))];
    const newFacets = [...new Set(drops.map((drop) => {
      const item = itemById.get(drop.equipmentSource.itemId);
      const category = findUniqueEquipmentClass(gameplay[drop.statsId] ?? { type: item.type, rarity: item.rarity, ...item.gameplay });
      return category ? `unique-${category}` : null;
    }).filter(Boolean))];
    return { ...location, searchTerms: [...(location.searchTerms ?? []), ...additions.filter((term) => !location.searchTerms?.includes(term))],
      ...(newFacets.length ? { categoryFacets: [...(location.categoryFacets ?? []), ...newFacets.filter((facet) => !location.categoryFacets?.includes(facet))] } : {}) };
  });
  for (const [filename, data] of [["content.json", { ...content, entities }], ["locations.json", { ...locations, locations: nextLocations }]]) {
    pending.push([`public/maps/${mapId}/${filename}`, Buffer.from(`${JSON.stringify(data, null, 2)}\n`)]);
  }
  pending.push([`public/maps/${mapId}/metadata.json`, metadata]);
}
Object.assign(hashes, resolver.hashes);
for (const file of [import.meta.filename, "scripts/lib/equipment-loot-profile.mjs", "scripts/lib/native-character-equipment.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) if (hash(fs.readFileSync(path.resolve(root, file))) !== expected) throw new Error(`Stale native equipment source: ${file}`);
for (const [file, data] of pending) {
  const target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  writeGeneratedFile(target, data);
}
const stats = { maps: mapIds.length, appearances, changedAppearances, lootAppearances, dropRows, dropAmount,
  deferredEntryRows: Object.fromEntries([...Map.groupBy(entries.flatMap(({ states }) => states).filter((state) => state !== "authored-death-loot"), (state) => state)].map(([state, rows]) => [state, rows.length])) };
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify({ kind: "authored-equipment-loot-stage", source, catalogPath, maps: mapIds,
  stats, entries, unresolved, hashes, scope: "Exact authored starting-equipment drops only with explicit character/equipment lootability. Later scenes, overlaps and uncertain identities are retained for review." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats }, null, 2));
