import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Deliberately independent of the scene producer, rule parser and apply helpers.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 6) throw new Error("Usage: audit-scene-content-stage.mjs <scene-stage> <baseline-items> <scene-items> <report>");
const stage = path.resolve(root, process.argv[2]);
const hashes = {};
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).split(path.sep).join("/");
  const digest = createHash("sha256").update(value).digest("hex");
  assert(!hashes[key] || hashes[key] === digest, `Input changed: ${key}`);
  hashes[key] = digest;
  return value;
};
const read = (file) => JSON.parse(bytes(file).toString("utf8"));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const normalized = (line) => line.replace(/\s+\/\/.*$/, "").trim().replace(/;$/, "").replace(/\s+/g, " ");
const manifest = read(path.join(stage, "stage-manifest.json"));
assert.equal(manifest.kind, "isolated-scene-content-stage");
for (const [file, expected] of Object.entries(manifest.hashes)) {
  bytes(file);
  assert.equal(hashes[file], expected, `Stale stage source or changed live output: ${file}`);
}
const catalog = read(manifest.catalogPath), catalogs = [], recipes = [];
let ancestor = catalog;
const catalogPaths = new Set([manifest.catalogPath]);
while (ancestor) {
  catalogs.unshift(ancestor);
  recipes.unshift(read(ancestor.inputs.recipe));
  const parent = ancestor.inputs.baseCatalog;
  if (!parent) break;
  assert(!catalogPaths.has(parent), "Cyclic scene catalog inheritance");
  catalogPaths.add(parent);
  ancestor = read(parent);
}
const recipe = { reviews: recipes.flatMap(({ reviews }) => reviews), profiles: recipes.flatMap(({ profiles }) => profiles) };
const identityItems = catalog.inputs.items ? read(catalog.inputs.items).items : [];
const destinations = read(catalog.inputs.destinations).scriptedDestinations;
const party = read("map-sources/catalog/party-members.json").members;
const nativeFiles = new Set([...recipe.reviews.map(({ sourcePath }) => sourcePath), ...recipe.profiles.map(({ destinationSource }) => destinationSource)]);
assert.deepEqual(Object.keys(catalog.hashes).sort(), [...new Set([...catalogs.flatMap(({ inputs }) => Object.values(inputs)),
  "map-sources/catalog/party-members.json", ...nativeFiles])].sort(), "Scene catalog omits a source dependency");
for (const [file, expected] of Object.entries(catalog.hashes)) {
  bytes(file);
  assert.equal(hashes[file], expected, `Stale native source: ${file}`);
}
const native = new Map([...nativeFiles].map((file) => [file, bytes(file).toString("utf8").split(/\r?\n/)]));
const block = (file, actionLine) => {
  const lines = native.get(file);
  assert(lines, `Unknown rule source ${file}`);
  let first = actionLine - 1;
  while (first >= 0 && !["IF", "PROC", "QRY"].includes(lines[first].trim())) first--;
  assert(first >= 0, `Missing native rule start ${file}:${actionLine}`);
  let end = first + 1;
  while (end < lines.length && !["IF", "PROC", "QRY", "EXITSECTION", "INITSECTION"].includes(lines[end].trim())) end++;
  const then = lines.findIndex((line, index) => index > first && index < end && line.trim() === "THEN");
  assert(then > first && actionLine - 1 > then && actionLine - 1 < end, `Not a native action ${file}:${actionLine}`);
  const evidence = [];
  for (let index = first + 1; index < end; index++) {
    const statement = normalized(lines[index]);
    if (!statement || statement.startsWith("//") || ["AND", "THEN"].includes(statement)) continue;
    evidence.push({ sourcePath: file, sourceLine: index + 1, statement });
  }
  const guards = evidence.filter(({ sourceLine }) => sourceLine - 1 < then).map(({ statement }) => statement);
  assert(!guards.some((guard) => /(?:DEBUG|Debug_)/.test(guard)), `Debug-only scene ${file}:${actionLine}`);
  return { evidence, guards, actions: evidence.filter(({ sourceLine }) => sourceLine - 1 > then).map(({ statement }) => statement) };
};
const reviews = new Map();
for (const review of recipe.reviews) {
  assert(!reviews.has(review.id), `Duplicate review ${review.id}`);
  const source = block(review.sourcePath, review.actionLine);
  assert.deepEqual(source.guards, review.requiredGuards.map(normalized), `Complete native guard mismatch ${review.id}`);
  for (const action of review.requiredActions) assert(source.actions.includes(normalized(action)), `Missing effect ${review.id}: ${action}`);
  reviews.set(review.id, source.evidence);
}
assert.equal(catalog.profiles.length, recipe.profiles.length);
const profiles = new Map();
const sourceArguments = (statement) => statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"))
  .split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((argument) => argument.trim().replace(/^\([A-Z]+\)/, ""));
const sourceId = (argument) => argument.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)?.[0]?.toLowerCase();
const sceneInventory = (expected) => {
  const change = expected.inventoryChange;
  if (!change) return undefined;
  const transfer = reviews.get(change.transferReview);
  assert(expected.reviews.includes(change.transferReview));
  const call = transfer.find(({ statement }) => statement.startsWith("MoveAllItemsTo("));
  const args = sourceArguments(call.statement);
  assert.equal(sourceId(args[1]), change.destinationContentId);
  // The native overload names the first three switches. The documented sixth
  // switch controls vanity clothing. Zero is exclusion, not 'remove all'.
  assert.deepEqual(args.slice(2), ["0", "0", "1", "0"]);
  const branches = change.branches.map((branch) => {
    const flags = new Map();
    const items = branch.rows.map(({ sourceLine, statement }) => {
      const actual = normalized(native.get(change.sourcePath)[sourceLine - 1]);
      assert.equal(actual, normalized(statement));
      const args = sourceArguments(actual);
      if (args[0] === "_Char") {
        assert.equal(branch.reviewOnly, true, "Unresolved generic recipient was promoted to known possession");
        assert(expected.reviews.some((id) => reviews.get(id).some((entry) => entry.sourcePath === change.sourcePath && entry.sourceLine === sourceLine)));
      } else assert.equal(sourceId(args[0]), expected.characterContentId);
      if (args.length === 4 && sourceId(args[1]) !== "00000000-0000-0000-0000-000000000000") {
        const flagId = sourceId(args[1]), value = Number(args[2]);
        assert(flagId); assert([0, 1].includes(value));
        assert(!flags.has(flagId) || flags.get(flagId) === value);
        flags.set(flagId, value);
      }
      const templateId = sourceId(args.at(-1)), item = identityItems.find(({ id }) => id === templateId);
      assert(item && !item.generation && item.templateIds.includes(templateId), "No exact template-default item");
      return { itemId: item.id, templateId, statsId: item.statsId, title: item.name, localizedNames: item.localizedNames,
        amount: 1, evidence: [{ sourcePath: change.sourcePath, sourceLine, statement: actual }] };
    });
    return { id: branch.id, localizedConditions: branch.localizedConditions, items,
      requiredGlobalFlags: [...flags].map(([flagId, value]) => ({ flagId, value })), ...(branch.reviewOnly ? { reviewOnly: true } : {}) };
  });
  return { mode: "transfer-and-equip", destinationContentId: change.destinationContentId,
    transferOptions: { moveEquippedArmor: false, moveEquippedWeapons: false, clearOriginalOwner: true, moveVanityClothing: false },
    preservesStoryItems: true, contractSource: "https://docs.baldursgate3.game/index.php?title=MoveAllItemsTo",
    localizedConditions: change.localizedConditions, branches, evidence: transfer };
};
for (const expected of recipe.profiles) {
  const profile = catalog.profiles.find(({ id }) => id === expected.id);
  assert(profile, `Missing profile ${expected.id}`);
  const key = `${expected.characterContentId}/${expected.anchorContentId}`;
  assert(!profiles.has(key), `Duplicate scene ${key}`);
  const move = normalized(native.get(expected.destinationSource)[expected.destinationLine - 1]);
  let targets = [...move.matchAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi)].map(([id]) => id.toLowerCase());
  const bindingEvidence = [];
  if (expected.destinationBinding) {
    const row = expected.destinationBinding, statement = normalized(native.get(expected.destinationSource)[row.sourceLine - 1]);
    assert.equal(statement, normalized(row.statement));
    const args = sourceArguments(statement), predicate = statement.slice(0, statement.indexOf("("));
    const guard = block(expected.destinationSource, expected.destinationLine).guards.find((guard) => guard.startsWith(`${predicate}(`));
    assert(guard);
    const guardArgs = sourceArguments(guard);
    assert.equal(guardArgs.length, args.length);
    const bound = new Map(guardArgs.map((name, index) => [name, args[index]]));
    targets = sourceArguments(move).slice(0, 2).map((name) => sourceId(bound.get(name) ?? name));
    bindingEvidence.push({ sourcePath: expected.destinationSource, sourceLine: row.sourceLine, statement });
    assert(destinations.some(({ character, anchor, evidence }) => character.id === expected.characterContentId && anchor.id === expected.anchorContentId
      && evidence.some(({ sourcePath, sourceLine }) => sourcePath === expected.destinationSource && sourceLine === row.sourceLine)));
  }
  assert(/^(TeleportTo|PROC_CharacterMoveTo)\(/.test(move));
  assert.deepEqual(targets.slice(0, 2), [expected.characterContentId, expected.anchorContentId], "Wrong native movement endpoints");
  assert(destinations.some(({ character, anchor, evidence }) => character.id === expected.characterContentId
    && anchor.id === expected.anchorContentId && evidence.some(({ sourcePath, sourceLine }) => sourcePath === expected.destinationSource && sourceLine === expected.destinationLine)));
  if (expected.kind === "party-member") assert(party.some(({ characterId }) => characterId === expected.characterContentId), "Not a native companion");
  const inventory = sceneInventory(expected);
  const descriptions = inventory ? Object.fromEntries(Object.entries(expected.localizedDescriptions).map(([language, description]) => [language,
    [description, ...inventory.branches.filter(({ reviewOnly }) => !reviewOnly).map((branch) => `${branch.localizedConditions[language] ?? branch.localizedConditions.en} ${branch.items.map((item) => item.localizedNames[language] ?? item.title).join(", ")}.`)].join(" ")])) : expected.localizedDescriptions;
  const evidence = [...bindingEvidence, ...block(expected.destinationSource, expected.destinationLine).evidence,
    ...expected.reviews.flatMap((id) => { assert(reviews.has(id)); return reviews.get(id); })];
  assert.deepEqual(profile, { id: expected.id, characterContentId: expected.characterContentId, anchorContentId: expected.anchorContentId,
    kind: expected.kind, omitAuthoredCombat: expected.omitAuthoredCombat, localizedDescriptions: descriptions,
    lootAvailability: expected.lootAvailability,
    ...(inventory ? { inventoryChange: inventory } : {}),
    evidence: [...new Map(evidence.map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()] });
  profiles.set(key, profile);
}
const registry = bytes("src/features/map/map-registry.ts").toString("utf8");
const definitions = registry.slice(registry.indexOf("export const MAP_DEFINITIONS"), registry.indexOf("export const MAP_ATLASES"));
const mapIds = [...definitions.matchAll(/^\s{4}id:\s*"([^"]+)"/gm)].map((match) => match[1]);
assert.deepEqual([...manifest.maps].sort(), [...mapIds].sort());
const scenes = new Map(), ids = new Set();
let appearances = 0, unchangedAppearances = 0, changedAppearances = 0;
for (const mapId of mapIds) {
  const before = read(path.join(stage, "baseline/maps", mapId, "content.json"));
  assert.deepEqual(before, read(path.join(manifest.baseline, mapId, "content.json")), `Baseline was changed ${mapId}`);
  const after = read(path.join(stage, "public/maps", mapId, "content.json"));
  assert.deepEqual(omit(after, ["entities"]), omit(before, ["entities"]), `Map metadata or relationships changed ${mapId}`);
  const oldEntities = Object.values(before.entities), newEntities = Object.values(after.entities);
  assert.deepEqual(newEntities.map(({ id }) => id), oldEntities.map(({ id }) => id), `Lost or reordered content ${mapId}`);
  const oldLocations = read(path.join(stage, "baseline/maps", mapId, "locations.json"));
  assert.deepEqual(oldLocations, read(path.join(manifest.baseline, mapId, "locations.json")));
  const newLocations = read(path.join(stage, "public/maps", mapId, "locations.json"));
  assert.deepEqual(omit(newLocations, ["locations"]), omit(oldLocations, ["locations"]));
  assert.deepEqual(newLocations.locations.map(({ id }) => id), oldLocations.locations.map(({ id }) => id));
  assert(bytes(path.join(stage, "baseline/maps", mapId, "metadata.json")).equals(bytes(path.join(manifest.metadata, mapId, "metadata.json"))));
  assert(bytes(path.join(stage, "public/maps", mapId, "metadata.json")).equals(bytes(path.join(manifest.metadata, mapId, "metadata.json"))));
  const mapProfiles = new Map();
  for (let index = 0; index < oldEntities.length; index++) {
    const old = oldEntities[index], current = newEntities[index], destination = old.storyDestination;
    const profile = destination && profiles.get(`${destination.characterContentId}/${destination.anchorContentId}`);
    appearances++; ids.add(old.id);
    if (!profile) { assert.deepEqual(current, old); unchangedAppearances++; continue; }
    assert(![...scenes.values()].some(({ profile: seen }) => seen.id === profile.id), "Scene duplicated across floors");
    const expected = structuredClone(old);
    expected.kind = profile.kind ?? old.kind;
    if (old.tags && profile.kind) expected.tags = [...new Set(old.tags.map((tag) => tag === old.kind ? profile.kind : tag))];
    expected.sceneContext = { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence };
    if (profile.omitAuthoredCombat && old.gameplay) {
      delete expected.gameplay.combat;
      if (old.gameplay.combat || old.sceneContext?.authoredCombat) expected.sceneContext.authoredCombat = old.gameplay.combat ?? old.sceneContext.authoredCombat;
    }
    if (profile.inventoryChange) {
      expected.sceneContext.inventoryChange = profile.inventoryChange;
      if (old.sceneContext?.authoredLoot || old.deathLoot) expected.sceneContext.authoredLoot = old.sceneContext?.authoredLoot ?? old.deathLoot;
    }
    if (old.deathLoot) expected.deathLoot.availability = { id: profile.id, localizedConditions: profile.lootAvailability, evidence: profile.evidence };
    assert.deepEqual(current, expected, `Unexpected scene mutation ${mapId}/${old.id}`);
    if (isDeepStrictEqual(current, old)) unchangedAppearances++;
    else changedAppearances++;
    assert(old.deathLoot?.guaranteedDrops.length, "Reviewed authored inventory unexpectedly absent");
    mapProfiles.set(old.id, profile);
    scenes.set(`${mapId}/${old.id}`, { profile, entity: current });
  }
  for (let index = 0; index < oldLocations.locations.length; index++) {
    const old = oldLocations.locations[index], current = newLocations.locations[index], profile = mapProfiles.get(old.contentId);
    if (!profile?.kind) { assert.deepEqual(current, old); continue; }
    // This reviewed catalog currently changes companion scenes only. Fail when
    // another presentation type needs its own independent audit expectation.
    assert.equal(profile.kind, "party-member");
    const expected = { ...old, category: "party-member", subtype: "party-member", label: "Party member" };
    const facets = old.categoryFacets?.filter((facet) => facet !== "party-member");
    if (facets?.length) expected.categoryFacets = facets;
    else delete expected.categoryFacets;
    if (profile.inventoryChange) expected.searchTerms = [...(old.searchTerms ?? []),
      ...profile.inventoryChange.branches.filter(({ reviewOnly }) => !reviewOnly).flatMap(({ items }) => items.flatMap(({ localizedNames, statsId }) => [...Object.values(localizedNames), statsId]))];
    assert.deepEqual(current, expected, `Unexpected marker mutation ${mapId}/${old.id}`);
  }
}
assert.equal(scenes.size, profiles.size);
const beforeItems = read(process.argv[3]), afterItems = read(process.argv[4]);
assert.deepEqual(omit(afterItems, ["generatedAt", "items", "stats"]), omit(beforeItems, ["generatedAt", "items", "stats"]));
assert.deepEqual(omit(afterItems.stats, ["acquisitionRecords"]), omit(beforeItems.stats, ["acquisitionRecords"]));
assert.deepEqual(afterItems.items.map(({ id }) => id), beforeItems.items.map(({ id }) => id));
const changedItems = [], acquisitionsByScene = new Map();
let acquisitionRecords = 0, conditionalAcquisitions = 0, addedPossessions = 0, newlyConditionalAcquisitions = 0, renumberedAcquisitions = 0;
const canonical = (value) => Array.isArray(value) ? value.map(canonical) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const keyFor = (value) => JSON.stringify(canonical(omit(value, ["id"])));
for (let index = 0; index < beforeItems.items.length; index++) {
  const old = beforeItems.items[index], current = afterItems.items[index];
  assert.deepEqual(omit(current, ["acquisitions"]), omit(old, ["acquisitions"]), `Item facts changed ${old.id}`);
  if (!isDeepStrictEqual(current, old)) changedItems.push({ id: old.id, name: old.name });
  const unmatched = new Map(current.acquisitions.map((entry) => [keyFor(entry), entry]));
  assert.equal(unmatched.size, current.acquisitions.length, `Duplicate acquisition payload ${old.id}`);
  const take = (expected, originalId) => {
    const key = keyFor(expected), actual = unmatched.get(key);
    assert(actual, `Missing/wrong acquisition ${old.id}: ${key}`);
    if (originalId && actual.id !== originalId) renumberedAcquisitions++;
    unmatched.delete(key);
  };
  for (let row = 0; row < old.acquisitions.length; row++) {
    acquisitionRecords++;
    const prior = old.acquisitions[row];
    const key = `${prior.mapId}/${prior.locationId}`, scene = scenes.get(key);
    const separateScriptedPossession = scene && prior.kind === "carried"
      && prior.sourceId !== `party-member:${scene.entity.partyMember?.memberId}`;
    // A later scripted gift at the same marker is not authored starting loot.
    // Preserve its own source semantics instead of applying inventory reset
    // conditions indiscriminately to everything sharing a scene location.
    if (!scene || separateScriptedPossession || !["drop", "pickpocket", "carried", "random-loot"].includes(prior.kind)) { take(prior, prior.id); continue; }
    const condition = scene.profile.lootAvailability;
    const expected = { ...prior, certainty: "story", detail: condition.en, localizedDetails: condition,
      locationDetail: condition.en, localizedLocationDetails: condition };
    take(expected, prior.id);
    if (!isDeepStrictEqual(prior, expected)) newlyConditionalAcquisitions++;
    conditionalAcquisitions++;
    acquisitionsByScene.set(key, (acquisitionsByScene.get(key) ?? 0) + 1);
  }
  for (const [key, { entity, profile }] of scenes) for (const branch of profile.inventoryChange?.branches ?? []) {
    if (branch.reviewOnly) continue;
    for (const entry of branch.items.filter(({ itemId }) => itemId === old.id)) {
      const [mapId, locationId] = key.split("/"), metadata = read(path.join(stage, "public/maps", mapId, "metadata.json"));
      const location = read(path.join(stage, "public/maps", mapId, "locations.json")).locations.find(({ id }) => id === locationId);
      const condition = branch.localizedConditions;
      const expected = { kind: "carried", sourceId: entity.partyMember?.memberId ? `party-member:${entity.partyMember.memberId}` : entity.storyDestination.characterContentId,
        source: entity.localizedTitles?.en ?? entity.title,
        localizedSources: Object.fromEntries(Object.entries({ en: entity.localizedTitles?.en ?? entity.title, tr: entity.localizedTitles?.tr }).filter(([, value]) => value)),
        mapId, mapName: metadata.displayName ?? mapId, locationId, ...(location.region ? { region: location.region } : {}),
        certainty: "story", detail: condition.en, localizedDetails: condition, locationDetail: condition.en, localizedLocationDetails: condition,
        ...(entry.amount > 1 ? { amount: entry.amount } : {}) };
      take(expected); addedPossessions++; acquisitionRecords++;
    }
  }
  assert.equal(unmatched.size, 0, `Unexpected new acquisitions ${old.id}: ${JSON.stringify([...unmatched.values()])}`);
}
assert.equal(acquisitionsByScene.size, scenes.size, "A scene lost all linked inventory");
assert.equal(acquisitionRecords, afterItems.stats.acquisitionRecords);
for (const [file, expected] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), expected, `Audit input changed: ${file}`);
const report = { kind: "scene-content-source-and-conservation-audit", errors: [], stage,
  stats: { maps: mapIds.length, appearances, identities: ids.size, unchangedAppearances, changedAppearances, reviewedAppearances: scenes.size,
    reviewedNativeRules: reviews.size, items: afterItems.items.length, acquisitionRecords, conditionalAcquisitions,
    newlyConditionalAcquisitions, addedPossessions, renumberedAcquisitions },
  changedItems, scenes: [...scenes].map(([key, { profile }]) => ({ key, profileId: profile.id, acquisitions: acquisitionsByScene.get(key) })), hashes,
  scope: "Exact native rule/evidence and full map/item conservation audit. Does not certify unreviewed scenes, current runtime inventory, equipment integration or visual application behavior." };
writeGeneratedFile(path.resolve(root, process.argv[5]), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ...report.stats, changedItems }, null, 2));
