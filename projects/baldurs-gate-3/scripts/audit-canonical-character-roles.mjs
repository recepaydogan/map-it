import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { readStorySourceLines } from "./lib/story-source-lines.mjs";
import { splitArguments, parseEndpoint } from "./lib/story-goal-facts.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Native evidence for changes to existing canonical roles. This deliberately
// does not import the classifier or turn stock tables into merchant evidence.
assert.equal(process.argv.length, 6, "Usage: audit-canonical-character-roles.mjs <canonical> <raw-stage> <review-config> <report>");
const root = path.resolve(import.meta.dirname, "..");
const [canonical, raw, reviewPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, cache = new Map();
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = createHash("sha256").update(data).digest("hex"); return data;
};
const read = (file) => JSON.parse(bytes(file));
const review = read(reviewPath);
assert.equal(review.schemaVersion, 1);
for (const [file, expected] of Object.entries(review.sourceHashes)) {
  bytes(file); assert.equal(hashes[file], expected, `Source review needs renewal: ${file}`);
}
const objects = (file) => {
  if (!cache.has(file)) {
    const rows = read(file).save.regions.Templates.GameObjects;
    const index = new Map(rows.map((row) => [row.MapKey.value, row])); assert.equal(index.size, rows.length);
    cache.set(file, index);
  }
  return cache.get(file);
};
const tables = (actor) => (actor.TradeTreasures ?? []).flatMap((group) => (group.TreasureItem ?? []).map((entry) => entry.Object.value));
const byCharacter = new Map(), witnesses = [];
const storyLines = (entry) => {
  assert(review.sourceHashes[entry.sourcePath], "Story witness must have a reviewed source hash");
  const text = bytes(entry.sourcePath).toString("utf8"), source = readStorySourceLines(text), lookup = createStoryRuleLookup(text);
  return entry.lines.map((line) => {
    const statement = source.lines[line - 1]?.trim(); assert(statement && statement.includes("("), `Not a source statement: ${entry.sourcePath}:${line}`);
    const rule = lookup(line);
    const section = source.lines.slice(0, line).filter((line) => ["INITSECTION", "KBSECTION", "EXITSECTION", "ENDEXITSECTION"].includes(line.trim())).at(-1)?.trim();
    assert(rule ? !rule.debugOnly : section === "INITSECTION", `Unproven normal-source witness: ${entry.sourcePath}:${line}`);
    return { sourcePath: entry.sourcePath, sourceLine: line, statement,
      ...(rule ? { rule: { kind: rule.kind, sourceLine: rule.sourceLine, endLine: rule.endLine, guards: rule.guards } } : { section }) };
  });
};
for (const group of review.groups) {
  assert(group.reason && review.sourceHashes[group.sourcePath]);
  const evidence = group.story.flatMap(storyLines);
  for (const id of group.characterIds) {
    assert(!byCharacter.has(id));
    const actor = objects(group.sourcePath).get(id); assert(actor, `Missing native actor: ${id}`);
    for (const [field, expected] of Object.entries(group.nativeFields)) assert.equal(actor[field]?.value ?? null, expected, `Native role fact changed: ${id}/${field}`);
    if (group.tradeTables) assert.deepEqual(tables(actor), group.tradeTables);
    assert(evidence.some(({ statement }) => statement.includes(id)), `No exact story actor witness: ${id}`);
    byCharacter.set(id, { ...group, evidence });
  }
  witnesses.push({ id: group.id, evidence });
}
const merchants = read(review.merchantEvidence).reviews;
for (const merchant of merchants) {
  const id = merchant.characterId, actor = objects(merchant.sourcePath).get(id); assert(actor && !byCharacter.has(id));
  assert.equal(merchant.kind, "vendor"); assert.deepEqual(tables(actor), merchant.tradeTables);
  for (const [key, value] of Object.entries(merchant.capabilities ?? {})) {
    const field = { canFight: "CanFight", canJoinCombat: "CanJoinCombat" }[key]; assert(field); assert.equal(actor[field]?.value, value);
  }
  let evidence;
  if (merchant.tag) {
    const tags = (actor.Tags ?? []).flatMap((group) => (group.Tag ?? []).map((row) => row.Object.value));
    assert(tags.includes(merchant.tag.id));
    const tag = read(merchant.tag.sourcePath).save.regions.Tags;
    assert.equal(tag.UUID.value, merchant.tag.id); assert.equal(tag.Name.value, merchant.tag.name);
    assert(/(?:^|_)VENDOR$/.test(tag.Name.value)); evidence = [{ sourcePath: merchant.tag.sourcePath, tagId: tag.UUID.value, name: tag.Name.value }];
  } else {
    const setup = merchant.shopSetup;
    evidence = storyLines({ sourcePath: setup.sourcePath, lines: [setup.arrivalLine, setup.callLine, setup.procedureLine, setup.shopLine] });
    const [arrival, call, procedure, shop] = evidence.map(({ statement }) => statement);
    assert.equal(parseEndpoint(splitArguments(call)[0]).id, id);
    assert.equal(parseEndpoint(splitArguments(arrival)[0]).id, id);
    assert.equal(call.split("(")[0], procedure.split("(")[0]);
    const args = splitArguments(shop); assert.equal(shop.split("(")[0], "DB_ItemShopTrigger"); assert.equal(args.length, 2);
    assert.equal(args[1], splitArguments(procedure)[0].replace(/^\([A-Z]+\)/, ""));
    assert.equal(parseEndpoint(args[0]).cast, "trigger");
    for (const arrivalId of merchant.arrivalIds ?? []) assert.equal(arrivalId, `${id}:destination:${parseEndpoint(splitArguments(arrival)[1]).id}`);
  }
  byCharacter.set(id, { ...merchant, characterIds: [id], evidence });
  witnesses.push({ id, evidence });
}
const manifest = read(path.join(canonical, "stage-manifest.json")), rawManifest = read(path.join(raw, "stage-manifest.json"));
assert.deepEqual([...manifest.maps].sort(), [...rawManifest.maps].sort());
const config = read(rawManifest.configPath), members = read(config.partyMembers).members;
const populationCache = new Map();
const authoredPopulation = (map) => {
  if (populationCache.has(map.placementRoot)) return populationCache.get(map.placementRoot);
  const actors = new Map();
  for (const directory of [...config.supplementaryPlacementRoots, config.placementRoots[map.placementRoot]]) {
    const files = fs.readdirSync(path.resolve(root, directory), { recursive: true }).map(String)
      .filter((file) => /(?:^|[\\/])Characters[\\/].*\.lsj$/i.test(file))
      .sort((a, b) => a.localeCompare(b, "en"));
    for (const file of files) for (const [id, actor] of objects(path.resolve(root, directory, file))) {
      assert(id); const row = actors.get(id) ?? { faction: "", combatGroup: "" };
      if (Object.hasOwn(actor, "Faction")) row.faction = actor.Faction.value.toLowerCase();
      if (Object.hasOwn(actor, "CombatGroupID")) row.combatGroup = actor.CombatGroupID.value.toLowerCase();
      actors.set(id, row);
    }
  }
  const counts = new Map();
  for (const [id, actor] of actors) if (actor.faction) {
    const count = counts.get(actor.faction) ?? { members: 0, combatants: 0, actorIds: [] };
    count.members++; if (actor.combatGroup) count.combatants++; count.actorIds.push(id); counts.set(actor.faction, count);
  }
  populationCache.set(map.placementRoot, counts); return counts;
};
const nativeCapabilities = (candidate, map) => {
  const id = candidate.storyDestination?.characterContentId
    ?? (candidate.partyPosition ? members.find(({ id }) => id === candidate.partyPosition.memberId)?.characterId : null)
    ?? candidate.id.split(":")[0];
  const capabilities = {}, evidence = [];
  for (const { sourcePath } of candidate.provenance) {
    if (!sourcePath.endsWith(".lsj") || sourcePath.startsWith("root-templates/")) continue;
    const options = sourcePath.startsWith("supplementary/")
      ? config.supplementaryPlacementRoots.map((directory) => path.resolve(root, directory, sourcePath.slice(14)))
      : [path.resolve(root, config.placementRoots[map.placementRoot], sourcePath)];
    const existing = options.filter((file) => fs.existsSync(file)); assert(existing.length <= 1);
    if (!existing.length) continue;
    const actor = objects(existing[0]).get(id); if (!actor) continue;
    for (const [native, field] of [["CanFight", "canFight"], ["CanJoinCombat", "canJoinCombat"]]) if (Object.hasOwn(actor, native)) {
      assert.equal(actor[native].type, "bool"); assert.equal(typeof actor[native].value, "boolean");
      capabilities[field] = actor[native].value;
      evidence.push({ sourcePath: path.relative(root, existing[0]).replaceAll("\\", "/"), objectId: id, field: native, value: actor[native].value });
    }
  }
  assert(evidence.length, `No native capability evidence: ${candidate.id}`);
  assert.deepEqual(candidate.characterCapabilities, capabilities, `Capability projection disagrees with native sources: ${candidate.id}`);
  return evidence;
};
const changes = [], capabilityChanges = [], factionChanges = [], observed = new Set();
for (const mapId of manifest.maps) {
  const entities = read(path.join(canonical, `public/maps/${mapId}/content.json`)).entities;
  const generated = new Map(read(path.join(raw, `public/maps/${mapId}/content.json`)).entities.map((row) => [row.id, row]));
  const candidates = new Map(read(path.join(raw, `map-sources/catalog/${mapId}-placements.json`)).candidates.map((row) => [row.id, row]));
  const oldCandidates = read(path.join(canonical, `map-sources/catalog/${mapId}-placements.json`)).candidates;
  for (const candidate of oldCandidates) {
    const next = candidates.get(candidate.id); assert(next);
    const definition = config.maps.find(({ id }) => id === mapId);
    if (!isDeepStrictEqual(next.factionHostile, candidate.factionHostile)) {
      const population = authoredPopulation(definition).get(next.faction); assert(population);
      const majority = population.members >= 5 && population.combatants * 2 >= population.members;
      assert.equal(next.factionHostile === true, majority);
      factionChanges.push({ mapId, id: next.id, faction: next.faction, before: candidate.factionHostile ?? null,
        after: next.factionHostile ?? null, authoredPopulation: population });
    }
    if (isDeepStrictEqual(next.characterCapabilities, candidate.characterCapabilities)) continue;
    assert.equal(next.placementKind, "characters");
    const evidence = nativeCapabilities(next, config.maps.find(({ id }) => id === mapId));
    capabilityChanges.push({ mapId, id: next.id, capabilities: next.characterCapabilities, evidence });
  }
  for (const entity of entities) {
    const next = generated.get(entity.id); assert(next, `Existing canonical actor missing: ${mapId}/${entity.id}`);
    if (next.kind === entity.kind) continue;
    const candidate = candidates.get(entity.id); assert(candidate);
    const actorId = candidate.storyDestination?.characterContentId ?? candidate.id.split(":")[0];
    const proof = byCharacter.get(actorId); assert(proof, `Unreviewed role change: ${mapId}/${entity.id}`);
    assert.equal(next.kind, proof.kind); assert.equal(candidate.candidateKind, proof.kind);
    assert.deepEqual(next.worldPosition, entity.worldPosition);
    assert.equal(next.templateId, entity.templateId); assert.equal(next.statsId, entity.statsId);
    for (const [field, expected] of Object.entries(proof.nativeFields ?? {})) {
      if (field === "CombatGroupID") assert.equal(candidate.combatGroupId || null, expected);
      else assert.equal(candidate.characterCapabilities?.[{ CanFight: "canFight", CanJoinCombat: "canJoinCombat" }[field]], expected);
    }
    if (proof.questId) assert(next.quest?.quests.some(({ id }) => id === proof.questId));
    if (proof.kind === "vendor") assert.deepEqual(next.vendor.tradeTables, proof.tradeTables);
    if (entity.vendor && proof.kind !== "vendor") assert(!next.vendor, "False vendor profile remains");
    const fields = [...new Set([...Object.keys(entity), ...Object.keys(next)])].filter((key) => !isDeepStrictEqual(entity[key], next[key]));
    changes.push({ mapId, id: entity.id, title: entity.title, before: entity.kind, after: next.kind, fields,
      actorId, nativeSource: proof.sourcePath, reviewId: proof.id ?? actorId, reason: proof.reason, evidence: proof.evidence });
    observed.add(actorId);
  }
}
assert.equal(changes.length, review.expectedChangedAppearances);
assert.deepEqual([...observed].sort(), [...byCharacter.keys()].sort(), "Unused or missing reviewed character");
bytes(import.meta.filename);
const report = { kind: "canonical-character-role-source-review", canonical, raw, reviewPath, hashes, changes, capabilityChanges, factionChanges, witnesses, errors: [],
  stats: { maps: manifest.maps.length, changedAppearances: changes.length, nativeCharacters: observed.size, capabilityChanges: capabilityChanges.length, factionChanges: factionChanges.length },
  scope: "Existing canonical role changes matched to reviewed, hash-bound native actors and normal story witnesses; changed combat fields and authored-only faction populations independently read from native objects. The faction majority remains a heuristic, not a proof of runtime hostility. No runtime availability, unconditional disposition, complete source coverage, unrelated-field conservation or publication claim." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, changes: changes.map(({ mapId, id, title, before, after }) => ({ mapId, id, title, before, after })), errors: [] }, null, 2));
