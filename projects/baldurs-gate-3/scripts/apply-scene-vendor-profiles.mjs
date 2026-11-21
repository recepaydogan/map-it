import fs from "node:fs";
import path from "node:path";
import { readRegisteredMapIds } from "./lib/map-registry-source.mjs";
import { buildSceneVendorProfile, createSceneVendorResolver, createStockTitleResolver } from "./lib/scene-vendor-profile.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const catalog = read("map-sources/catalog/scene-vendors.json");
const resolve = createSceneVendorResolver(catalog);
const title = createStockTitleResolver(read("map-sources/catalog/gameplay-stats.json"), read("map-sources/catalog/root-templates.json"));
const treasures = read("map-sources/catalog/treasure-tables.json");
const ids = readRegisteredMapIds(fs.readFileSync(path.join(root, "src/features/map/map-registry.ts"), "utf8"));
const pending = [];
const matched = new Set();
for (const mapId of ids) {
  const filename = `public/maps/${mapId}/content.json`;
  const content = read(filename);
  let changed = false;
  const update = (entity) => {
    const profile = resolve(entity.storyDestination);
    if (!profile) return entity;
    if (entity.kind !== "vendor" || !entity.vendor) throw new Error(`Reviewed stock target is not a vendor: ${mapId}/${entity.id}`);
    matched.add(profile.id);
    const vendor = buildSceneVendorProfile(profile, treasures, title);
    if (vendor.unresolvedStockIds?.length) console.warn(`${mapId}/${entity.id}: retained ${vendor.unresolvedStockIds.length} unresolved native stock references for source review.`);
    if (JSON.stringify(vendor) === JSON.stringify(entity.vendor)) return entity;
    changed = true;
    return { ...entity, vendor };
  };
  const entities = Array.isArray(content.entities) ? content.entities.map(update)
    : Object.fromEntries(Object.entries(content.entities).map(([key, entity]) => [key, update(entity)]));
  if (changed) pending.push({ mapId, filename, content: { ...content, entities } });
}
if (matched.size !== catalog.profiles.length) throw new Error("Some reviewed scene vendors have no published destination; nothing was written");
if (pending.length) {
  const backup = fs.mkdtempSync(path.join(root, "map-sources/audits/pre-scene-vendor-stock-"));
  for (const filename of ["public/data/item-database.json", "public/maps/index.json",
    ...pending.flatMap(({ filename, mapId }) => [filename, `public/maps/${mapId}/locations.json`])]) {
    const target = path.join(backup, filename);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, filename), target, fs.constants.COPYFILE_EXCL);
  }
  for (const { filename, content } of pending) writeGeneratedFile(path.join(root, filename), `${JSON.stringify(content, null, 2)}\n`);
  console.log(`Retained baseline in ${path.relative(root, backup)}.`);
}
console.log(`Updated scene vendor profiles in ${pending.length} maps; marker identities, positions, kinds and unrelated content were retained.`);
