import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independently reconstruct inventory and named-pool identities from native
// objects, definitions and Stats. Source membership is NOT gameplay availability.
assert.equal(process.argv.length, 4,
  "Usage: audit-reconciled-scene-item-sources.mjs <consumer-review> <fresh-report>");
const root = path.resolve(import.meta.dirname, "..");
const [reviewPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, errors = [], findings = [], sceneReviews = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const relative = (file) => path.relative(root, path.resolve(root, file)).replaceAll("\\", "/");
const bytes = (file) => {
  const data = fs.readFileSync(path.resolve(root, file)), key = relative(file), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash, `Input changed while reading: ${key}`);
  hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const lines = new Map();
const sourceLines = (file) => {
  const key = relative(file);
  if (!lines.has(key)) lines.set(key, bytes(file).toString("utf8").split(/\r?\n/));
  return lines.get(key);
};
const check = (condition, message) => { if (!condition) errors.push(message); };
const value = (field) => field?.value ?? field?.handle;
const canonical = (row) => JSON.stringify(row, (_key, child) => child && typeof child === "object" && !Array.isArray(child)
  ? Object.fromEntries(Object.entries(child).sort(([a], [b]) => a.localeCompare(b, "en"))) : child);
const unique = (values) => [...new Set(values)].sort();
const files = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name); return entry.isDirectory() ? files(file) : [file];
});
const review = read(reviewPath);
assert.equal(review.kind, "reconciled-map-consumer-conservation-review"); assert.deepEqual(review.errors, []);
for (const [file, hash] of Object.entries(review.hashes)) assert.equal(digest(bytes(file)), hash, `Stale consumer proof: ${file}`);
const mapAudit = read(review.proofPath), manifest = read(path.join(mapAudit.stage, "stage-manifest.json"));
const reconciliation = read(manifest.conservationAuditPath), scenes = read(manifest.sceneContentPath);
for (const [file, hash] of Object.entries(scenes.hashes)) assert.equal(digest(bytes(file)), hash, `Stale scene source: ${file}`);
const profiles = new Map(scenes.profiles.map((row) => [row.id, row]));
const database = read(review.itemsPath);
const hints = read(path.join(path.dirname(review.itemsPath), "inventory-item-resolution.json")).entries;
const targets = [...reconciliation.additions, ...reconciliation.changes.filter((row) => row.fields.includes("sceneContext"))
  .map((row) => ({ ...row, mapId: row.toMap }))];
assert.equal(new Set(targets.map((row) => `${row.mapId}/${row.id}`)).size, targets.length);
const entities = new Map(), locations = new Map(), metadata = new Map();
for (const mapId of unique(targets.map((row) => row.mapId))) {
  const base = path.join(mapAudit.stage, "public/maps", mapId);
  metadata.set(mapId, read(path.join(base, "metadata.json")));
  for (const entity of read(path.join(base, "content.json")).entities) entities.set(`${mapId}/${entity.id}`, entity);
  for (const pin of read(path.join(base, "locations.json")).locations) locations.set(`${mapId}/${pin.id}`, pin);
}
const nativeFiles = new Map();
const nativeObjects = (file) => {
  const key = relative(file);
  if (!nativeFiles.has(key)) {
    const objects = read(file).save?.regions?.Templates?.GameObjects; assert(Array.isArray(objects), `Not native objects: ${file}`);
    nativeFiles.set(key, new Map(objects.map((object) => [value(object.MapKey), object])));
  }
  return nativeFiles.get(key);
};
let nativeItemFiles;
const findInventoryObject = (objectId, hint) => {
  if (hint?.objectSourcePath) {
    const object = nativeObjects(hint.objectSourcePath).get(objectId);
    assert(object, `Missing inventory object at locator: ${objectId}`);
    return { object, sourcePath: relative(hint.objectSourcePath) };
  }
  // Non-lootable inventory is absent from the producer's resolution output.
  // Locate it independently rather than interpreting absent hints as no item.
  nativeItemFiles ??= ["map-sources/extracted/package-placements", "map-sources/converted/wld-placements",
    "map-sources/converted/main-level-placements", "map-sources/converted/auxiliary-level-placements"]
    .flatMap((directory) => files(path.join(root, directory))).filter((file) => file.endsWith(".lsj") && file.split(path.sep).includes("Items"));
  const matches = nativeItemFiles.map((file) => ({ sourcePath: relative(file), object: nativeObjects(file).get(objectId) })).filter((row) => row.object);
  if (!matches.length) return undefined;
  for (const entry of matches) assert.deepEqual(entry.object, matches[0].object, `Conflicting inventory object extracts: ${objectId}`);
  return matches[0];
};
const nativeActor = (entity, actorId) => {
  const candidates = entity.provenance.filter((entry) => /\/Characters\/.*\.lsj$/.test(entry.sourcePath)).flatMap((entry) => {
    const source = entry.sourcePath;
    const paths = source.startsWith("supplementary/")
      ? [path.join(root, "map-sources/extracted/package-placements", source.slice("supplementary/".length))]
      : ["map-sources/converted/wld-placements", "map-sources/converted/main-level-placements", "map-sources/converted/auxiliary-level-placements"]
        .map((prefix) => path.join(root, prefix, source));
    return paths.filter((file) => fs.existsSync(file)).map((file) => ({ sourcePath: relative(file), object: nativeObjects(file).get(actorId) })).filter((row) => row.object);
  });
  assert(candidates.length, `Native actor unavailable: ${actorId}`);
  for (const row of candidates) assert.deepEqual(row.object, candidates[0].object, `Conflicting actor extracts: ${actorId}`);
  return candidates[0];
};
const moduleOrder = ["Shared", "SharedDev", "Gustav", "GustavDev", "Honour", "GustavX"];
const order = (file) => moduleOrder.findIndex((name) => file.split(path.sep).includes(name));
const sortFiles = (values) => values.sort((a, b) => order(a) - order(b) || a.localeCompare(b, "en"));
const templates = new Map();
for (const file of sortFiles(files(path.join(root, "map-sources/extracted/root-templates")).filter((file) => file.endsWith(".lsj")))) {
  for (const [id, object] of nativeObjects(file)) templates.set(id, { object, sourcePath: relative(file) });
}
const templateField = (id, key, trail = []) => {
  assert(!trail.includes(id), `Template cycle: ${id}`);
  const entry = templates.get(id); assert(entry, `Unknown native template: ${id}`);
  if (Object.hasOwn(entry.object, key)) return value(entry.object[key]);
  const parent = value(entry.object.ParentTemplateId);
  return parent ? templateField(parent, key, [...trail, id]) : undefined;
};
const stats = new Map();
for (const file of sortFiles(files(path.join(root, "map-sources/extracted/item-stats"))
  .filter((file) => /(?:Armor|Weapon|Object)\.txt$/.test(file)))) {
  let current;
  for (const [index, raw] of sourceLines(file).entries()) {
    const line = raw.trim(), values = [...line.matchAll(/"((?:\\.|[^"\\])*)"/g)].map((match) => match[1]);
    if (line.startsWith("new entry ")) {
      const previous = stats.get(values[0]);
      current = { id: values[0], previous, parent: null, data: {}, evidence: {} }; stats.set(current.id, current);
    } else if (current && line.startsWith("using ")) current.parent = values[0];
    else if (current && line.startsWith("data ")) {
      current.data[values[0]] = values[1]; current.evidence[values[0]] = { sourcePath: relative(file), sourceLine: index + 1 };
    }
  }
}
const statField = (id, key, trail = [], current = stats.get(id)) => {
  assert(current && !trail.includes(current), `Unknown/cyclic Stats: ${id}`);
  if (Object.hasOwn(current.data, key)) return { value: current.data[key], ...current.evidence[key] };
  if (!current.parent) return undefined;
  return statField(current.parent, key, [...trail, current], current.parent === current.id ? current.previous : stats.get(current.parent));
};
const itemForTemplate = (templateId, statsId) => {
  const matches = database.items.filter((item) => item.templateIds.includes(templateId) && item.statsId === statsId);
  assert.equal(matches.length, 1, `Ambiguous/missing native item: ${templateId}/${statsId}`);
  return matches[0];
};
const itemForStat = (statsId) => {
  const reference = statField(statsId, "RootTemplate"); assert(reference?.value, `No explicit native Stats root: ${statsId}`);
  return { item: itemForTemplate(reference.value.toLowerCase(), statsId), reference };
};
const tables = new Map();
for (const file of sortFiles(files(path.join(root, "map-sources/extracted/stats")).filter((file) => path.basename(file) === "TreasureTable.txt"))) {
  let current, previous;
  for (const [index, raw] of sourceLines(file).entries()) {
    const line = raw.trim(), values = [...line.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
    if (line.startsWith("new treasuretable ")) {
      previous = tables.get(values[0]); current = { id: values[0], rows: [], sourcePath: relative(file), sourceLine: index + 1 }; tables.set(current.id, current);
    } else if (current && /^CanMerge\s+1$/.test(line) && previous) current.rows.push(...previous.rows);
    else if (current && line.startsWith("object category ")) current.rows.push({ category: values[0], sourcePath: relative(file), sourceLine: index + 1, statement: line });
  }
}
const poolEntries = (id, trail = []) => {
  assert(!trail.includes(id), `Treasure cycle: ${id}`);
  const table = tables.get(id); assert(table, `Unknown native treasure table: ${id}`);
  return table.rows.flatMap((row) => row.category.startsWith("T_") ? poolEntries(row.category.slice(2), [...trail, id]) : [row]);
};
const objectTables = (object) => unique((object.Treasures ?? []).flatMap((entry) => entry.TreasureItem ?? []).map((entry) => value(entry.Object)).filter(Boolean));
const routeRows = new Map();
for (const item of database.items) for (const acquisition of item.acquisitions) {
  const key = `${acquisition.mapId}/${acquisition.locationId}`;
  routeRows.set(key, [...(routeRows.get(key) ?? []), { itemId: item.id, acquisition }]);
}
const reviewedNew = new Set();
for (const target of targets) {
  const key = `${target.mapId}/${target.id}`, entity = entities.get(key), profile = profiles.get(entity.sceneContext.id);
  assert(profile && entity.storyDestination.characterContentId === profile.characterContentId);
  const native = nativeActor(entity, profile.characterContentId), owner = native.object;
  assert.equal(value(owner.TemplateName), entity.templateId);
  assert(!profile.inventoryChange, `Unimplemented runtime inventory derivation: ${profile.id}`);
  const nativeRows = (owner.ItemList ?? []).flatMap((group) => group.Item ?? []), inventory = [], expected = new Map();
  const add = (item, kind, amount, conditions, evidence) => {
    const identity = `${item.id}/${kind}`;
    const row = { itemId: item.id, kind, amount, conditions, evidence };
    if (expected.has(identity)) {
      const existing = expected.get(identity);
      assert.equal(existing.amount, amount, `Conflicting amounts: ${key}/${identity}`);
      assert.deepEqual(existing.conditions, conditions, `Conflicting scene conditions: ${key}/${identity}`);
      existing.evidence.push(...evidence);
    } else expected.set(identity, row);
  };
  for (const [index, entry] of nativeRows.entries()) {
    const objectId = value(entry.UUID), itemName = value(entry.ItemName);
    let templateId = value(entry.TemplateID), objectSourcePath, statsId;
    if (objectId) {
      const hint = hints.filter((row) => row.ownerId === profile.characterContentId && row.itemName === itemName)
        .flatMap((row) => row.entries).find((row) => row.objectId === objectId);
      const found = findInventoryObject(objectId, hint);
      if (found) {
        objectSourcePath = found.sourcePath; templateId = value(found.object.TemplateName); statsId = value(found.object.Stats);
      } else findings.push({ profileId: profile.id, kind: "inventory-uuid-not-in-extracted-item-placements", objectId,
        sourcePath: native.sourcePath, itemIndex: index, authoredTemplateId: templateId,
        scope: "Identity below uses the explicit ItemList template only; no placed-object override is proved." });
    }
    assert(templateId, `Non-template inventory requires explicit review: ${profile.id}/${itemName}`);
    statsId ||= templateField(templateId, "Stats");
    const item = itemForTemplate(templateId, statsId), amount = value(entry.Amount);
    assert(Number.isInteger(amount) && amount > 0, `Unreviewed inventory amount: ${profile.id}/${itemName}`);
    const evidence = { sourcePath: native.sourcePath, actorId: profile.characterContentId, itemIndex: index, itemName,
      objectId: objectId || undefined, templateId, statsId, objectSourcePath, amount,
      droppedOnDeath: value(entry.IsDroppedOnDeath) === true, pickpocketable: value(entry.CanBePickpocketed) === true,
      onlyInLoadout: (entry.OnlyInNPCLoadout ?? []).map((row) => value(row.Object)),
      excludeInLoadout: (entry.ExcludeInNPCLoadout ?? []).map((row) => value(row.Object)) };
    inventory.push({ ...evidence, itemId: item.id });
    const matching = (entity.deathLoot?.guaranteedDrops ?? []).filter((drop) => drop.itemName === itemName && (drop.objectId || undefined) === (objectId || undefined));
    if (evidence.droppedOnDeath || evidence.pickpocketable) {
      check(matching.some((drop) => drop.templateId === templateId && drop.statsId === statsId && drop.amount === amount
        && drop.canBePickpocketed === evidence.pickpocketable && drop.guaranteedOnDeath === evidence.droppedOnDeath), `Native inventory omitted/changed in map content: ${key}/${index}`);
    } else check(!matching.length, `Non-lootable native inventory advertised as loot: ${key}/${index}`);
    if (evidence.droppedOnDeath && profile.deathDropsUnavailable !== true) add(item, "drop", amount, profile.lootAvailability, [evidence]);
    if (evidence.pickpocketable) add(item, "pickpocket", amount, profile.lootAvailability, [evidence]);
  }
  // Multiple loadout variants are alternatives, not an extra stack. Do not
  // silently accept arbitrary duplicates merely because the producer dedupes.
  for (const itemId of unique(inventory.map((row) => row.itemId))) {
    const matches = inventory.filter((row) => row.itemId === itemId);
    if (matches.length < 2) continue;
    assert.equal(matches.length, 2, `Unreviewed duplicate native inventory: ${key}/${itemId}`);
    const only = matches.find((row) => row.onlyInLoadout.length === 1 && !row.excludeInLoadout.length);
    const excluded = matches.find((row) => row.excludeInLoadout.length === 1 && !row.onlyInLoadout.length);
    assert(only && excluded && only.onlyInLoadout[0] === excluded.excludeInLoadout[0], `Inventory rows not exclusive: ${key}/${itemId}`);
  }
  for (const drop of entity.deathLoot?.guaranteedDrops ?? []) {
    check(inventory.some((entry) => entry.itemName === drop.itemName && entry.templateId === drop.templateId
      && entry.statsId === drop.statsId && entry.amount === drop.amount), `Unproven map inventory entry: ${key}/${drop.itemName}`);
  }
  const inventoryShape = (entry) => ({ itemName: entry.itemName, objectId: entry.objectId || undefined,
    templateId: entry.templateId, statsId: entry.statsId, amount: entry.amount,
    droppedOnDeath: entry.droppedOnDeath, pickpocketable: entry.pickpocketable });
  const expectedInventory = inventory.filter((entry) => entry.droppedOnDeath || entry.pickpocketable).map(inventoryShape).map(canonical).sort();
  const actualInventory = (entity.deathLoot?.guaranteedDrops ?? []).map((entry) => inventoryShape({ ...entry,
    droppedOnDeath: entry.guaranteedOnDeath, pickpocketable: entry.canBePickpocketed })).map(canonical).sort();
  check(equal(actualInventory, expectedInventory), `Inventory multiplicity/flags differ from native rows: ${key}`);
  const poolIds = objectTables(owner), poolProofs = [];
  check(equal(poolIds, unique(entity.deathLoot?.treasureTables ?? [])), `Native pool list changed: ${key}`);
  check(equal(poolIds, (entity.deathLoot?.randomLootPools ?? []).map((entry) => entry.tableId).sort()), `Missing/duplicate content pool: ${key}`);
  for (const tableId of poolIds) for (const entry of poolEntries(tableId)) {
    if (!entry.category.startsWith("I_")) { poolProofs.push({ tableId, ...entry, itemCatalogRoute: false }); continue; }
    const statsId = entry.category.slice(2), { item, reference } = itemForStat(statsId);
    poolProofs.push({ tableId, ...entry, itemId: item.id, statsId, rootReference: reference });
    add(item, "random-loot", 1, profile.lootAvailability, [{ tableId, ...entry, statsId, rootReference: reference }]);
  }
  for (const pool of entity.deathLoot?.randomLootPools ?? []) {
    const named = unique(poolProofs.filter((entry) => entry.tableId === pool.tableId && entry.itemId).map((entry) => entry.statsId));
    check(equal(named, unique((pool.possibleLoot ?? []).filter((entry) => entry.kind === "item").map((entry) => entry.statsId))),
      `Named content pool membership differs from native table: ${key}/${pool.tableId}`);
  }
  const equipment = profile.equipmentChange, unresolved = [];
  if (equipment) {
    assert.deepEqual(entity.sceneContext.equipmentChange, equipment);
    const declared = [...equipment.items, ...(equipment.unresolvedEntries ?? [])];
    const equipmentFiles = unique(declared.flatMap((item) => item.evidence.map((entry) => entry.sourcePath)));
    assert.equal(equipmentFiles.length, 1, `Unreviewed multi-file equipment set: ${profile.id}`);
    const equipmentFile = equipmentFiles[0], definitions = sourceLines(equipmentFile), entries = [];
    let active = false, group;
    const groups = [];
    for (const [index, raw] of definitions.entries()) {
      const line = raw.trim();
      if (line.startsWith("new equipment ")) active = line === `new equipment "${equipment.definitionId}"`;
      if (active && line === "add equipmentgroup") { group = []; groups.push(group); }
      if (active && line.startsWith("add equipment entry ")) {
        const entry = { statsId: line.match(/"([^"]+)"/)[1], sourceLine: index + 1, statement: line };
        assert(group, `Equipment entry outside group: ${profile.id}`); group.push(entry); entries.push(entry);
      }
    }
    assert(groups.length && groups.every((entries) => entries.length === 1), `Equipment alternatives need separate branch review: ${profile.id}`);
    assert.deepEqual(entries.map((entry) => entry.statsId).sort(), declared.map((entry) => entry.statsId).sort(), `Incomplete native equipment set: ${profile.id}`);
    for (const entry of equipment.items) {
      const { item, reference } = itemForStat(entry.statsId);
      assert.equal(item.id, entry.itemId); assert.equal(reference.value, entry.templateId);
      assert.equal(entry.amount, 1);
      for (const citation of entry.evidence) assert.equal(sourceLines(citation.sourcePath)[citation.sourceLine - 1].trim(), citation.statement);
      assert(entries.some((row) => row.statsId === entry.statsId && entry.evidence.some((citation) => citation.sourceLine === row.sourceLine)));
      add(item, "carried", entry.amount, equipment.localizedConditions, [...entry.evidence, reference]);
    }
    for (const entry of equipment.unresolvedEntries ?? []) unresolved.push({ ...entry, status: "unresolved-native-reference-not-approved-item" });
  }
  const actual = routeRows.get(key) ?? [];
  for (const row of expected.values()) {
    const matches = actual.filter((entry) => entry.itemId === row.itemId && entry.acquisition.kind === row.kind);
    check(matches.length === 1, `Missing/duplicate acquisition: ${key}/${row.itemId}/${row.kind}/${matches.length}`);
    if (matches.length !== 1) continue;
    const acquisition = matches[0].acquisition;
    check((acquisition.amount ?? 1) === row.amount, `Wrong acquisition quantity: ${key}/${row.itemId}/${row.kind}`);
    check(acquisition.certainty === "story" && equal(acquisition.localizedDetails, row.conditions)
      && equal(acquisition.localizedLocationDetails, row.conditions) && acquisition.detail === row.conditions.en
      && acquisition.locationDetail === row.conditions.en, `Lost scene conditions: ${key}/${row.itemId}/${row.kind}`);
    check(acquisition.sourceId === profile.characterContentId && acquisition.source === entity.title
      && equal(acquisition.localizedSources, entity.localizedTitles), `Wrong scene actor/name: ${key}/${row.itemId}`);
    check(acquisition.mapName === metadata.get(target.mapId).displayName && acquisition.region === locations.get(key).region,
      `Wrong scene location: ${key}/${row.itemId}`);
  }
  for (const row of actual) check(expected.has(`${row.itemId}/${row.acquisition.kind}`), `Unexpected acquisition method/item: ${key}/${row.itemId}/${row.acquisition.kind}`);
  const pending = review.pendingNewAcquisitions.filter((row) => `${row.acquisition.mapId}/${row.acquisition.locationId}` === key);
  for (const row of pending) {
    assert(actual.some((entry) => entry.itemId === row.itemId && equal(entry.acquisition, row.acquisition)));
    reviewedNew.add(row.acquisition.id);
  }
  sceneReviews.push({ mapId: target.mapId, locationId: target.id, profileId: profile.id, actorId: profile.characterContentId,
    nativeSource: native.sourcePath, inventory, poolProofs, equipmentDefinition: equipment?.definitionId, unresolved,
    expectedRoutes: [...expected.values()], actualRoutes: actual.map((row) => ({ itemId: row.itemId, acquisitionId: row.acquisition.id, kind: row.acquisition.kind })),
    newRouteCount: pending.length, gameplayAvailability: "requires-separate-state-and-method-review" });
}
assert.equal(reviewedNew.size, review.pendingNewAcquisitions.length, "The source audit must cover the complete new-route queue");
for (const scene of sceneReviews) if (scene.unresolved.length) findings.push({ profileId: scene.profileId, kind: "unresolved-equipment-definition", entries: scene.unresolved });
bytes(import.meta.filename);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash, `Audit input changed: ${file}`);
const result = { kind: "independent-reconciled-scene-item-source-audit", reviewPath, stage: mapAudit.stage,
  stats: { reviewedScenes: sceneReviews.length, nativeActors: unique(sceneReviews.map((row) => row.actorId)).length,
    newAcquisitions: reviewedNew.size, actualSceneAcquisitions: sceneReviews.reduce((sum, row) => sum + row.actualRoutes.length, 0),
    zeroRouteScenes: sceneReviews.filter((row) => !row.actualRoutes.length).length,
    unresolvedEquipmentAppearances: sceneReviews.filter((row) => row.unresolved.length).length },
  sceneReviews, findings, hashes, errors, requiresGameplayAvailabilityReview: true,
  scope: "All added and content-changed scenes, including scenes with no item routes. Native ItemList UUID overrides, quantity/flags/loadout alternatives, complete named treasure pools, explicit Stats roots and equipment-definition membership independently reconstructed. No gameplay killability/pickpocket accessibility/scene-state completeness approval; runtime equipment branch guards and dynamic transfers still need separate review. No live data changed." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(output), stats: result.stats, errors: errors.slice(0,20), errorCount: errors.length, hashes: Object.keys(hashes).length }));
if (errors.length) process.exitCode = 1;
