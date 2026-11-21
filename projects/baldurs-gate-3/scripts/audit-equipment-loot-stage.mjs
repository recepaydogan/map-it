import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compose independently parsed native fields/identities, then verify every
// changed map record and every old/new acquisition without producer imports.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: audit-equipment-loot-stage.mjs <stage> <native-field-audit> <identity-audit> <before-items> <after-items> <report>");
const [stage, coveragePath, identityPath, beforeItemsPath, afterItemsPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {};
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).split(path.sep).join("/"), digest = createHash("sha256").update(value).digest("hex");
  assert(!hashes[key] || hashes[key] === digest, `Input changed: ${key}`); hashes[key] = digest;
  return value;
};
const read = (file) => JSON.parse(bytes(file).toString("utf8"));
const verifyHashes = (values) => {
  for (const [file, expected] of Object.entries(values)) {
    bytes(file); assert.equal(hashes[file], expected, `Stale source proof: ${file}`);
  }
};
const omit = (object, fields) => Object.fromEntries(Object.entries(object).filter(([key]) => !fields.includes(key)));
const canonical = (value) => JSON.stringify(value, (_, entry) => entry && !Array.isArray(entry) && typeof entry === "object"
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b))) : entry);
const manifest = read(path.join(stage, "stage-manifest.json")), coverage = read(coveragePath), identity = read(identityPath);
assert.equal(manifest.kind, "authored-equipment-loot-stage");
assert.deepEqual(coverage.errors, []); assert.deepEqual(identity.errors, []);
assert.equal(coverage.mapsRoot, manifest.source); assert.equal(coverage.stats.maps, manifest.maps.length);
verifyHashes(manifest.hashes); verifyHashes(coverage.hashes); verifyHashes(identity.hashes);
const catalog = read(manifest.catalogPath), nativeCatalog = read(catalog.inputs.equipmentCatalog);
assert.deepEqual(catalog.definitions, nativeCatalog.definitions);
const generatingItems = read(catalog.inputs.itemDatabase).items;
const itemById = new Map(generatingItems.map((item) => [item.id, item]));
const gameplay = read("map-sources/catalog/gameplay-stats.json").entries;
const equipmentFacet = (drop) => {
  const item = itemById.get(drop.equipmentSource.itemId);
  const facts = gameplay[drop.statsId] ?? { type: item.type, rarity: item.rarity, ...item.gameplay };
  if (!["uncommon", "rare", "veryrare", "legendary"].includes(facts.rarity?.toLowerCase())) return null;
  const shield = /shield/i.test(`${facts.weaponType ?? ""} ${facts.armorType ?? ""} ${facts.proficiency ?? ""}`)
    || facts.slot?.toLowerCase() === "melee offhand weapon";
  if (facts.type?.toLowerCase() === "weapon") return shield ? "unique-shield" : "unique-weapon";
  if (facts.type?.toLowerCase() !== "armor") return null;
  return shield ? "unique-shield" : ["amulet", "ring", "cloak"].includes(facts.slot?.toLowerCase()) ? "unique-jewellery" : "unique-armor";
};
const fieldsById = new Map([...coverage.appearances, ...coverage.unresolved].map((entry) => [`${entry.mapId}/${entry.contentId}`, entry]));
const expectedAcquisitions = new Map(), deferred = new Map(), identities = new Set();
let appearances = 0, profileCount = 0, lootAppearances = 0, dropRows = 0, dropAmount = 0;
const fieldObjects = new Map();
const verifyField = (field, actual, expected) => {
  assert.equal(actual?.value, expected?.value, `Native field value changed: ${field}`);
  if (!actual || actual.conflict) { assert.deepEqual(actual, expected); return; }
  if (!fieldObjects.has(actual.sourcePath)) fieldObjects.set(actual.sourcePath, new Map(read(actual.sourcePath).save.regions.Templates.GameObjects.map((object) => [object.MapKey.value, object])));
  const object = fieldObjects.get(actual.sourcePath).get(actual.objectId);
  assert(object && !Array.isArray(object[field]), `Equipment field is not a scalar source: ${actual.sourcePath}/${actual.objectId}`);
  assert.equal(actual.value, object[field]?.value ?? (field === "Equipment" ? "" : undefined));
  assert.equal(actual.field, field);
};
for (const mapId of manifest.maps) {
  const before = read(path.join(manifest.source, mapId, "content.json"));
  const after = read(path.join(stage, "public/maps", mapId, "content.json"));
  assert.deepEqual(omit(after, ["entities"]), omit(before, ["entities"]), `Map fields changed ${mapId}`);
  const oldEntities = Object.values(before.entities), newEntities = Object.values(after.entities);
  assert.deepEqual(newEntities.map(({ id }) => id), oldEntities.map(({ id }) => id));
  const oldLocations = read(path.join(manifest.source, mapId, "locations.json"));
  const newLocations = read(path.join(stage, "public/maps", mapId, "locations.json"));
  assert.deepEqual(omit(newLocations, ["locations"]), omit(oldLocations, ["locations"]));
  assert.deepEqual(newLocations.locations.map(({ id }) => id), oldLocations.locations.map(({ id }) => id));
  assert(bytes(path.join(manifest.source, mapId, "metadata.json")).equals(bytes(path.join(stage, "public/maps", mapId, "metadata.json"))));
  const locationById = new Map(oldLocations.locations.map((location) => [location.contentId, location]));
  const dropsById = new Map();
  for (let index = 0; index < oldEntities.length; index++) {
    const old = oldEntities[index], current = newEntities[index], native = fieldsById.get(`${mapId}/${old.id}`);
    appearances++; identities.add(old.id);
    if (!native?.fields.Equipment || native.fields.Equipment.conflict || !native.fields.Equipment.value) {
      assert.deepEqual(current, old, `Unexpected equipment attachment ${mapId}/${old.id}`); continue;
    }
    const definitionId = native.fields.Equipment.value, definition = catalog.definitions[definitionId], profile = current.authoredEquipment;
    assert(profile, `Missing native equipment profile ${mapId}/${old.id}`); profileCount++;
    for (const field of ["Equipment", "IsEquipmentLootable", "IsLootable"]) verifyField(field, profile.fields[field], native.fields[field]);
    assert.deepEqual(Object.keys(profile.fields).sort(), Object.keys(native.fields).sort());
    assert.equal(profile.characterContentId, native.characterId); assert.equal(profile.definitionId, definitionId);
    assert.deepEqual([...profile.inventoryReferences].sort((a, b) => canonical(a).localeCompare(canonical(b))),
      [...native.inventoryReferences].sort((a, b) => canonical(a).localeCompare(canonical(b))));
    const later = Boolean(old.storyDestination) || old.id !== native.characterId;
    assert.equal(profile.scene, later ? "requires-scene-review" : "authored-placement");
    const expectedDrops = new Map();
    const expectedGroups = (definition?.groups ?? []).map((group, groupIndex) => ({ sourcePath: definition.sourcePath, sourceLine: group.sourceLine,
      entries: group.entries.map((entry) => {
        const reference = catalog.references[entry.statsId]; assert(reference);
        const item = reference.status === "resolved" ? itemById.get(reference.itemIds[0]) : undefined;
        if (item) { assert.equal(reference.itemIds.length, 1); assert.equal(item.statsId, entry.statsId); assert(item.templateIds.includes(reference.rootTemplateId)); }
        const priorInventory = [...(old.deathLoot?.guaranteedDrops ?? []), ...(old.deathLoot?.randomLootPools ?? []).flatMap((pool) => pool.possibleLoot ?? [])];
        const overlaps = item && (priorInventory.some((drop) => drop.statsId === entry.statsId || drop.templateId === reference.rootTemplateId)
          || native.inventoryReferences.some((entry) => entry.itemName === item.statsId || entry.templateId === reference.rootTemplateId));
        const status = later ? "requires-scene-review"
          : native.fields.IsLootable?.value === false || native.fields.IsEquipmentLootable?.value === false ? "not-lootable"
            : native.fields.IsLootable?.value !== true || native.fields.IsEquipmentLootable?.value !== true ? "lootability-unresolved"
              : !item ? "item-identity-unresolved"
                : group.entries.length !== 1 ? "equipment-group-alternatives" : overlaps ? "inventory-overlap" : "authored-death-loot";
        if (status !== "authored-death-loot") deferred.set(status, (deferred.get(status) ?? 0) + 1);
        else {
          const existing = expectedDrops.get(item.id), sourceGroup = { groupIndex, sourceLine: entry.sourceLine };
          if (existing) { existing.amount++; existing.equipmentSource.groups.push(sourceGroup); }
          else expectedDrops.set(item.id, { itemName: entry.statsId, title: item.name, statsId: entry.statsId, templateId: reference.rootTemplateId,
            amount: 1, canBePickpocketed: false, guaranteedOnDeath: true, rarity: item.rarity, ...(item.gameplay.slot ? { slot: item.gameplay.slot } : {}), unique: item.unique,
            equipmentSource: { definitionId, itemId: item.id, sourcePath: definition.sourcePath, groups: [sourceGroup] } });
        }
        return { statsId: entry.statsId, sourceLine: entry.sourceLine, ...(item ? { itemId: item.id, rootTemplateId: reference.rootTemplateId } : { candidateItemIds: reference.candidateItemIds }), status };
      }) }));
    assert.deepEqual(profile.groups, expectedGroups);
    assert.deepEqual(omit(profile, ["fields", "groups", "inventoryReferences"]), { characterContentId: native.characterId, definitionId,
      scene: later ? "requires-scene-review" : "authored-placement", ...(!definition ? { reviewReason: "equipment-definition-not-found" } : {}) });
    const drops = [...expectedDrops.values()];
    const expected = { ...old, authoredEquipment: profile };
    if (drops.length) {
      lootAppearances++; dropRows += drops.length; dropAmount += drops.reduce((sum, drop) => sum + drop.amount, 0);
      expected.deathLoot = { ...old.deathLoot, guaranteedDrops: [...(old.deathLoot?.guaranteedDrops ?? []), ...drops],
        treasureTables: old.deathLoot?.treasureTables ?? [], randomLootPools: old.deathLoot?.randomLootPools ?? [] };
      dropsById.set(old.id, drops);
      const location = locationById.get(old.id); assert(location, `Equipment owner has no marker ${mapId}/${old.id}`);
      const position = old.partyMember?.positions?.find(({ contentId }) => contentId === old.id);
      for (const drop of drops) {
        const acquisition = { kind: "drop", sourceId: old.partyMember?.memberId ? `party-member:${old.partyMember.memberId}` : old.id,
          source: old.localizedTitles?.en ?? old.title, localizedSources: Object.fromEntries(Object.entries({ en: old.localizedTitles?.en ?? old.title, tr: old.localizedTitles?.tr }).filter(([, value]) => value)),
          ...(position?.localizedConditions ? { locationDetail: position.localizedConditions.en, localizedLocationDetails: position.localizedConditions } : {}),
          mapId, mapName: read(path.join(manifest.source, mapId, "metadata.json")).displayName ?? mapId, locationId: location.id,
          ...(location.region ? { region: location.region } : {}), certainty: "guaranteed", ...(drop.amount > 1 ? { amount: drop.amount } : {}) };
        expectedAcquisitions.set(`${drop.equipmentSource.itemId}/${canonical(acquisition)}`, acquisition);
      }
    }
    assert.deepEqual(current, expected, `Unrelated entity or inventory fields changed ${mapId}/${old.id}`);
  }
  for (let index = 0; index < oldLocations.locations.length; index++) {
    const old = oldLocations.locations[index], current = newLocations.locations[index], drops = dropsById.get(old.contentId);
    if (!drops) { assert.deepEqual(current, old); continue; }
    assert.deepEqual(omit(current, ["searchTerms", "categoryFacets"]), omit(old, ["searchTerms", "categoryFacets"]));
    assert.deepEqual(current.searchTerms.slice(0, old.searchTerms.length), old.searchTerms);
    const allowedTerms = new Set(drops.flatMap((drop) => [drop.title, drop.itemName, drop.rarity]).filter(Boolean));
    for (const term of current.searchTerms.slice(old.searchTerms.length)) assert(allowedTerms.has(term), `Unrelated search addition ${mapId}`);
    for (const term of allowedTerms) assert(current.searchTerms.includes(term), `New equipment is not searchable ${mapId}/${term}`);
    assert.deepEqual((current.categoryFacets ?? []).slice(0, (old.categoryFacets ?? []).length), old.categoryFacets ?? []);
    assert.deepEqual([...new Set(current.categoryFacets ?? [])].sort(),
      [...new Set([...(old.categoryFacets ?? []), ...drops.map(equipmentFacet).filter(Boolean)])].sort(), `Incorrect equipment filters ${mapId}/${old.id}`);
  }
}
const beforeItems = read(beforeItemsPath), afterItems = read(afterItemsPath);
assert.deepEqual(afterItems.items.map(({ id }) => id), beforeItems.items.map(({ id }) => id));
assert.deepEqual(omit(afterItems, ["generatedAt", "stats", "items"]), omit(beforeItems, ["generatedAt", "stats", "items"]));
assert.deepEqual(omit(afterItems.stats, ["acquisitionRecords"]), omit(beforeItems.stats, ["acquisitionRecords"]));
let preservedAcquisitions = 0, newAcquisitions = 0, renumberedAcquisitions = 0;
const changedItems = [], found = new Set();
for (let index = 0; index < beforeItems.items.length; index++) {
  const old = beforeItems.items[index], current = afterItems.items[index];
  assert.deepEqual(omit(current, ["acquisitions"]), omit(old, ["acquisitions"]), `Item facts changed ${old.id}`);
  const previous = new Map(old.acquisitions.map((entry) => [canonical(omit(entry, ["id"])), entry]));
  const next = new Map(current.acquisitions.map((entry) => [canonical(omit(entry, ["id"])), entry]));
  assert.equal(previous.size, old.acquisitions.length); assert.equal(next.size, current.acquisitions.length);
  for (const [key, entry] of previous) {
    assert(next.has(key), `Lost acquisition ${old.id}/${key}`); preservedAcquisitions++;
    if (entry.id !== next.get(key).id) renumberedAcquisitions++;
  }
  let additions = 0;
  for (const [key] of next) {
    const expectedKey = `${old.id}/${key}`;
    if (expectedAcquisitions.has(expectedKey)) found.add(expectedKey);
    if (previous.has(key)) continue;
    assert(expectedAcquisitions.has(expectedKey), `Unproven acquisition added ${expectedKey}`); newAcquisitions++; additions++;
  }
  if (additions) changedItems.push({ id: old.id, name: old.name, addedAcquisitions: additions });
}
assert.equal(found.size, expectedAcquisitions.size, "An authored equipment drop has no exact acquisition");
assert.equal(preservedAcquisitions + newAcquisitions, afterItems.stats.acquisitionRecords);
verifyHashes(hashes);
const report = { kind: "equipment-loot-source-conservation-audit", errors: [], stage,
  stats: { maps: manifest.maps.length, appearances, identities: identities.size, profileCount, lootAppearances, dropRows, dropAmount,
    items: afterItems.items.length, preservedAcquisitions, newAcquisitions, renumberedAcquisitions, acquisitionRecords: afterItems.stats.acquisitionRecords,
    changedItems: changedItems.length, deferredEntryRows: Object.fromEntries(deferred) }, changedItems, hashes,
  scope: "Full baseline map/item conservation and exact native-source equipment additions. Serial acquisition IDs may renumber. Deferred scene, overlap, lootability and identity cases remain open; no runtime/visual certification." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
