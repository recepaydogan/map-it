import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert.equal(process.argv.length, 7, "Usage: stage-character-role-stock-refresh.mjs <canonical> <raw-stage> <role-audit> <inventory-audit> <fresh-output>");
const root = path.resolve(import.meta.dirname, "..");
const [canonical, raw, roleAuditPath, inventoryAuditPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const destination = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
const relativeOutput = path.relative(boundary, destination);
assert(relativeOutput && !relativeOutput.startsWith("..") && !path.isAbsolute(relativeOutput) && !fs.existsSync(output));
const hashes = {}, outputHashes = {}, pending = new Map();
const digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, file).replaceAll("\\", "/");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = relative(absolute);
  const hash = digest(data); assert(!hashes[key] || hashes[key] === hash, `Input changed: ${key}`); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const serialize = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const keyed = (rows) => {
  const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result;
};
const roles = read(roleAuditPath), inventory = read(inventoryAuditPath), baseline = read(path.join(canonical, "stage-manifest.json"));
const rawManifest = read(path.join(raw, "stage-manifest.json"));
assert.equal(roles.kind, "canonical-character-role-source-review"); assert.deepEqual(roles.errors, []);
assert.equal(inventory.kind, "native-trade-inventory-source-and-delta-audit"); assert.deepEqual(inventory.unexpectedDeltas, []);
assert.equal(path.resolve(roles.canonical), canonical); assert.equal(path.resolve(roles.raw), raw); assert.equal(path.resolve(inventory.after), raw);
assert.deepEqual([...baseline.maps].sort(), [...rawManifest.maps].sort());
assert.equal(roles.stats.maps, baseline.maps.length); assert.equal(inventory.stats.maps, baseline.maps.length);
for (const proof of [roles, inventory]) for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale source proof: ${file}`);
for (const [file, expected] of Object.entries(baseline.outputHashes)) {
  const data = bytes(path.join(canonical, file)); assert.equal(digest(data), expected, `Canonical artifact changed: ${file}`); pending.set(file, data);
}
const roleKeys = new Map(roles.changes.map((change) => [`${change.mapId}/${change.id}`, change]));
const inventoryKeys = new Map(inventory.additions.map((change) => [`${change.mapId}/${change.id}`, change]));
const entranceKeys = new Map(inventory.entranceChanges.map((change) => [`${change.mapId}/${change.id}`, change]));
const capabilityKeys = new Map(roles.capabilityChanges.map((change) => [`${change.mapId}/${change.id}`, change]));
const factionKeys = new Map(roles.factionChanges.map((change) => [`${change.mapId}/${change.id}`, change]));
const changes = [], stats = { maps: baseline.maps.length, appearances: 0, identities: 0, roles: 0, inventoryProfiles: 0,
  capabilityChanges: 0, factionChanges: 0, entranceChanges: 0, preservedNamedStock: 0, immutableFiles: 0 };
const ids = new Set(), updatedFiles = new Set();
const updateFields = (target, source, fields) => {
  for (const field of fields) {
    if (Object.hasOwn(source, field)) target[field] = structuredClone(source[field]);
    else delete target[field];
  }
};
for (const mapId of baseline.maps) {
  const paths = { content: `public/maps/${mapId}/content.json`, locations: `public/maps/${mapId}/locations.json`,
    placement: `map-sources/catalog/${mapId}-placements.json`, rejections: `map-sources/catalog/${mapId}-placement-rejections.json` };
  const old = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(path.join(canonical, file))]));
  const next = structuredClone(old);
  const generated = Object.fromEntries(Object.entries(paths).map(([key, file]) => [key, read(path.join(raw, file))]));
  const entities = keyed(generated.content.entities), candidates = keyed(generated.placement.candidates), markers = keyed(generated.locations.locations);
  const oldEntities = keyed(old.content.entities);
  for (const entity of next.content.entities) {
    const key = `${mapId}/${entity.id}`, source = entities.get(entity.id), original = oldEntities.get(entity.id);
    assert(source, `Canonical entity missing from current generation: ${key}`);
    assert.deepEqual(source.worldPosition, entity.worldPosition); assert.equal(source.templateId, entity.templateId); assert.equal(source.statsId, entity.statsId);
    const role = roleKeys.get(key);
    if (role) {
      assert.equal(role.before, entity.kind); assert.equal(role.after, source.kind);
      updateFields(entity, source, ["kind", "tags", "vendor"]); stats.roles++;
      if (original.vendor && !source.vendor) for (const name of original.vendor.namedStock) {
        assert(source.tradeInventory?.namedStock.includes(name), `Role change loses named stock: ${key}/${name}`); stats.preservedNamedStock++;
      }
    } else { assert.equal(source.kind, entity.kind); assert.deepEqual(source.vendor, entity.vendor); }
    if (source.tradeInventory || source.sceneContext?.authoredTradeInventory) {
      assert(inventoryKeys.has(key), `Inventory lacks native proof: ${key}`);
      updateFields(entity, source, ["tradeInventory"]);
      if (source.sceneContext?.authoredTradeInventory) {
        assert(entity.sceneContext?.inventoryChange); entity.sceneContext.authoredTradeInventory = structuredClone(source.sceneContext.authoredTradeInventory);
      }
      stats.inventoryProfiles++;
    }
    if (!isDeepStrictEqual(original, entity)) changes.push({ mapId, id: entity.id, title: entity.title,
      fields: [...new Set([...Object.keys(original), ...Object.keys(entity)])].filter((field) => !isDeepStrictEqual(original[field], entity[field])) });
    ids.add(entity.id); stats.appearances++;
  }
  for (const candidate of next.placement.candidates) {
    const key = `${mapId}/${candidate.id}`, source = candidates.get(candidate.id); assert(source);
    if (capabilityKeys.has(key)) { updateFields(candidate, source, ["characterCapabilities"]); stats.capabilityChanges++; }
    else assert.deepEqual(source.characterCapabilities, candidate.characterCapabilities);
    if (factionKeys.has(key)) { updateFields(candidate, source, ["factionHostile"]); stats.factionChanges++; }
    else assert.deepEqual(source.factionHostile, candidate.factionHostile);
    if (roleKeys.has(key)) updateFields(candidate, source, ["candidateKind"]);
    else assert.equal(source.candidateKind, candidate.candidateKind);
    if (entranceKeys.has(key)) {
      updateFields(candidate, source, ["mapPosition", "mapPositionAdjustment"]); stats.entranceChanges++;
      const adjustment = next.rejections.adjustedCandidates.find((row) => row.id === candidate.id);
      const current = generated.rejections.adjustedCandidates.find((row) => row.id === candidate.id); assert(current);
      if (adjustment) Object.assign(adjustment, structuredClone(current));
      else next.rejections.adjustedCandidates.push(structuredClone(current));
    } else { assert.deepEqual(source.mapPosition, candidate.mapPosition); assert.deepEqual(source.mapPositionAdjustment, candidate.mapPositionAdjustment); }
  }
  for (const marker of next.locations.locations) {
    const key = `${mapId}/${marker.contentId}`, source = markers.get(marker.id); assert(source && source.contentId === marker.contentId);
    if (roleKeys.has(key)) updateFields(marker, source, ["category", "subtype", "label"]);
    if (entranceKeys.has(key)) updateFields(marker, source, ["x", "y"]);
  }
  for (const [key, file] of Object.entries(paths)) if (!isDeepStrictEqual(next[key], old[key])) {
    pending.set(file, serialize(next[key])); updatedFiles.add(file);
  }
}
assert.equal(stats.roles, roles.stats.changedAppearances); assert.equal(stats.capabilityChanges, roles.stats.capabilityChanges);
assert.equal(stats.factionChanges, roles.stats.factionChanges);
stats.identities = ids.size; stats.immutableFiles = [...pending.keys()].filter((file) => !updatedFiles.has(file)).length;
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected, `Input changed during composition: ${file}`);
fs.mkdirSync(output);
const write = (file, value) => {
  const data = Buffer.isBuffer(value) ? value : serialize(value), target = path.join(output, file);
  fs.mkdirSync(path.dirname(target), { recursive: true }); writeGeneratedFile(target, data); outputHashes[file] = digest(data);
};
for (const [file, data] of pending) write(file, data);
write("role-stock-refresh-report.json", { kind: "canonical-role-stock-refresh", canonical, raw, roleAuditPath, inventoryAuditPath,
  hashes, outputHashes: { ...outputHashes }, stats, changes, pendingNavigationReview: inventory.recoveredAppearances ?? [],
  scope: "Source-proven role, capability, inventory and display-anchor fields merged into existing canonical identities. Other content, map ownership and raster files retained. Independent full conservation and consumer audits still required before publication." });
write("stage-manifest.json", { ...baseline, kind: "canonical-role-stock-refresh-stage", previousCanonical: canonical,
  sourceStageRoot: raw, configPath: rawManifest.configPath, outputHashes: { ...outputHashes },
  roleAuditPath, inventoryAuditPath, pendingNavigationReview: inventory.recoveredAppearances ?? [],
  publishedDataUnchanged: true, requiresRoutingAndConservationReview: true });
console.log(JSON.stringify({ output, stats }, null, 2));
