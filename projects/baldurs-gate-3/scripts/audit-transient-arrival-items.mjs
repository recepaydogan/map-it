import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Audit actual item builds, not a simulated acquisition projection.
assert.equal(process.argv.length, 7, "Usage: audit-transient-arrival-items.mjs <paired-inputs> <before-items> <after-items> <record-audit> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [inputs, beforeItems, afterItems, recordAudit, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const outRelative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(outRelative && !outRelative.startsWith("..") && !path.isAbsolute(outRelative) && !fs.existsSync(output));
const hashes = {}, errors = [], conditioned = [], renamed = [], retiredVendorLinks = [], retiredDeathLinks = [], addedEquipmentPossessions = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data)); hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const keyed = (rows) => { const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result; };
const keyOf = (row) => JSON.stringify(row, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b, "en"))) : entry);
const proof = read(recordAudit), manifest = read(path.join(inputs, "input-manifest.json"));
assert.deepEqual(proof.errors, []); assert.equal(manifest.auditPath, recordAudit);
for (const [file, expected] of Object.entries({ ...proof.hashes, ...manifest.hashes })) assert.equal(digest(bytes(file)), expected, `Changed proof/input: ${file}`);
for (const [file, expected] of Object.entries(manifest.outputHashes)) assert.equal(digest(bytes(path.join(inputs, file))), expected);
const scenes = read(manifest.afterSceneCatalog), profiles = keyed(scenes.profiles), changes = new Map();
for (const mapId of manifest.maps) {
  const previous = read(path.join(inputs, "before", mapId, "content.json")), current = read(path.join(inputs, "after", mapId, "content.json"));
  const previousEntities = keyed(previous.entities), entities = keyed(current.entities);
  assert.equal(digest(bytes(path.join(inputs, "before", mapId, "metadata.json"))), digest(bytes(path.join(inputs, "after", mapId, "metadata.json"))));
  for (const match of proof.matches.filter((row) => row.mapId === mapId)) {
    const before = previousEntities.get(match.id), after = entities.get(match.id), profile = profiles.get(match.profileId);
    assert(before && after && profile && after.sceneContext.id === profile.id);
    assert.equal(before.storyDestination.characterContentId, profile.characterContentId);
    assert.equal(before.storyDestination.anchorContentId, profile.anchorContentId);
    const metadata = read(path.join(inputs, "after", mapId, "metadata.json"));
    const marker = read(path.join(inputs, "after", mapId, "locations.json")).locations.find((row) => row.contentId === match.id);
    assert(marker);
    changes.set(`${mapId}/${match.id}`, { before, after, profile, mapId, metadata, marker });
  }
}
assert.equal(changes.size, proof.matches.length);
const previous = read(beforeItems), current = read(afterItems), oldItems = keyed(previous.items), newItems = keyed(current.items);
assert.deepEqual([...oldItems.keys()], [...newItems.keys()]);
assert.deepEqual(omit(previous, ["items", "generatedAt", "stats"]), omit(current, ["items", "generatedAt", "stats"]));
assert.deepEqual(omit(previous.stats, ["acquisitionRecords"]), omit(current.stats, ["acquisitionRecords"]));
const equipmentAdditions = new Map();
for (const change of changes.values()) {
  const equipment = change.after.sceneContext?.equipmentChange;
  if (!equipment || equal(equipment, change.before.sceneContext?.equipmentChange)) continue;
  assert(!change.before.sceneContext?.equipmentChange && equipment.mode === "copy-equipped", "Equipment replacement needs separate route-delta review");
  assert.deepEqual(equipment, change.profile.equipmentChange);
  const conditions = equipment.localizedConditions;
  for (const entry of equipment.items) {
    const item = newItems.get(entry.itemId); assert(item);
    assert.equal(item.statsId, entry.statsId); assert(item.templateIds.includes(entry.templateId));
    assert.deepEqual(item.localizedNames, entry.localizedNames); assert.equal(item.name, entry.title);
    const expected = { kind: "carried", sourceId: change.profile.characterContentId,
      source: change.after.localizedTitles?.en ?? change.after.title,
      localizedSources: Object.fromEntries(Object.entries({ en: change.after.localizedTitles?.en ?? change.after.title,
        tr: change.after.localizedTitles?.tr }).filter(([, value]) => value)),
      mapId: change.mapId, mapName: change.metadata.displayName ?? change.mapId, locationId: change.marker.id,
      ...(change.marker.region ? { region: change.marker.region } : {}), certainty: "story",
      detail: conditions.en, localizedDetails: conditions, locationDetail: conditions.en, localizedLocationDetails: conditions,
      ...(entry.amount > 1 ? { amount: entry.amount } : {}) };
    const key = `${item.id}/${keyOf(expected)}`; assert(!equipmentAdditions.has(key));
    assert(!oldItems.get(item.id).acquisitions.some((route) => keyOf(omit(route, ["id"])) === keyOf(expected)), "Copied equipment route already present");
    equipmentAdditions.set(key, expected);
  }
}
let oldAcquisitions = 0, newAcquisitions = 0, unchanged = 0;
for (const item of current.items) {
  const old = oldItems.get(item.id); assert.deepEqual(omit(item, ["acquisitions"]), omit(old, ["acquisitions"]));
  oldAcquisitions += old.acquisitions.length; newAcquisitions += item.acquisitions.length;
  const remaining = new Map();
  for (const row of item.acquisitions) { const key = keyOf(omit(row, ["id"])); remaining.set(key, [...(remaining.get(key) ?? []), row]); }
  for (const route of old.acquisitions) {
    const change = changes.get(`${route.mapId}/${route.locationId}`);
    if (change?.after.deathLoot?.availability?.deathDropsUnavailable && route.kind === "drop") {
      assert(change.profile.deathDropsUnavailable && change.after.deathLoot.availability.id === change.profile.id);
      assert.equal(route.sourceId, change.profile.characterContentId);
      assert(!item.acquisitions.some((row) => row.kind === "drop" && row.mapId === route.mapId && row.locationId === route.locationId));
      retiredDeathLinks.push({ itemId: item.id, name: item.name, route }); continue;
    }
    if (change?.before.vendor && !change.after.vendor && route.kind === "vendor") {
      assert(change.after.kind === "npc" && change.after.tradeInventory?.availability === "unverified");
      assert.equal(route.sourceId, change.profile.characterContentId);
      assert(!item.acquisitions.some((row) => row.kind === "vendor" && row.mapId === route.mapId && row.locationId === route.locationId));
      retiredVendorLinks.push({ itemId: item.id, name: item.name, route }); continue;
    }
    let expected = omit(route, ["id"]), hasCondition = false, hasName = false;
    if (change?.after.deathLoot && ["drop", "pickpocket", "random-loot"].includes(route.kind)) {
      const conditions = change.profile.lootAvailability;
      assert.deepEqual(change.after.deathLoot.availability.localizedConditions, conditions);
      const conditionedRoute = { ...expected, certainty: "story", detail: conditions.en, localizedDetails: conditions,
        locationDetail: conditions.en, localizedLocationDetails: conditions };
      hasCondition = keyOf(conditionedRoute) !== keyOf(expected); expected = conditionedRoute;
    }
    if (change?.profile.localizedTitles) {
      const renamedRoute = { ...expected, source: change.profile.localizedTitles.en, localizedSources: change.profile.localizedTitles };
      hasName = keyOf(renamedRoute) !== keyOf(expected); expected = renamedRoute;
    }
    const match = remaining.get(keyOf(expected));
    if (!match?.length) errors.push({ issue: "Unreviewed acquisition change", itemId: item.id, route, expected });
    else match.pop();
    if (hasCondition) conditioned.push({ itemId: item.id, mapId: route.mapId, locationId: route.locationId, kind: route.kind });
    if (hasName) renamed.push({ itemId: item.id, mapId: route.mapId, locationId: route.locationId, kind: route.kind });
    if (!hasCondition && !hasName) unchanged++;
  }
  for (const route of [...remaining.values()].flat()) {
    const key = `${item.id}/${keyOf(omit(route, ["id"]))}`;
    if (equipmentAdditions.has(key)) { equipmentAdditions.delete(key); addedEquipmentPossessions.push({ itemId: item.id, route }); }
    else errors.push({ issue: "Unproven new acquisition", itemId: item.id, route });
  }
}
for (const [key, expected] of equipmentAdditions) errors.push({ issue: "Missing copied equipment possession", key, expected });
assert.equal(previous.stats.acquisitionRecords, oldAcquisitions); assert.equal(current.stats.acquisitionRecords, newAcquisitions);
for (const file of [import.meta.filename, "scripts/build-item-database.mjs", "scripts/lib/scene-content-profile.mjs"]) bytes(file);
for (const [file, expected] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), expected);
const stats = { regionalMaps: manifest.maps.length, preservedItems: oldItems.size, oldAcquisitions, newAcquisitions,
  unchangedAcquisitions: unchanged, conditionedAcquisitions: conditioned.length, renamedAcquisitions: renamed.length,
  addedConditionalEquipmentPossessions: addedEquipmentPossessions.length,
  retiredFalseSceneVendorLinks: retiredVendorLinks.length, retiredUnavailableDeathLinks: retiredDeathLinks.length, errorCount: errors.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "transient-arrival-item-consumer-audit", inputs, beforeItems, afterItems, recordAudit,
  stats, conditioned, renamed, retiredVendorLinks, retiredDeathLinks, addedEquipmentPossessions, hashes, errors,
  scope: "Actual paired regional item builds: all item facts and acquisition payload multisets, with only source-reviewed scene conditions/names, false scene vendor links and unavailable death links changed. Other inventory methods and source evidence remain separate; ordinary appearances are preserved. Not the full canonical item/index merge." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats, errors: errors.slice(0, 8) }, null, 2));
if (errors.length) process.exitCode = 1;
