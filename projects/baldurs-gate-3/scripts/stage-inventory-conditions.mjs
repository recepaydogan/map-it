import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { readNativeItemPlacements } from "./lib/native-item-placements.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Metadata-only refinement of an already routed stage. Original inventory
// multiplicity, geometry, scene eligibility and source flags remain intact.
assert.equal(process.argv.length, 5, "Usage: stage-inventory-conditions.mjs <snapshot> <fresh-stage> <placement-roots-json>");
const root = path.resolve(import.meta.dirname, ".."), snapshotPath = path.resolve(root, process.argv[2]);
const output = path.resolve(root, process.argv[3]), roots = JSON.parse(process.argv[4]).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, outputHashes = {}, pending = new Map(), changes = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)); hashes[relative(file)] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file)), snapshot = read(snapshotPath), proof = read(snapshot.proofPath);
assert.equal(digest(bytes(snapshot.proofPath)), snapshot.proofHash); assert.deepEqual(proof.errors, []);
for (const [file, hash] of Object.entries(proof.hashes)) {
  const captured = snapshot.snapshots[file];
  if (captured) assert.equal(captured.hash, hash);
  assert.equal(digest(bytes(captured?.path ?? file)), hash, `Stale baseline input: ${file}`);
}
for (const captured of Object.values(snapshot.snapshots)) assert.equal(digest(bytes(captured.path)), captured.hash);
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
  ? walk(path.join(dir, entry.name)) : entry.name.endsWith(".lsj") ? [path.join(dir, entry.name)] : []);
for (const dir of roots) for (const file of walk(dir)) bytes(file);
const { objects } = readNativeItemPlacements({ roots, projectRoot: root,
  localization: { en: new Map(), tr: new Map() }, templateHandle: () => undefined });
const conditionalOwners = new Map([...objects].filter(([, owner]) => owner.inventory.some((entry) => entry.inventoryCondition)));
const manifest = read(path.join(snapshot.stage, "stage-manifest.json"));
const oldNativeRow = (row) => ({ objectId: row.objectId ?? "", itemName: row.itemName, templateId: row.templateId ?? "",
  amount: row.amount, droppedOnDeath: row.droppedOnDeath, canBePickpocketed: row.pickpocketable,
  tradeable: row.tradeable, difficulties: row.difficulties });
let appearances = 0; const identities = new Set();
for (const mapId of manifest.maps) {
  const contentFile = `public/maps/${mapId}/content.json`, candidatesFile = `map-sources/catalog/${mapId}-placements.json`;
  const content = read(path.join(snapshot.stage, contentFile)), candidates = read(path.join(snapshot.stage, candidatesFile));
  const byId = new Map(candidates.candidates.map((row) => [row.id, row])); let changed = false;
  for (const entity of content.entities) {
    appearances++; identities.add(entity.id);
    const ownerId = entity.storyDestination?.characterContentId ?? entity.id, owner = conditionalOwners.get(ownerId);
    if (!owner) continue;
    const candidate = byId.get(entity.id); assert(candidate);
    assert.equal(owner.ownerKind, "character"); assert(!entity.containerLoot && !candidate.containerLoot);
    assert.deepEqual(candidate.inventoryItems, owner.inventory.map(oldNativeRow), `Source inventory mismatch: ${mapId}/${entity.id}`);
    assert(owner.inventory.filter((row) => row.inventoryCondition).every((row) => !row.objectId), "Conditional placed item needs item-location projection");
    for (const [index, row] of candidate.inventoryItems.entries()) {
      if (owner.inventory[index].inventoryCondition) row.inventoryCondition = owner.inventory[index].inventoryCondition;
    }
    const sourceDrops = candidate.inventoryItems.filter((row) => row.droppedOnDeath);
    const decorate = (profile) => {
      if (!profile) return;
      const drops = profile.guaranteedDrops.filter((row) => !row.equipmentSource);
      assert.equal(drops.length, sourceDrops.length, `Death inventory mismatch: ${mapId}/${entity.id}`);
      for (const [index, drop] of drops.entries()) {
        const source = sourceDrops[index];
        assert.equal(drop.itemName, source.itemName); assert.equal(drop.amount, source.amount);
        assert.equal(drop.canBePickpocketed, source.canBePickpocketed);
        if (source.inventoryCondition) drop.inventoryCondition = source.inventoryCondition;
      }
    };
    const before = JSON.stringify(entity);
    for (const profile of [candidate.deathLoot, entity.deathLoot, entity.sceneContext?.authoredLoot]) decorate(profile);
    changes.push({ mapId, id: entity.id, ownerId, entityChanged: before !== JSON.stringify(entity),
      conditionalRows: owner.inventory.filter((row) => row.inventoryCondition).length }); changed = true;
  }
  for (const file of [contentFile, candidatesFile, `public/maps/${mapId}/locations.json`, `public/maps/${mapId}/metadata.json`,
    `map-sources/catalog/${mapId}-placement-rejections.json`]) {
    const data = bytes(path.join(snapshot.stage, file)); assert.equal(digest(data), manifest.outputHashes[file]);
    const document = file === contentFile ? content : file === candidatesFile ? candidates : null;
    pending.set(file, changed && document && !equal(JSON.parse(data), document) ? Buffer.from(`${JSON.stringify(document, null, 2)}\n`) : data);
  }
}
for (const file of [import.meta.filename, "scripts/lib/native-item-placements.mjs", "scripts/lib/native-inventory-condition.mjs",
  "scripts/build-placement-catalog.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
for (const [file, data] of pending) {
  const destination = path.join(output, file); fs.mkdirSync(path.dirname(destination), { recursive: true });
  writeGeneratedFile(destination, data); outputHashes[file] = digest(data);
}
const next = { ...Object.fromEntries(["configPath", "storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath", "sceneContentPath"]
  .map((key) => [key, manifest[key]])), kind: "canonical-inventory-condition-stage", maps: manifest.maps,
  baselineStage: snapshot.stage, snapshotPath, placementRoots: roots,
  stats: { maps: manifest.maps.length, appearances, identities: identities.size, refinedAppearances: changes.length, conditionalOwners: conditionalOwners.size },
  changes, hashes, outputHashes, requiresGameplayAvailabilityReview: true,
  requiresSavedStateMigrationBeforePublication: manifest.requiresSavedStateMigrationBeforePublication, publishedDataUnchanged: true };
writeGeneratedFile(path.join(output, "stage-manifest.json"), `${JSON.stringify(next, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), stats: next.stats, changes }));
