import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compare completed artifacts independently of the item/index/search builders.
assert.equal(process.argv.length, 6, "Usage: audit-role-stock-consumers.mjs <search-stage> <old-index> <new-index> <report>");
const root = path.resolve(import.meta.dirname, "..");
const [stage, oldIndexPath, indexPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, fields) => Object.fromEntries(Object.entries(value).filter(([field]) => !fields.includes(field)));
const keyed = (rows, selector = ({ id }) => id) => {
  const result = new Map(rows.map((row) => [selector(row), row])); assert.equal(result.size, rows.length); return result;
};
const setEqual = (a, b) => a.size === b.size && [...a].every((value) => b.has(value));
const canonical = (rows) => rows.map((row) => JSON.stringify(row)).sort();
const manifest = read(path.join(stage, "stage-manifest.json"));
assert.equal(manifest.kind, "canonical-acquisition-search-stage");
const previousStage = manifest.previousSearchStage, baseline = read(path.join(previousStage, "stage-manifest.json"));
const proof = read(manifest.searchAuditPath), roles = read(manifest.roleAuditPath);
assert.equal(proof.kind, "independent-canonical-role-stock-conservation"); assert.equal(proof.after, previousStage);
assert.deepEqual(proof.errors, []); assert.deepEqual(roles.errors, []);
assert.deepEqual(manifest.maps, baseline.maps); assert.deepEqual(manifest.pendingNavigationReview, baseline.pendingNavigationReview);
for (const [file, expected] of Object.entries(proof.hashes)) assert.equal(digest(bytes(file)), expected, `Stale map proof: ${file}`);
for (const [directory, document] of [[previousStage, baseline], [stage, manifest]]) for (const [file, expected] of Object.entries(document.outputHashes)) {
  assert.equal(digest(bytes(path.join(directory, file))), expected, `Changed artifact: ${file}`);
}
const oldItems = read(manifest.previousItemsPath), items = read(manifest.itemsPath);
assert.deepEqual(items.items.map(({ id }) => id), oldItems.items.map(({ id }) => id));
assert.deepEqual(omit(items, ["items", "generatedAt", "stats"]), omit(oldItems, ["items", "generatedAt", "stats"]));
assert.deepEqual(omit(items.stats, ["acquisitionRecords"]), omit(oldItems.stats, ["acquisitionRecords"]));
const metadata = new Map(), markers = new Map(), priorMarkers = new Map(), entities = new Map();
for (const id of manifest.maps) {
  metadata.set(id, read(path.join(stage, `public/maps/${id}/metadata.json`)));
  const document = read(path.join(stage, `public/maps/${id}/locations.json`));
  const previous = read(path.join(previousStage, `public/maps/${id}/locations.json`));
  assert.deepEqual(omit(document, ["locations"]), omit(previous, ["locations"]));
  assert.deepEqual(document.locations.map(({ id }) => id), previous.locations.map(({ id }) => id));
  for (const marker of document.locations) markers.set(`${id}/${marker.id}`, marker);
  for (const marker of previous.locations) priorMarkers.set(`${id}/${marker.id}`, marker);
  for (const entity of read(path.join(stage, `public/maps/${id}/content.json`)).entities) entities.set(`${id}/${entity.id}`, entity);
}
const vendorChanges = roles.changes.filter((change) => change.after === "vendor");
const stockContext = (mapId, entity) => ({
  sourceId: entity.storyDestination?.characterContentId ?? entity.id.split(":")[0], source: entity.title,
  localizedSources: entity.localizedTitles, mapId, mapName: metadata.get(mapId).displayName,
  locationId: entity.id, region: markers.get(`${mapId}/${entity.id}`).region,
});
const additions = [], oldById = keyed(oldItems.items);
let retainedAcquisitions = 0, acquisitions = 0, changedAcquisitionArrays = 0;
for (const item of items.items) {
  const old = oldById.get(item.id); assert.deepEqual(omit(item, ["acquisitions"]), omit(old, ["acquisitions"]));
  const remaining = item.acquisitions.map((row) => omit(row, ["id"]));
  assert.equal(new Set(item.acquisitions.map(({ id }) => id)).size, item.acquisitions.length);
  for (const row of old.acquisitions) {
    const index = remaining.findIndex((candidate) => isDeepStrictEqual(candidate, omit(row, ["id"])));
    assert(index >= 0, `Lost or changed acquisition: ${item.id}/${row.id}`); remaining.splice(index, 1); retainedAcquisitions++;
  }
  for (const row of remaining) {
    const entity = entities.get(`${row.mapId}/${row.locationId}`);
    assert(vendorChanges.some(({ mapId, id }) => mapId === row.mapId && id === row.locationId));
    assert(entity?.vendor?.namedStock.includes(item.name), `Added stock not in reviewed vendor profile: ${item.id}`);
    assert.deepEqual(row, { kind: "vendor", certainty: "stock", ...stockContext(row.mapId, entity) });
    assert(old.acquisitions.some((prior) => prior.kind === "vendor" && prior.certainty === "stock"
      && prior.sourceId === row.sourceId), `Added item lacks an existing exact-owner stock identity: ${item.id}`);
    additions.push({ itemId: item.id, name: item.name, row });
  }
  // A newly restored scene vendor must expose every already-resolved stock
  // identity of that same native owner, not just whichever additions appeared.
  for (const { mapId, id } of vendorChanges) {
    const entity = entities.get(`${mapId}/${id}`);
    if (!entity.vendor.namedStock.includes(item.name)) continue;
    const context = stockContext(mapId, entity);
    if (!old.acquisitions.some((row) => row.kind === "vendor" && row.certainty === "stock" && row.sourceId === context.sourceId)) continue;
    assert(item.acquisitions.some((row) => isDeepStrictEqual(omit(row, ["id"]), { kind: "vendor", certainty: "stock", ...context })),
      `Reviewed scene vendor stock is missing: ${mapId}/${id}/${item.id}`);
  }
  if (!isDeepStrictEqual(item.acquisitions, old.acquisitions)) changedAcquisitionArrays++;
  acquisitions += item.acquisitions.length;
}
assert.equal(oldItems.stats.acquisitionRecords, retainedAcquisitions);
assert.equal(items.stats.acquisitionRecords, acquisitions); assert.equal(acquisitions, retainedAcquisitions + additions.length);

const equipmentClass = (item) => {
  const facts = { type: item.type, rarity: item.rarity, ...item.gameplay };
  if (!["uncommon", "rare", "veryrare", "legendary"].includes(facts.rarity?.toLowerCase())) return null;
  const type = facts.type?.toLowerCase(), slot = facts.slot?.toLowerCase();
  const shield = /shield/i.test([facts.weaponType, facts.armorType, facts.proficiency].join(" ")) || slot === "melee offhand weapon";
  if (type === "weapon") return shield ? "shield" : "weapon";
  return type !== "armor" ? null : shield ? "shield" : ["amulet", "ring", "cloak"].includes(slot) ? "jewellery" : "armor";
};
const collectSearch = (rows) => {
  const result = new Map();
  for (const item of rows) {
    const kind = equipmentClass(item); if (!kind) continue;
    for (const row of item.acquisitions) {
      if (!row.mapId || !row.locationId) continue;
      const key = `${row.mapId}/${row.locationId}`, entry = result.get(key) ?? { terms: new Set(), facets: new Set() };
      for (const term of [item.name, ...Object.values(item.localizedNames ?? {}), item.statsId, item.rarity]) if (term) entry.terms.add(term);
      entry.facets.add(`unique-${kind}`); result.set(key, entry);
    }
  }
  return result;
};
const oldSearch = collectSearch(oldItems.items), newSearch = collectSearch(items.items), searchChanges = [];
for (const [key, marker] of markers) {
  const prior = priorMarkers.get(key), old = oldSearch.get(key) ?? { terms: new Set(), facets: new Set() }, next = newSearch.get(key) ?? { terms: new Set(), facets: new Set() };
  const expected = structuredClone(prior);
  if (!setEqual(old.terms, next.terms) || !setEqual(old.facets, next.facets)) {
    expected.searchTerms = [...new Set([...(prior.searchTerms ?? []).filter((term) => !old.terms.has(term) || next.terms.has(term)), ...next.terms])];
    expected.categoryFacets = [...new Set([...(prior.categoryFacets ?? []).filter((facet) => !old.facets.has(facet) || next.facets.has(facet)), ...next.facets])];
  }
  assert.deepEqual(marker, expected, `Unrelated or incomplete search change: ${key}`);
  if (!isDeepStrictEqual(marker, prior)) searchChanges.push({ key, addedTerms: marker.searchTerms.filter((term) => !prior.searchTerms.includes(term)) });
}
let immutableFiles = 0;
for (const [file, hash] of Object.entries(baseline.outputHashes)) {
  assert(Object.hasOwn(manifest.outputHashes, file), `Lost stage artifact: ${file}`);
  if (manifest.outputHashes[file] === hash) immutableFiles++;
  else assert(manifest.maps.some((id) => file === `public/maps/${id}/locations.json`));
}
const oldIndex = read(oldIndexPath), index = read(indexPath);
assert.deepEqual(omit(index, ["locations", "relationships"]), omit(oldIndex, ["locations", "relationships"]));
const oldLocations = keyed(oldIndex.locations, ({ mapId, id }) => `${mapId}/${id}`);
assert.deepEqual([...keyed(index.locations, ({ mapId, id }) => `${mapId}/${id}`).keys()].sort(), [...oldLocations.keys()].sort());
assert.equal(index.locations.length, markers.size);
const roleKeys = new Set(roles.changes.map(({ mapId, id }) => `${mapId}/${id}`));
const entranceKeys = new Set(read(manifest.inventoryAuditPath).entranceChanges.map(({ mapId, id }) => `${mapId}/${id}`));
for (const location of index.locations) {
  const key = `${location.mapId}/${location.id}`, old = oldLocations.get(key), marker = markers.get(key);
  assert(marker); const expected = structuredClone(old);
  for (const field of ["category", "label", "subtype"]) if (roleKeys.has(key)) expected[field] = marker[field];
  for (const field of ["x", "y"]) if (entranceKeys.has(key)) expected[field] = marker[field];
  if (searchChanges.some((row) => row.key === key)) {
    const gameplay = expected.gameplay ?? {};
    const terms = [...marker.searchTerms, ...["rarity", "slot", "armorType", "weaponType", "proficiency"].map((field) => gameplay[field]),
      gameplay.unique ? "unique" : ""];
    expected.searchTerms = [...new Set(terms.filter((term) => typeof term === "string").map((term) => term.trim()).filter(Boolean).map((term) => term.slice(0, 240)))];
    expected.categoryFacets = marker.categoryFacets;
  }
  assert.deepEqual(location, expected, `Unexpected index change: ${key}`);
}
const groupings = new Map();
for (const row of index.locations) {
  if (["transition", "vertical-access"].includes(row.category)) continue;
  const key = `${row.category}:${row.name}`, group = groupings.get(key) ?? []; group.push(row); groupings.set(key, group);
}
const relations = [];
for (const [key, group] of groupings) {
  if (group.length < 2 || group.length > 12 || new Set(group.map(({ mapId }) => mapId)).size < 2) continue;
  relations.push({ id: `name-${createHash("sha1").update(key).digest("hex").slice(0, 12)}`, kind: "exact-name-match", confidence: "uncertain",
    name: group[0].name, category: group[0].category, appearances: group.map(({ mapId, id }) => ({ mapId, locationId: id })) });
}
assert.deepEqual(canonical(index.relationships), canonical(relations));
for (const file of [import.meta.filename, "scripts/stage-acquisition-search.mjs", "scripts/lib/sync-acquisition-search.mjs",
  "scripts/lib/unique-equipment.mjs", "scripts/build-map-search-index.mjs", "scripts/build-item-database.mjs"]) bytes(file);
const stats = { maps: manifest.maps.length, appearances: markers.size, items: items.items.length, retainedAcquisitions, acquisitions,
  addedStockAcquisitions: additions.length, changedAcquisitionArrays, searchChanges: searchChanges.length,
  immutableFiles, retainedConnections: index.connections.length, uncertainNameGroups: index.relationships.length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "independent-role-stock-consumers", stage, stats, additions, searchChanges, hashes, errors: [],
  scope: "Whole item facts and old acquisition payloads preserved; restored stock scene links require exact native-owner identity and reviewed vendor profiles. All search changes reconstructed from acquisitions; full index rows and name groups checked, connections retained unchanged. Does not certify existing connection semantics, conditional merchant presence, non-vendor trade availability or remaining scene/map completeness." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, searchChanges, errors: [] }, null, 2));
