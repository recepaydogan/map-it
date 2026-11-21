import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Actual source and complete-record audit. Deliberately independent of the
// scene producer, scene applicator and native statement/binding parsers.
assert([5, 7].includes(process.argv.length), "Usage: audit-transient-arrival-scenes.mjs <before-full-stage> <after-regional-stage> <fresh-report> [--marker-name-audit report]");
const root = path.resolve(import.meta.dirname, "..");
const [beforeRoot, afterRoot, output] = process.argv.slice(2, 5).map((file) => path.resolve(root, file));
const boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const target = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(target && !target.startsWith("..") && !path.isAbsolute(target) && !fs.existsSync(output));
const hashes = {}, errors = [];
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  const key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(data), `Input changed: ${key}`);
  hashes[key] = digest(data); return data;
};
const read = (file) => JSON.parse(bytes(file));
const check = (value, message) => { if (!value) errors.push(message); };
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const keyed = (rows) => { const value = new Map(rows.map((row) => [row.id, row])); assert.equal(value.size, rows.length); return value; };
let markerNameProof;
if (process.argv.length === 7) {
  assert.equal(process.argv[5], "--marker-name-audit"); markerNameProof = read(process.argv[6]);
  assert.equal(markerNameProof.kind, "scene-marker-name-field-audit"); assert.deepEqual(markerNameProof.errors, []);
  assert(Object.keys(markerNameProof.hashes ?? {}).length);
  for (const [file, hash] of Object.entries(markerNameProof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale marker-name proof: ${file}`);
}
const normal = (value) => value.trim().replace(/;$/, "").replace(/\s+/g, " ");
const sourceCache = new Map();
const linesFor = (file) => {
  if (!sourceCache.has(file)) {
    const text = bytes(file).toString("utf8");
    // Preserve physical source lines while removing both comment forms.
    // Quoted comment delimiters remain data, not executable source markers.
    let clean = "", block = false, lineComment = false, quoted = false, escaped = false;
    for (let index = 0; index < text.length; index++) {
      const char = text[index], next = text[index + 1];
      if (block) {
        if (char === "*" && next === "/") { block = false; clean += "  "; index++; }
        else clean += char === "\n" || char === "\r" ? char : " ";
        continue;
      }
      if (lineComment) {
        if (char === "\n" || char === "\r") { lineComment = false; clean += char; } else clean += " ";
        continue;
      }
      if (quoted) {
        clean += char;
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === "/" && ["/", "*"].includes(next)) {
        block = next === "*"; lineComment = !block; clean += "  "; index++; continue;
      }
      if (char === '"') quoted = true;
      clean += char;
    }
    assert(!block && !quoted, `Unterminated native comment/string: ${file}`);
    sourceCache.set(file, clean.split(/\r?\n/));
  }
  return sourceCache.get(file);
};
const scan = (file, start, end) => {
  const lines = linesFor(file), evidence = [];
  for (let index = start; index < end; index++) {
    const sourceLine = index + 1;
    let statement = lines[index].trim();
    if (!statement || ["IF", "IFF", "PROC", "QRY", "AND", "THEN"].includes(statement)) continue;
    if (statement === "NOT") {
      do { index++; } while (index < end && !lines[index].trim());
      assert(index < end); statement += ` ${lines[index].trim()}`;
    }
    if (/^(?:NOT )?[A-Za-z_]\w*\(/.test(statement)) {
      let depth = 0, quoted = false, closed = false, consumed = 0;
      for (;;) {
        for (; consumed < statement.length; consumed++) {
          const char = statement[consumed];
          if (char === '"' && statement[consumed - 1] !== "\\") quoted = !quoted;
          if (quoted) continue;
          if (char === "(") depth++;
          if (char === ")") { depth--; if (depth === 0) { closed = true; consumed++; break; } }
          assert(depth >= 0);
        }
        if (closed) break;
        assert(index + 1 < end, `Incomplete native statement: ${file}:${sourceLine}`);
        statement += ` ${lines[++index].trim()}`;
      }
      assert(!quoted && ["", ";"].includes(statement.slice(consumed).trim()), `Trailing native code: ${file}:${sourceLine}`);
    }
    evidence.push({ sourcePath: file, sourceLine, statement: normal(statement) });
  }
  return evidence;
};
const rule = (file, line) => {
  const lines = linesFor(file); let start = line - 1;
  while (start >= 0 && !["IF", "IFF", "PROC", "QRY"].includes(lines[start].trim())) start--;
  assert(start >= 0);
  let end = start + 1;
  while (end < lines.length && !["IF", "IFF", "PROC", "QRY", "EXITSECTION"].includes(lines[end].trim())) end++;
  const then = lines.findIndex((value, index) => index > start && index < end && value.trim() === "THEN");
  assert(then > start && line - 1 > then && line - 1 < end);
  const evidence = scan(file, start + 1, end), statement = evidence.find((entry) => entry.sourceLine === line)?.statement;
  assert(statement, `Wrong native statement start: ${file}:${line}`);
  const guards = evidence.filter(({ sourceLine }) => sourceLine - 1 < then).map(({ statement }) => statement);
  assert(!guards.some((guard) => /DEBUG|Debug_/.test(guard)), `Debug review: ${file}:${line}`);
  return { guards, statement, actions: evidence.filter(({ sourceLine }) => sourceLine - 1 > then).map(({ statement }) => statement), evidence };
};
const argsOf = (statement) => {
  assert(statement.endsWith(")")); const value = statement.slice(statement.indexOf("(") + 1, -1), result = [];
  let depth = 0, quoted = false, start = 0;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '"' && value[i - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (value[i] === "(") depth++;
    if (value[i] === ")") depth--;
    if (value[i] === "," && !depth) { result.push(value.slice(start, i).trim()); start = i + 1; }
  }
  assert(!quoted && !depth); result.push(value.slice(start).trim()); return result;
};
const token = (value) => value.replace(/^\([A-Z]+\)/, "").trim();
const uuid = (value) => value.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0];
const before = read(path.join(beforeRoot, "stage-manifest.json")), after = read(path.join(afterRoot, "stage-manifest.json"));
for (const key of ["kind", "configPath", "storyLocationsPath", "dialogCatalogPath", "equipmentItemPath", "gameplayStatsPath",
  "previousAnchorContext", "previousStageRoot", "previousContentHashes", "recordsIncluded", "storyDestinationRouting"]) assert.deepEqual(before[key], after[key]);
assert.equal(after.kind, "unfinalized-placement-stage");
assert(after.maps.every((id) => before.maps.includes(id)));
const oldCatalog = read(before.sceneContentPath), catalog = read(after.sceneContentPath);
for (const [file, hash] of Object.entries(catalog.hashes)) assert.equal(digest(bytes(file)), hash, `Stale scene source: ${file}`);
const oldProfiles = keyed(oldCatalog.profiles), profiles = keyed(catalog.profiles);
for (const [id, profile] of oldProfiles) assert.deepEqual(profiles.get(id), profile);
const additions = catalog.profiles.filter(({ id }) => !oldProfiles.has(id)), recipes = [];
let current = catalog;
while (current.profiles.length > oldProfiles.size) {
  recipes.push(read(current.inputs.recipe));
  assert(current.inputs.baseCatalog); current = read(current.inputs.baseCatalog);
}
assert.deepEqual(current.profiles, oldCatalog.profiles);
const definitions = recipes.flatMap(({ profiles }) => profiles);
assert.equal(definitions.length, additions.length);
let reviewedRules = 0;
for (const recipe of recipes) {
  let bindingProof, provenRelations, currentRelations;
  if (recipe.bindingAudit) {
    bindingProof = read(recipe.bindingAudit);
    assert.equal(bindingProof.kind, "story-binding-delta-audit");
    assert.deepEqual(bindingProof.errors, []);
    assert.equal(bindingProof.canonical, after.previousStageRoot);
    assert(Object.keys(bindingProof.hashes ?? {}).length);
    for (const [file, hash] of Object.entries(bindingProof.hashes)) assert.equal(digest(bytes(file)), hash, `Stale native binding proof: ${file}`);
    provenRelations = keyed(read(bindingProof.afterPath).scriptedDestinations);
    currentRelations = keyed(read(after.storyLocationsPath).scriptedDestinations);
  }
  const reviewed = new Map();
  for (const review of recipe.reviews) {
    const block = rule(review.sourcePath, review.actionLine);
    assert.deepEqual(block.guards, review.requiredGuards.map(normal), `Native guards: ${review.id}`);
    assert(review.requiredActions.length && review.requiredActions.every((action) => block.actions.includes(normal(action))));
    assert(!reviewed.has(review.id)); reviewed.set(review.id, block); reviewedRules++;
  }
  for (const input of recipe.profiles) {
    const profile = profiles.get(input.id);
    let evidence;
    if (bindingProof) {
      assert(!input.destinationSource && !input.destinationBinding && !input.inventoryChange && !input.equipmentChange);
      const relation = currentRelations.get(input.relationId), binding = bindingProof.changes.find((row) => row.id === input.relationId);
      assert(relation && binding?.proofs.length && !binding.contradictions.length && !binding.unsupportedActions.length);
      assert.deepEqual(relation, provenRelations.get(input.relationId));
      assert.equal(relation.character.id, input.characterContentId); assert.equal(relation.anchor.id, input.anchorContentId);
      for (const proof of binding.proofs) {
        assert.equal(uuid(proof.arguments[0]), input.characterContentId);
        assert.equal(uuid(proof.arguments[1]), input.anchorContentId);
        assert(proof.comparisons.every(({ verdict }) => verdict !== "contradicted"));
      }
      evidence = [...relation.evidence, ...input.reviews.flatMap((id) => { assert(reviewed.has(id)); return reviewed.get(id).evidence; })];
    } else {
    const placement = rule(input.destinationSource, input.destinationLine);
    let movement = argsOf(placement.statement), bindingEvidence = [];
    assert(/^(TeleportTo|PROC_CharacterMoveTo)\(/.test(placement.statement));
    if (input.destinationBinding) {
      const row = input.destinationBinding, lines = linesFor(input.destinationSource);
      let end = row.sourceLine - 1;
      while (end < lines.length && !lines[end].trim().endsWith(";")) end++;
      const entries = scan(input.destinationSource, row.sourceLine - 1, end + 1);
      assert.equal(entries.length, 1); assert.equal(entries[0].statement, normal(row.statement));
      const predicate = row.statement.slice(0, row.statement.indexOf("("));
      const guard = placement.guards.find((guard) => guard.startsWith(`${predicate}(`)); assert(guard);
      const formal = argsOf(guard), actual = argsOf(entries[0].statement), bindings = new Map();
      assert.equal(formal.length, actual.length);
      formal.forEach((value, index) => {
        const key = token(value); if (key === "_") return;
        if (/^_[A-Za-z]/.test(key)) {
          assert(!bindings.has(key) || bindings.get(key) === actual[index]); bindings.set(key, actual[index]);
        } else assert.equal(uuid(key) ?? key, uuid(actual[index]) ?? token(actual[index]));
      });
      movement = movement.map((value) => bindings.get(token(value)) ?? value); bindingEvidence = entries;
    }
    assert.equal(uuid(movement[0]), input.characterContentId); assert.equal(uuid(movement[1]), input.anchorContentId);
    evidence = [...bindingEvidence, ...placement.evidence, ...input.reviews.flatMap((id) => { assert(reviewed.has(id)); return reviewed.get(id).evidence; })];
    }
    let localizedTitles;
    if (input.storyDisplayName) {
      const name = input.storyDisplayName;
      for (const id of name.reviews) assert(input.reviews.includes(id) && reviewed.get(id).actions.some((action) =>
        action.startsWith("SetStoryDisplayName(") && uuid(argsOf(action)[0]) === input.characterContentId && argsOf(action)[1] === `"${name.key}"`));
      const aliases = read(name.sourcePath).save.regions.TranslatedStringKeys.TranslatedStringKey.filter((row) => row.UUID.value === name.key);
      assert.equal(aliases.length, 1); localizedTitles = {};
      for (const [language, file] of Object.entries(name.localization)) {
        const matches = [...bytes(file).toString("utf8").matchAll(/<content contentuid="([^"]+)"[^>]*>([^<]+)<\/content>/g)].filter((row) => row[1] === aliases[0].Content.handle);
        assert.equal(matches.length, 1); assert(!matches[0][2].includes("&")); localizedTitles[language] = matches[0][2];
      }
    }
    const expected = { id: input.id, characterContentId: input.characterContentId, anchorContentId: input.anchorContentId,
      ...(input.kind ? { kind: input.kind } : {}), ...(input.omitAuthoredCombat !== undefined ? { omitAuthoredCombat: input.omitAuthoredCombat } : {}),
      ...(input.deathDropsUnavailable ? { deathDropsUnavailable: true } : {}),
      localizedDescriptions: input.localizedDescriptions, lootAvailability: input.lootAvailability,
      ...(localizedTitles ? { localizedTitles } : {}), evidence: [...new Map(evidence.map((row) => [`${row.sourcePath}:${row.sourceLine}`, row])).values()] };
    assert.deepEqual(profile, expected, `Source profile: ${input.id}`);
    if (input.deathDropsUnavailable) {
      assert.equal(input.deathDropsUnavailable, true);
      assert(input.immortalityReviews?.length && input.immortalityReviews.every((id) => input.reviews.includes(id)
        && reviewed.get(id).actions.some((action) => action.startsWith("SetImmortal(")
          && uuid(argsOf(action)[0]) === input.characterContentId && argsOf(action)[1] === "1")));
    }
  }
}
const matches = [], appliedProfiles = new Set(), generationTimestamps = [], priorMarkerNameCorrections = [];
let appearances = 0, identical = 0;
for (const mapId of before.maps) {
  const refreshed = after.maps.includes(mapId), oldDocuments = {}, newDocuments = {};
  for (const [key, file] of Object.entries({ content: `public/maps/${mapId}/content.json`, locations: `public/maps/${mapId}/locations.json`,
    placement: `map-sources/catalog/${mapId}-placements.json`, rejections: `map-sources/catalog/${mapId}-placement-rejections.json` })) {
    oldDocuments[key] = read(path.join(beforeRoot, file)); newDocuments[key] = refreshed ? read(path.join(afterRoot, file)) : oldDocuments[key];
  }
  for (const [key, rows] of [["content", "entities"], ["locations", "locations"], ["placement", "candidates"]]) {
    const ignored = [rows];
    if (key === "placement" && oldDocuments[key].generatedAt !== newDocuments[key].generatedAt) {
      const previous = oldDocuments[key].generatedAt, next = newDocuments[key].generatedAt;
      assert(refreshed && new Date(previous).toISOString() === previous && new Date(next).toISOString() === next && Date.parse(next) >= Date.parse(previous));
      ignored.push("generatedAt"); generationTimestamps.push({ mapId, before: previous, after: next });
    }
    check(equal(omit(oldDocuments[key], ignored), omit(newDocuments[key], ignored)), `Unrelated envelope changed: ${mapId}/${key}`);
    assert.deepEqual(oldDocuments[key][rows].map(({ id }) => id).sort(), newDocuments[key][rows].map(({ id }) => id).sort());
  }
  check(equal(oldDocuments.rejections, newDocuments.rejections), `Rejections changed: ${mapId}`);
  const indexes = Object.fromEntries(["content", "locations", "placement"].map((key, i) => [key, keyed(newDocuments[key][["entities", "locations", "candidates"][i]])]));
  const oldMarkers = keyed(oldDocuments.locations.locations), oldCandidates = keyed(oldDocuments.placement.candidates);
  for (const entity of oldDocuments.content.entities) {
    const marker = oldMarkers.get(entity.id), candidate = oldCandidates.get(entity.id), nextEntity = indexes.content.get(entity.id);
    assert(marker && candidate && nextEntity); appearances++;
    const profile = additions.find((row) => row.characterContentId === entity.storyDestination?.characterContentId && row.anchorContentId === entity.storyDestination?.anchorContentId);
    if (!profile) {
      const nameCorrection = markerNameProof?.matches.find((row) => row.mapId === mapId && row.id === entity.id);
      if (nameCorrection && !equal(marker, indexes.locations.get(entity.id))) {
        const oldProfile = oldProfiles.get(nameCorrection.profileId);
        assert(oldProfile?.localizedTitles && entity.sceneContext?.id === oldProfile.id);
        assert.equal(marker.name, nameCorrection.beforeName); assert.equal(entity.title, nameCorrection.afterName);
        const proofBefore = read(path.join(markerNameProof.beforeRoot, `public/maps/${mapId}/locations.json`));
        const proofAfter = read(path.join(markerNameProof.afterRoot, `public/maps/${mapId}/locations.json`));
        assert.deepEqual(marker, keyed(proofBefore.locations).get(entity.id));
        assert.deepEqual(indexes.locations.get(entity.id), keyed(proofAfter.locations).get(entity.id));
        check(equal(entity, nextEntity) && equal(candidate, indexes.placement.get(entity.id)), `Name-only scene content changed: ${mapId}/${entity.id}`);
        priorMarkerNameCorrections.push(nameCorrection); continue;
      }
      check(equal(entity, nextEntity) && equal(marker, indexes.locations.get(entity.id)) && equal(candidate, indexes.placement.get(entity.id)), `Unrelated triple changed: ${mapId}/${entity.id}`);
      identical++; continue;
    }
    assert(refreshed && !entity.sceneContext); appliedProfiles.add(profile.id);
    const expectedEntity = { ...entity, ...(profile.kind ? { kind: profile.kind, tags: [...new Set(entity.tags.map((tag) => tag === entity.kind ? profile.kind : tag))] } : {}),
      ...(profile.localizedTitles ? { title: profile.localizedTitles.en, localizedTitles: profile.localizedTitles } : {}),
      sceneContext: { id: profile.id, localizedDescriptions: profile.localizedDescriptions, evidence: profile.evidence,
        ...(profile.localizedTitles ? { authoredTitles: entity.localizedTitles ?? { en: entity.title } } : {}),
        ...(profile.omitAuthoredCombat && entity.gameplay?.combat ? { authoredCombat: entity.gameplay.combat } : {}) },
      ...(entity.deathLoot ? { deathLoot: { ...entity.deathLoot, availability: { id: profile.id, localizedConditions: profile.lootAvailability, evidence: profile.evidence,
        ...(profile.deathDropsUnavailable ? { deathDropsUnavailable: true } : {}) } } } : {}) };
    if (profile.omitAuthoredCombat && entity.gameplay) expectedEntity.gameplay = omit(entity.gameplay, ["combat"]);
    if (entity.vendor && profile.kind === "npc") {
      const stock = nextEntity.tradeInventory;
      assert(stock && stock.sourceKind === "native-trade-pool" && stock.availability === "unverified" && stock.scope === "authored-placement");
      assert.deepEqual(stock.tradeTables, entity.vendor.tradeTables);
      assert.deepEqual([...stock.namedStock].sort(), [...entity.vendor.namedStock].sort(), `Vendor stock evidence lost: ${entity.id}`);
      const treasure = read("map-sources/catalog/treasure-tables.json");
      const pools = stock.tradeTables.flatMap((id) => treasure.tables[id] ?? []);
      assert.deepEqual(stock.unresolvedTradeTables ?? [], stock.tradeTables.filter((id) => !treasure.tables[id]));
      assert((stock.unresolvedStockIds ?? []).every((id) => stock.stockIds.includes(id)), "Unresolved evidence must retain native stock identity");
      assert.deepEqual(stock.stockIds, [...new Set(pools.flatMap((pool) => pool.namedStockIds ?? []))]);
      assert.deepEqual(stock.stockCategories, [...new Set(pools.flatMap((pool) => pool.stockCategories ?? []))]);
      delete expectedEntity.vendor; expectedEntity.tradeInventory = stock;
    }
    check(equal(expectedEntity, nextEntity), `Unreviewed entity change: ${mapId}/${entity.id}`);
    const expectedMarker = { ...marker,
      ...(profile.kind ? { category: profile.kind, subtype: profile.kind, label: "Character" } : {}),
      ...(profile.localizedTitles ? { name: profile.localizedTitles.en,
        searchTerms: [...(marker.searchTerms ?? []), marker.name, ...Object.values(profile.localizedTitles)] } : {}) };
    if (profile.kind) assert.equal(profile.kind, "npc", "Add independently reviewed presentation mapping before extending this audit");
    check(equal(expectedMarker, indexes.locations.get(entity.id)), `Unreviewed marker change: ${mapId}/${entity.id}`);
    check(equal({ ...candidate, ...(profile.kind ? { candidateKind: profile.kind } : {}), sceneContent: profile,
      reviewedPresentation: { ...candidate.reviewedPresentation, ...(profile.kind ? { kind: profile.kind } : {}) } }, indexes.placement.get(entity.id)), `Unreviewed candidate change: ${mapId}/${entity.id}`);
    matches.push({ mapId, id: entity.id, profileId: profile.id, beforeKind: entity.kind, afterKind: nextEntity.kind,
      beforeTitle: entity.title, afterTitle: nextEntity.title, worldPosition: entity.worldPosition,
      ...(entity.vendor && nextEntity.tradeInventory ? { retainedVendorEvidence: nextEntity.tradeInventory } : {}) });
  }
}
assert.equal(appliedProfiles.size, additions.length);
for (const file of [import.meta.filename, "scripts/build-placement-catalog.mjs", "scripts/lib/scene-content-profile.mjs", "scripts/lib/native-trade-inventory.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash, `Changed audit input: ${file}`);
const stats = { maps: before.maps.length, refreshedMaps: after.maps.length, appearances, identicalCompleteAppearances: identical,
  correctedAppearances: matches.length, addedSceneProfiles: additions.length, preservedSceneProfiles: oldProfiles.size, reviewedRules,
  correctedPriorMarkerNames: priorMarkerNameCorrections.length,
  kindChanges: matches.filter((row) => row.beforeKind !== row.afterKind).length, nameChanges: matches.filter((row) => row.beforeTitle !== row.afterTitle).length };
writeGeneratedFile(output, `${JSON.stringify({ kind: "transient-arrival-source-record-audit", beforeRoot, afterRoot, stats, matches, generationTimestamps, priorMarkerNameCorrections,
  hashes, errors, scope: "Independent native rule/binding/name reconstruction, reviewed death-acquisition restriction and complete baseline raw record conservation; conditional presentation and inventory-evidence retention. Does not approve copied equipment, full canonical reconciliation, acquisition/index integration, live UI, map coverage or imagery." }, null, 2)}\n`);
console.log(JSON.stringify({ output, stats, errors }, null, 2));
if (errors.length) process.exitCode = 1;
