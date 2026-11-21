import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Actual source, complete generated records and full item outputs; no producer
// rule, scene-application, equipment or acquisition helper is imported.
const root = path.resolve(import.meta.dirname, "..");
assert([7, 9].includes(process.argv.length), "Usage: audit-camp-visitor-content.mjs <before-stage> <after-stage> <before-items> <after-items> <fresh-report> [before-item-inputs after-item-inputs]");
const [beforeRoot, afterRoot, beforeItems, afterItems, output, beforeItemInputs, afterItemInputs] = process.argv.slice(2).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits")), out = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(out && !out.startsWith("..") && !path.isAbsolute(out) && !fs.existsSync(output));
const hashes = {}, errors = [], changed = [], acquisitionChanges = [];
const digest = (data) => createHash("sha256").update(data).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/"), hash = digest(data);
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash; return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (condition, message) => { if (!condition) errors.push(message); };
const omit = (row, fields) => Object.fromEntries(Object.entries(row).filter(([field]) => !fields.includes(field)));
const keyed = (rows) => { const result = new Map(rows.map((row) => [row.id, row])); assert.equal(result.size, rows.length); return result; };
const before = read(path.join(beforeRoot, "stage-manifest.json")), after = read(path.join(afterRoot, "stage-manifest.json"));
assert.deepEqual(before.maps, after.maps);
for (const key of ["storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath", "previousStageRoot", "configPath"]) assert.equal(before[key], after[key]);
const scenes = read(after.sceneContentPath), oldScenes = read(before.sceneContentPath), recipe = read(scenes.inputs.recipe);
for (const [file, hash] of Object.entries(scenes.hashes)) assert.equal(digest(bytes(file)), hash, `Stale scene source: ${file}`);
const normalize = (line) => line.replace(/\/\/.*$/, "").trim().replace(/;$/, "");
for (const entry of recipe.sourceStatements ?? []) assert.equal(normalize(bytes(entry.sourcePath).toString("utf8").split(/\r?\n/)[entry.sourceLine - 1]), entry.statement);
const nativeRules = new Map();
for (const review of recipe.reviews) {
  const lines = bytes(review.sourcePath).toString("utf8").split(/\r?\n/);
  let start = review.actionLine - 1, end = review.actionLine;
  while (start >= 0 && !/^(IF|IFF|PROC|QRY)$/.test(normalize(lines[start]))) start--;
  while (end < lines.length && !/^(IF|IFF|PROC|QRY|EXITSECTION)$/.test(normalize(lines[end]))) end++;
  assert(start >= 0 && end < lines.length);
  const body = lines.slice(start + 1, end), then = body.findIndex((line) => normalize(line) === "THEN");
  assert(then >= 0 && body.every((line) => !line.includes("/*") && !line.includes("*/")));
  assert.deepEqual(body.slice(0, then).map(normalize).filter((line) => line && line !== "AND"), review.requiredGuards);
  const actions = body.slice(then + 1).map(normalize).filter(Boolean);
  for (const action of review.requiredActions) assert(actions.includes(action));
  const evidence = body.flatMap((line, index) => normalize(line) && !["AND", "THEN"].includes(normalize(line))
    ? [{ sourcePath: review.sourcePath, sourceLine: start + index + 2, statement: normalize(line) }] : []);
  nativeRules.set(review.id, { actions, evidence });
}
const oldProfileIds = new Set(oldScenes.profiles.map(({ id }) => id)), allProfiles = keyed(scenes.profiles);
for (const profile of oldScenes.profiles) assert.deepEqual(allProfiles.get(profile.id), profile);
const profiles = scenes.profiles.filter(({ id }) => !oldProfileIds.has(id));
assert.equal(profiles.length, recipe.profiles.reduce((sum, profile) => sum + profile.expectedAnchors, 0));
const source = read(after.storyLocationsPath), items = keyed(read(afterItems).items), expectedByAnchor = new Map();
let residentAnchors;
if (recipe.sourceAudit) {
  const auditBytes = bytes(recipe.sourceAudit), audit = JSON.parse(auditBytes);
  assert.equal(digest(auditBytes), recipe.sourceAuditSha256);
  assert.equal(audit.kind, "camp-resident-native-source-audit"); assert.deepEqual(audit.errors, []);
  assert.equal(path.resolve(root, audit.afterPath), path.resolve(root, after.storyLocationsPath));
  for (const [file, hash] of Object.entries(audit.hashes)) assert.equal(digest(bytes(file)), hash);
  residentAnchors = new Set(audit.reviewedRows.map(({ characterId, anchorId }) => `${characterId}/${anchorId}`));
  assert.equal(residentAnchors.size, audit.reviewedRows.length);
}
const expectedPossessions = new Set(), availabilityByLocation = new Map(), namesByLocation = new Map();
for (const definition of recipe.profiles) {
  const rule = nativeRules.get(definition.review);
  const positions = new Map();
  for (const index of definition.positionRegistrations ?? []) {
    const entry = recipe.sourceStatements[index], match = entry.statement.match(/^(DB_\w+)\((?:\(TRIGGER\))?\w+_([a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}),\s*"([A-Z]+)"\)$/i);
    assert(match && !positions.has(match[2]));
    const lines = bytes(entry.sourcePath).toString("utf8").split(/\r?\n/);
    assert(entry.sourceLine < lines.indexOf("KBSECTION") + 1);
    const guard = rule.evidence.map(({ statement }) => statement).find((line) => line.startsWith(`${match[1]}(`));
    const variables = guard?.match(/\((_\w+),\s*(_\w+)\)$/);
    assert(variables && rule.evidence.some(({ statement }) => statement === `DB_ActiveCamp(${variables[2]})`));
    const action = rule.actions.find((line) => line.startsWith("TeleportTo(") && line.includes(definition.characterContentId)
      && line.endsWith(`, ${variables[1]})`));
    assert(action); positions.set(match[2], { camp: match[3], entry, action });
    const allRows = lines.slice(0, lines.indexOf("KBSECTION")).filter((line) => normalize(line).startsWith(`${match[1]}(`));
    assert.equal(allRows.length, definition.positionRegistrations.length, "Native position registration coverage is incomplete");
  }
  const relations = source.scriptedDestinations.filter((relation) => relation.character.id === definition.characterContentId
    && (definition.contextId ? relation.campResidentContext?.id === definition.contextId
      : positions.size ? positions.has(relation.anchor.id) : relation.campEntryContext && rule.evidence.some((entry) => equal(entry, relation.campEntryContext.movement.evidence))));
  assert.equal(relations.length, definition.expectedAnchors);
  for (const relation of relations) {
    const registered = positions.get(relation.anchor.id);
    if (registered) {
      assert(relation.evidence.some((entry) => equal(entry, registered.entry)));
      assert(relation.evidence.some((entry) => entry.statement === registered.action && rule.evidence.some((source) => equal(entry, source))));
    }
    const profile = allProfiles.get(`${definition.id}:${registered?.camp ?? relation.camp}`), context = definition.contextId ? relation.campResidentContext : relation.campEntryContext;
    if (definition.contextId) {
      assert(residentAnchors?.has(`${relation.character.id}/${relation.anchor.id}`), "Resident anchor lacks independent native proof");
      assert(rule.evidence.every((entry) => context.recruitment.evidence.some((source) => equal(source, entry))), "Recruitment review targets another scene");
    }
    const contextEvidence = registered ? [registered.entry] : definition.contextId ? [context.registration, context.campFlags,
      ...context.recruitment.evidence, ...context.runtime.flatMap(({ evidence }) => evidence)]
      : [...context.registrations.map(({ evidence }) => evidence), ...context.nightEvidence.flatMap(({ evidence }) => evidence.map((entry) => entry.evidence))];
    assert(profile && profile.kind === "npc" && profile.omitAuthoredCombat === false);
    assert.equal(profile.characterContentId, relation.character.id); assert.equal(profile.anchorContentId, relation.anchor.id);
    assert.deepEqual(profile.lootAvailability, definition.lootAvailability);
    assert.deepEqual(profile.evidence, [...relation.evidence, ...rule.evidence, ...contextEvidence,
      ...(definition.supportingReviews ?? []).flatMap((id) => nativeRules.get(id).evidence),
      ...(definition.sourceStatementIndexes ?? []).map((index) => recipe.sourceStatements[index])]);
    const change = profile.equipmentChange;
    if (definition.equipmentReview || definition.equipmentGrantReview) {
      const grantOnly = !!definition.equipmentGrantReview, equipmentRule = grantOnly ? nativeRules.get(definition.equipmentGrantReview) : rule;
      assert(change && change.mode === (grantOnly ? "give-equipment-set" : "replace-equipped-slots"));
      const removal = grantOnly ? { evidence: [] } : nativeRules.get(definition.equipmentReview), review = recipe.reviews.find(({ id }) => id === definition.equipmentReview);
      if (!grantOnly) assert(removal.actions.includes("RequestDelete(_Item)"));
      const lines = grantOnly ? [] : bytes(review.sourcePath).toString("utf8").split(/\r?\n/), kb = grantOnly ? 0 : lines.indexOf("KBSECTION");
      const slots = lines.slice(0, kb).flatMap((line, index) => {
        const slot = line.trim().match(/^DB_EquippedItemSlots\("([^"]+)"\);$/)?.[1];
        return slot ? [{ slot, evidence: { sourcePath: review.sourcePath, sourceLine: index + 1, statement: normalize(line) } }] : [];
      });
      assert.deepEqual(change.removedSlots, slots.map(({ slot }) => slot)); assert.equal(slots.length, grantOnly ? 0 : 15);
      assert.deepEqual(change.evidence, [...slots.map(({ evidence }) => evidence), ...removal.evidence, ...equipmentRule.evidence]);
      assert.deepEqual(change.localizedConditions, definition.lootAvailability);
      assert(equipmentRule.actions.some((line) => line.startsWith("CharacterGiveEquipmentSet(") && line.includes(definition.characterContentId) && line.endsWith(`"${change.definitionId}")`)));
      assert.equal(equipmentRule.actions.some((line) => line.startsWith("PROC_CharacterRemoveEquipmentPermanently(") && line.includes(definition.characterContentId)), !grantOnly);
      const equipment = read(scenes.inputs.equipmentItems), nativeDefinition = equipment.definitions[change.definitionId];
      const equipmentLines = bytes(nativeDefinition.sourcePath).toString("utf8").split(/\r?\n/);
      assert.equal(equipmentLines[nativeDefinition.sourceLine - 1], `new equipment "${change.definitionId}"`);
      const groups = nativeDefinition.groups.filter((group) => !(definition.reviewOnlyEquipmentEntries ?? []).includes(group.entries[0]?.statsId));
      const pendingGroups = nativeDefinition.groups.filter((group) => !groups.includes(group));
      assert.deepEqual(change.unresolvedEntries ?? [], pendingGroups.map((group) => {
        assert.equal(group.entries.length, 1); const entry = group.entries[0];
        assert.equal(equipment.references[entry.statsId]?.status, "review"); assert(equipment.definitions[entry.statsId]);
        assert.equal(equipmentLines[entry.sourceLine - 1], `add equipment entry "${entry.statsId}"`);
        return { statsId: entry.statsId, reason: "equipment-definition-reference-not-resolved-item",
          evidence: [{ sourcePath: nativeDefinition.sourcePath, sourceLine: entry.sourceLine, statement: `add equipment entry "${entry.statsId}"` }] };
      }));
      assert.deepEqual(pendingGroups.map((group) => group.entries[0].statsId).sort(), [...(definition.reviewOnlyEquipmentEntries ?? [])].sort());
      assert.equal(change.items.length, groups.length);
      for (let index = 0; index < change.items.length; index++) {
        const entry = change.items[index], group = groups[index]; assert.equal(group.entries.length, 1);
        const native = group.entries[0], identity = equipment.references[native.statsId], item = items.get(entry.itemId);
        assert.equal(entry.statsId, native.statsId); assert.equal(identity.status, "resolved");
        assert.deepEqual(identity.itemIds, [entry.itemId]); assert.equal(identity.rootTemplateId, entry.templateId);
        assert(item.templateIds.includes(entry.templateId) && item.statsId === entry.statsId && item.name === entry.title);
        assert.deepEqual(item.localizedNames, entry.localizedNames); assert.equal(entry.amount, 1);
        assert.equal(equipmentLines[native.sourceLine - 1], `add equipment entry "${entry.statsId}"`);
      }
      const appearance = profile.appearance, template = read(appearance.sourcePath).save.regions.Templates.GameObjects.find((object) => object.MapKey?.value === appearance.templateId);
      assert.equal(template.Stats.value, appearance.statsId); assert.equal(template.Icon.value, appearance.iconId);
      if (!grantOnly) assert.equal(template.Equipment.value, change.definitionId);
      assert(equipmentRule.actions.some((line) => line.startsWith("Transform(") && [definition.characterContentId, appearance.templateId, appearance.ruleId].every((id) => line.includes(id))));
      const rulebook = bytes(appearance.ruleSourcePath).toString("utf8"), uuidIndex = rulebook.indexOf(`value="${appearance.ruleId}"`);
      assert(uuidIndex >= 0 && rulebook.indexOf(`value="${appearance.ruleId}"`, uuidIndex + 1) < 0);
      const header = rulebook.slice(rulebook.lastIndexOf('<node id="Rule">', uuidIndex), uuidIndex);
      assert(header.includes('id="ChangeIcon" type="bool" value="true"'));
      if (definition.useAppearanceName) {
        assert(header.includes('id="RetainDisplayName" type="bool" value="false"'));
        const names = {};
        for (const [language, file] of Object.entries(definition.nameSources)) {
          const lines = bytes(file).toString("utf8").split(/\r?\n/).filter((line) => line.includes(`contentuid="${template.DisplayName.handle}"`));
          assert.equal(lines.length, 1); names[language] = lines[0].match(/>([^<]+)<\/content>/)[1];
        }
        assert.deepEqual(profile.localizedTitles, names);
      } else assert(!profile.localizedTitles);
    } else assert(!change && !profile.appearance);
    for (const [language, description] of Object.entries(definition.localizedDescriptions)) assert.equal(profile.localizedDescriptions[language], change
      ? `${description} ${change.items.map((item) => item.localizedNames[language] ?? item.title).join(", ")}.` : description);
    expectedByAnchor.set(`${profile.characterContentId}/${profile.anchorContentId}`, profile);
  }
}
let total = 0, unchanged = 0;
for (const mapId of after.maps) {
  const load = (directory, file) => read(path.join(directory, file));
  const oldContent = load(beforeRoot, `public/maps/${mapId}/content.json`), newContent = load(afterRoot, `public/maps/${mapId}/content.json`);
  const oldMarkers = load(beforeRoot, `public/maps/${mapId}/locations.json`), newMarkers = load(afterRoot, `public/maps/${mapId}/locations.json`);
  const oldCandidates = load(beforeRoot, `map-sources/catalog/${mapId}-placements.json`), newCandidates = load(afterRoot, `map-sources/catalog/${mapId}-placements.json`);
  for (const [oldDoc, newDoc, ignored] of [[oldContent, newContent, ["entities"]], [oldMarkers, newMarkers, ["locations"]],
    [oldCandidates, newCandidates, ["generatedAt", "candidates"]]]) assert.deepEqual(omit(oldDoc, ignored), omit(newDoc, ignored));
  assert.deepEqual(load(beforeRoot, `map-sources/catalog/${mapId}-placement-rejections.json`), load(afterRoot, `map-sources/catalog/${mapId}-placement-rejections.json`));
  const a = keyed(oldContent.entities), b = keyed(newContent.entities), am = keyed(oldMarkers.locations), bm = keyed(newMarkers.locations),
    ac = keyed(oldCandidates.candidates), bc = keyed(newCandidates.candidates);
  for (const index of [b, am, bm, ac, bc]) assert.deepEqual([...index.keys()].sort(), [...a.keys()].sort());
  for (const [id, entity] of b) {
    total++;
    const old = a.get(id), key = entity.storyDestination ? `${entity.storyDestination.characterContentId}/${entity.storyDestination.anchorContentId}` : "";
    const profile = expectedByAnchor.get(key);
    if (!profile) { check(equal(old, entity) && equal(am.get(id), bm.get(id)) && equal(ac.get(id), bc.get(id)), `Unrelated record changed: ${mapId}/${id}`); unchanged++; continue; }
    const sceneContext = { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence,
      ...(profile.localizedTitles ? { authoredTitles: old.localizedTitles ?? { en: old.title } } : {}),
      ...(profile.equipmentChange ? { equipmentChange: profile.equipmentChange } : {}),
      ...(profile.appearance ? { appearance: profile.appearance, authoredIconId: old.iconId } : {}) };
    const expected = { ...old, kind: "npc", tags: old.tags.map((tag) => tag === old.kind ? "npc" : tag), sceneContext,
      ...(profile.localizedTitles ? { title: profile.localizedTitles.en, localizedTitles: profile.localizedTitles } : {}),
      ...(profile.appearance ? { iconId: profile.appearance.iconId } : {}),
      ...(old.deathLoot ? { deathLoot: { ...old.deathLoot, availability: { id: profile.id, localizedConditions: profile.lootAvailability, evidence: profile.evidence } } } : {}) };
    check(equal(entity, expected), `Unexpected visitor entity change: ${mapId}/${id}`);
    const marker = { ...am.get(id), category: "npc", subtype: "npc", label: "Character",
      ...(profile.localizedTitles ? { name: profile.localizedTitles.en } : {}),
      ...(profile.equipmentChange || profile.localizedTitles ? { searchTerms: [...am.get(id).searchTerms,
        ...(profile.localizedTitles ? [am.get(id).name] : []),
        ...Object.values(profile.localizedTitles ?? {}), ...(profile.equipmentChange?.items ?? []).flatMap((item) => [...Object.values(item.localizedNames), item.statsId])] } : {}) };
    check(equal(bm.get(id), marker), `Unexpected marker change: ${mapId}/${id}`);
    check(equal(bc.get(id), { ...ac.get(id), candidateKind: "npc", reviewedPresentation: { kind: "npc" }, sceneContent: profile }), `Unexpected candidate change: ${mapId}/${id}`);
    if (old.deathLoot) availabilityByLocation.set(`${mapId}/${id}`, profile.lootAvailability);
    if (profile.localizedTitles) namesByLocation.set(`${mapId}/${id}`, profile.localizedTitles);
    for (const item of profile.equipmentChange?.items ?? []) expectedPossessions.add(`${item.itemId}/${mapId}/${id}`);
    changed.push({ mapId, id, previousKind: old.kind, kind: entity.kind, equipmentChanged: !!profile.equipmentChange });
  }
  for (const [directory, stage] of [[beforeItemInputs ?? "map-sources/audits/camp-visitor-item-inputs-before", beforeRoot], [afterItemInputs ?? "map-sources/audits/camp-visitor-item-inputs-after", afterRoot]]) {
    for (const name of ["content.json", "locations.json"]) assert.equal(digest(bytes(path.join(directory, mapId, name))), digest(bytes(path.join(stage, `public/maps/${mapId}/${name}`))));
    assert.equal(digest(bytes(path.join(directory, mapId, "metadata.json"))), digest(bytes(path.join(after.previousStageRoot, `public/maps/${mapId}/metadata.json`))));
  }
}
const previousItems = read(beforeItems), currentItems = read(afterItems), oldItems = keyed(previousItems.items);
assert.deepEqual([...oldItems.keys()].sort(), [...items.keys()].sort());
assert.deepEqual(omit(previousItems, ["generatedAt", "stats", "items"]), omit(currentItems, ["generatedAt", "stats", "items"]));
const semanticKey = (value) => JSON.stringify(value, (_key, entry) => entry && typeof entry === "object" && !Array.isArray(entry)
  ? Object.fromEntries(Object.entries(entry).sort(([a], [b]) => a.localeCompare(b, "en"))) : entry);
let oldAcquisitions = 0, newAcquisitions = 0, conditioned = 0;
const possessions = new Set();
for (const item of currentItems.items) {
  const old = oldItems.get(item.id); assert.deepEqual(omit(item, ["acquisitions"]), omit(old, ["acquisitions"]));
  oldAcquisitions += old.acquisitions.length; newAcquisitions += item.acquisitions.length;
  // Different dialogue branches can share source/kind/location. Compare full
  // payload multisets so preserving one branch cannot hide losing another.
  const current = new Map();
  for (const row of item.acquisitions) {
    const key = semanticKey(omit(row, ["id"])); current.set(key, [...(current.get(key) ?? []), row]);
  }
  for (const row of old.acquisitions) {
    const conditions = availabilityByLocation.get(`${row.mapId}/${row.locationId}`);
    let expected = conditions ? { ...omit(row, ["id"]), certainty: "story", detail: conditions.en, localizedDetails: conditions,
      locationDetail: conditions.en, localizedLocationDetails: conditions } : omit(row, ["id"]);
    const names = namesByLocation.get(`${row.mapId}/${row.locationId}`);
    if (names) expected = { ...expected, source: names.en, localizedSources: names };
    const key = semanticKey(expected), matches = current.get(key);
    check(!!matches?.length, `Unreviewed acquisition change: ${item.id}/${row.id}`);
    if (matches?.length) matches.pop();
    if (conditions) conditioned++;
  }
  for (const row of [...current.values()].flat()) {
    const key = `${item.id}/${row.mapId}/${row.locationId}`;
    check(expectedPossessions.has(key) && row.kind === "carried" && row.certainty === "story", `Unproven new possession: ${key}`);
    possessions.add(key); acquisitionChanges.push({ itemId: item.id, mapId: row.mapId, locationId: row.locationId, kind: row.kind });
  }
}
assert.deepEqual([...possessions].sort(), [...expectedPossessions].sort());
for (const file of [import.meta.filename, "scripts/build-camp-scene-content.mjs", "scripts/build-item-database.mjs",
  "scripts/lib/scene-content-profile.mjs", "src/features/map/types.ts"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const stats = { maps: after.maps.length, preservedAppearances: total, unchangedCompleteAppearances: unchanged, reviewedVisitorAppearances: changed.length,
  correctedRoles: changed.filter(({ previousKind, kind }) => previousKind !== kind).length, sceneEquipmentChanges: changed.filter(({ equipmentChanged }) => equipmentChanged).length,
  unchangedEarlierSceneProfiles: oldScenes.profiles.length, itemsPreserved: items.size, oldAcquisitions, newAcquisitions, conditionedExistingAcquisitions: conditioned,
  addedNativeEquipmentPossessions: possessions.size };
writeGeneratedFile(output, `${JSON.stringify({ kind: "camp-visitor-source-record-consumer-audit", beforeRoot, afterRoot, beforeItems, afterItems,
  stats, changed, acquisitionChanges, hashes, errors,
  scope: "Reviewed visitor source/equipment/icon/role/conditions, complete regional conservation and all item/acquisition consumer payloads. Acquisition ordinal IDs may be resequenced; original source identities and map pins are preserved. Other camp actors and complete canonical publication remain open." }, null, 2)}\n`);
console.log(JSON.stringify({ stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
