import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { splitArguments, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Verify native objects and completed outputs without importing classification
// or capability production code. This is a real-source audit, not fixtures.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 7, "Usage: audit-native-character-role-sources.mjs <before> <after> <old-config> <role-evidence> <report>");
const [before, after, oldConfigPath, evidencePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, cache = new Map(), digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (object, fields) => Object.fromEntries(Object.entries(object).filter(([key]) => !fields.includes(key)));
const objects = (file) => {
  const absolute = path.resolve(root, file);
  if (!cache.has(absolute)) {
    const rows = read(absolute).save?.regions?.Templates?.GameObjects;
    assert(Array.isArray(rows), `No native objects: ${file}`);
    const index = new Map(rows.map((row) => [row.MapKey?.value, row])); assert.equal(index.size, rows.length);
    cache.set(absolute, index);
  }
  return cache.get(absolute);
};
const manifest = read(path.join(after, "stage-manifest.json")), previousManifest = read(path.join(before, "stage-manifest.json"));
assert.deepEqual(manifest, previousManifest); assert.equal(manifest.recordsIncluded, true);
const config = read(manifest.configPath), oldConfig = read(oldConfigPath), evidence = read(evidencePath);
const treasure = read(path.resolve(root, config.treasureTables));
const members = read(path.resolve(root, config.partyMembers)).members;
const nativeCapabilities = (record, map) => {
  const nativeId = record.storyDestination?.characterContentId
    ?? (record.partyPosition ? members.find(({ id }) => id === record.partyPosition.memberId)?.characterId : null)
    ?? record.id.split(":")[0];
  assert(nativeId);
  const capabilities = {};
  for (const { sourcePath } of record.provenance) {
    if (!sourcePath.endsWith(".lsj") || sourcePath.startsWith("root-templates/")) continue;
    const files = sourcePath.startsWith("supplementary/")
      ? config.supplementaryPlacementRoots.map((directory) => path.resolve(root, directory, sourcePath.slice("supplementary/".length)))
      : [path.resolve(root, config.placementRoots[map.placementRoot], sourcePath)];
    const existing = files.filter((file) => fs.existsSync(file));
    if (!existing.length) continue;
    assert.equal(existing.length, 1, `Ambiguous native source: ${sourcePath}`);
    const object = objects(existing[0]).get(nativeId);
    if (!object) continue;
    for (const [native, field] of [["CanFight", "canFight"], ["CanJoinCombat", "canJoinCombat"]]) if (Object.hasOwn(object, native)) {
      assert.equal(object[native].type, "bool"); assert.equal(typeof object[native].value, "boolean"); capabilities[field] = object[native].value;
    }
  }
  return Object.keys(capabilities).length ? capabilities : undefined;
};
const roleKeys = new Map();
for (const review of evidence.reviews) {
  assert.equal(review.kind, "vendor"); assert(review.reason);
  const object = objects(review.sourcePath).get(review.characterId); assert(object);
  const tables = (object.TradeTreasures ?? []).flatMap((group) => (group.TreasureItem ?? []).map((item) => item.Object.value));
  assert.deepEqual(tables, review.tradeTables); assert(tables.length);
  for (const table of tables) assert(treasure.tables[table]?.namedStockIds.length, `No native stock: ${table}`);
  for (const [field, expected] of Object.entries(review.capabilities ?? {})) {
    const native = field === "canFight" ? "CanFight" : field === "canJoinCombat" ? "CanJoinCombat" : null;
    assert(native); assert.equal(object[native]?.value, expected);
  }
  if (review.tag) {
    const tags = (object.Tags ?? []).flatMap((group) => (group.Tag ?? []).map((tag) => tag.Object.value));
    assert(tags.includes(review.tag.id));
    const tag = read(review.tag.sourcePath).save.regions.Tags;
    assert.equal(tag.UUID.value, review.tag.id); assert.equal(tag.Name.value, review.tag.name);
    assert(/(?:^|_)VENDOR$/.test(tag.Name.value));
  } else {
    const setup = review.shopSetup; assert(setup);
    const text = bytes(setup.sourcePath).toString("utf8"), lines = text.split(/\r?\n/), lookup = createStoryRuleLookup(text);
    const call = lines[setup.callLine - 1].trim(), procedure = lines[setup.procedureLine - 1].trim(), shop = lines[setup.shopLine - 1].trim();
    const callRule = lookup(setup.callLine), setupRule = lookup(setup.shopLine);
    assert(!callRule.debugOnly && !setupRule.debugOnly);
    assert(setup.arrivalLine >= callRule.sourceLine && setup.arrivalLine <= callRule.endLine);
    assert.equal(lines[setupRule.sourceLine - 1].trim(), "PROC");
    assert.equal(setupRule.sourceLine + 1, setup.procedureLine);
    assert.equal(call.split("(")[0], procedure.split("(")[0]);
    assert.equal(parseEndpoint(splitArguments(call)[0]).id, review.characterId);
    const parameter = splitArguments(procedure)[0].replace(/^\([A-Z]+\)/, "");
    assert(shop.startsWith("DB_ItemShopTrigger("));
    const shopArguments = splitArguments(shop);
    assert.equal(shopArguments.length, 2); assert.equal(parseEndpoint(shopArguments[0])?.cast, "trigger");
    assert.equal(shopArguments[1], parameter);
    const arrival = splitArguments(lines[setup.arrivalLine - 1].trim());
    assert.equal(parseEndpoint(arrival[0]).id, review.characterId);
    for (const id of review.arrivalIds ?? []) assert.equal(id, `${review.characterId}:destination:${parseEndpoint(arrival[1]).id}`);
  }
  for (const id of [review.characterId, ...(review.arrivalIds ?? [])]) {
    const key = `${review.mapId}/${id}`; assert(!roleKeys.has(key)); roleKeys.set(key, review);
  }
}
assert.deepEqual(omit(config, ["maps"]), omit(oldConfig, ["maps"]));
assert.deepEqual(config.maps.map(({ id }) => id), oldConfig.maps.map(({ id }) => id));
for (const old of oldConfig.maps) {
  const current = config.maps.find(({ id }) => id === old.id), overrides = { ...old.candidateKindOverrides };
  for (const [key, review] of roleKeys) if (review.mapId === old.id) overrides[key.slice(old.id.length + 1)] = review.kind;
  assert.deepEqual(current, Object.keys(overrides).length ? { ...old, candidateKindOverrides: overrides } : old);
}
let records = 0, explicitCapabilities = 0, candidates = 0;
const changes = [];
for (const mapId of manifest.maps) {
  const map = config.maps.find(({ id }) => id === mapId), load = (directory, file) => read(path.join(directory, file));
  const file = `map-sources/catalog/${mapId}-placements.json`;
  const old = load(before, file), current = load(after, file);
  assert.equal(current.records.length, old.records.length);
  for (let i = 0; i < current.records.length; i += 1) {
    const row = current.records[i]; records += 1;
    assert.deepEqual(omit(row, ["characterCapabilities"]), old.records[i]);
    const capabilities = row.placementKind === "characters" ? nativeCapabilities(row, map) : undefined;
    assert.deepEqual(row.characterCapabilities, capabilities, `Wrong authored capability: ${mapId}/${row.id}`);
    if (capabilities) explicitCapabilities += 1;
  }
  assert.deepEqual(omit(current, ["generatedAt", "records", "candidates"]), omit(old, ["generatedAt", "records", "candidates"]));
  assert.deepEqual(current.candidates.map(({ id }) => id), old.candidates.map(({ id }) => id));
  for (let i = 0; i < current.candidates.length; i += 1) {
    const row = current.candidates[i], previous = old.candidates[i]; candidates += 1;
    assert.deepEqual(omit(row, ["characterCapabilities", "candidateKind"]), omit(previous, ["candidateKind"]));
    const review = roleKeys.get(`${map.floorVolumeSelection?.mapId ?? mapId}/${row.id}`);
    if (review) { assert.equal(row.candidateKind, review.kind); assert.deepEqual(row.tradeTreasures, review.tradeTables); }
    if (row.candidateKind === previous.candidateKind) continue;
    const noncombatant = row.characterCapabilities?.canFight === false || row.characterCapabilities?.canJoinCombat === false;
    const shopOnly = /shop/i.test(`${row.internalName} ${row.stats}`) && previous.candidateKind === "vendor";
    assert(review || noncombatant || shopOnly, `Unexplained role change: ${mapId}/${row.id}`);
    // Disabled initial capabilities do not cancel an authored combat group;
    // native story events may explicitly enable its members later.
    if (noncombatant && !review && !row.combatGroupId) assert.notEqual(row.candidateKind, "enemy");
    changes.push({ mapId, id: row.id, name: row.displayName.en, before: previous.candidateKind, after: row.candidateKind,
      evidence: review ? "reviewed-native-merchant" : noncombatant ? "explicit-native-combat-disabled" : "shop-name-is-not-a-vendor-role" });
  }
  const rejection = `map-sources/catalog/${mapId}-placement-rejections.json`;
  assert.deepEqual(load(after, rejection), load(before, rejection));
  for (const [suffix, field, allowed] of [["content.json", "entities", ["kind", "tags", "vendor"]], ["locations.json", "locations", ["category", "subtype", "label"]]]) {
    const previous = load(before, `public/maps/${mapId}/${suffix}`), next = load(after, `public/maps/${mapId}/${suffix}`);
    assert.deepEqual(omit(next, [field]), omit(previous, [field])); assert.equal(next[field].length, previous[field].length);
    for (let i = 0; i < next[field].length; i += 1) {
      assert.deepEqual(omit(next[field][i], allowed), omit(previous[field][i], allowed));
      if (!changes.some((row) => row.mapId === mapId && row.id === next[field][i].id)) assert.deepEqual(next[field][i], previous[field][i]);
    }
  }
}
for (const file of [import.meta.filename, "scripts/build-placement-catalog.mjs", "scripts/lib/character-capabilities.mjs"]) bytes(file);
const result = { kind: "native-character-role-source-and-conservation", errors: [], before, after, hashes, changes,
  stats: { maps: manifest.maps.length, records, explicitCapabilities, candidates, changedRoles: changes.length, reviewedMerchantIdentities: roleKeys.size },
  scope: "Exact native capability values/merge provenance, native merchant tags/stock and bound shop initialization; real before/after source records, candidate identities and unrelated content conserved. Does not prove all faction dispositions, conditional presence, complete merchant coverage, acquisition availability or whole-map publication readiness." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats: result.stats, changes, errors: [] }, null, 2));
