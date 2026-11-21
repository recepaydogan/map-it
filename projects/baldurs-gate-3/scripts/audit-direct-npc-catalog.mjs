import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Independent reconstruction from native rule text. Do not import the story
// lexer, scene recipe loader, binding helpers or catalog builders under audit.
const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 7) throw new Error("Usage: audit-direct-npc-catalog.mjs <old-relations> <old-scenes> <relations> <scenes> <report>");
const [oldRelationPath, oldScenePath, relationPath, scenePath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, sources = new Map();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const text = (file) => {
  const absolute = path.resolve(root, file), bytes = fs.readFileSync(absolute), key = path.relative(root, absolute).split(path.sep).join("/");
  assert(!hashes[key] || hashes[key] === digest(bytes)); hashes[key] = digest(bytes); return bytes.toString("utf8");
};
const read = (file) => JSON.parse(text(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const normalized = (line) => line.trim().replace(/;$/, "").replace(/"(?:\\[\s\S]|[^"\\])*"|\s+/g, (token) => token.startsWith('"') ? token : " ");
const linesFor = (file) => {
  if (!sources.has(file)) sources.set(file, text(file).replace(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (token) => token.startsWith('"') ? token : token.replace(/[^\r\n]/g, " ")).split(/\r?\n/));
  return sources.get(file);
};
const rule = (file, actionLine) => {
  const lines = linesFor(file); let first = actionLine - 1;
  const header = /^(IF|IFF|PROC|QRY)(?:\s|$)/;
  while (first >= 0 && !header.test(lines[first].trim())) first--;
  assert(first >= 0);
  let end = first + 1;
  while (end < lines.length && !header.test(lines[end].trim()) && !/^(?:EXITSECTION|INITSECTION)$/.test(lines[end].trim())) end++;
  const then = lines.findIndex((line, index) => index > first && index < end && line.trim() === "THEN");
  assert(then > first && actionLine - 1 > then && actionLine - 1 < end);
  const evidence = [];
  for (let index = first; index < end; index++) {
    const statement = normalized(lines[index]).replace(/^(?:IF|IFF|PROC|QRY)\s+/, "");
    if (!statement || /^(?:AND|THEN|IF|IFF|PROC|QRY)$/.test(statement)) continue;
    evidence.push({ sourcePath: file, sourceLine: index + 1, statement });
  }
  const guards = evidence.filter(({ sourceLine }) => sourceLine - 1 < then).map(({ statement }) => statement);
  assert(!guards.some((guard) => /DEBUG|Debug_/.test(guard)));
  // Evidence retains physical source lines, including a native multiline
  // action. Semantic checks reconstruct complete semicolon-delimited actions
  // without splitting semicolons inside quoted strings.
  const actions = []; let pending = "";
  for (const token of lines.slice(then + 1, end).join("\n").match(/"(?:\\[\s\S]|[^"\\])*"|[^";]+|;/g) ?? []) {
    if (token === ";") { assert(/\)$/.test(pending.trim())); actions.push(normalized(pending)); pending = ""; }
    else pending += token;
  }
  assert(!pending.trim());
  const statement = normalized(lines[actionLine - 1]);
  assert(/\)$/.test(statement), "A reviewed action must identify a complete native action");
  return { guards, evidence, actions, statement };
};
const loadRecipe = (file, ancestors = []) => {
  const absolute = path.resolve(root, file); assert(!ancestors.includes(absolute)); const value = read(absolute);
  if (!value.extends) return value;
  const parent = loadRecipe(value.extends, [...ancestors, absolute]);
  assert(!value.excludedActorNamePattern || value.excludedActorNamePattern === parent.excludedActorNamePattern);
  const result = { ...parent, ...value };
  for (const key of ["reviews", "scenes", "directScenes", "roleContracts", "profiles"]) result[key] = [...(parent[key] ?? []), ...(value[key] ?? [])];
  return result;
};
const oldRelations = read(oldRelationPath), oldScenes = read(oldScenePath), relations = read(relationPath), scenes = read(scenePath);
const recipe = loadRecipe(relations.npcSceneReviews.recipe);
assert.equal(scenes.inputs.recipe, relations.npcSceneReviews.recipe);
for (const [file, hash] of Object.entries({ ...relations.npcSceneReviews.hashes, ...scenes.hashes })) assert.equal(digest(Buffer.from(text(file))), hash, `Stale evidence: ${file}`);
const rules = new Map();
for (const review of recipe.reviews) {
  assert(!rules.has(review.id)); const actual = rule(review.sourcePath, review.actionLine);
  assert.deepEqual(actual.guards, review.requiredGuards.map(normalized), `Native guard mismatch: ${review.id}`);
  assert(review.requiredActions.length && review.requiredActions.every((statement) => actual.actions.includes(normalized(statement))), `Native action mismatch: ${review.id}`);
  rules.set(review.id, actual);
}
const args = (statement) => statement.slice(statement.indexOf("(") + 1, statement.lastIndexOf(")"))
  .split(/,(?=(?:[^"\\]*(?:\\.[^"\\]*)*"[^"\\]*(?:\\.[^"\\]*)*")*[^"\\]*(?:\\.[^"\\]*)*$)/)
  .map((value) => value.trim().replace(/^\([A-Z]+\)/, ""));
const idOf = (value) => value.match(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)?.[0].toLowerCase();
const predicate = (statement) => statement.slice(0, statement.indexOf("("));
const unique = (entries) => [...new Map(entries.map((entry) => [`${entry.sourcePath}:${entry.sourceLine}`, entry])).values()];
const additions = [];
for (const scene of recipe.directScenes) {
  const movement = rules.get(scene.movementReview), role = rules.get(scene.roleReview);
  assert.deepEqual(args(movement.statement).slice(0, 2).map(idOf), [scene.characterContentId, scene.anchorContentId]);
  assert(movement.guards.includes(scene.roleLink) && role.actions.includes(scene.roleLink)
    || movement.actions.includes(scene.roleLink) && role.guards.includes(scene.roleLink));
  let invocation = role.actions.find((statement) => predicate(statement) === scene.rolePredicate && idOf(args(statement)[0]) === scene.characterContentId);
  assert(invocation);
  const contract = recipe.roleContracts.find(({ id }) => id === scene.roleContract);
  assert(contract && contract.reviews.every((id) => scene.reviews.includes(id)));
  for (const [index, reviewId] of contract.reviews.entries()) {
    const runtime = rules.get(reviewId), parameters = args(runtime.guards[0]), values = args(invocation);
    assert.equal(predicate(runtime.guards[0]), predicate(invocation)); assert.equal(parameters.length, values.length);
    const bindings = new Map();
    for (const [offset, parameter] of parameters.entries()) {
      assert(/^_\w+$/.test(parameter)); assert(!bindings.has(parameter) || bindings.get(parameter) === values[offset]); bindings.set(parameter, values[offset]);
    }
    const bound = (statement) => args(statement).map((argument) => bindings.get(argument) ?? argument);
    const actor = (statement) => idOf(bound(statement)[0]) === scene.characterContentId;
    if (index < contract.reviews.length - 1) {
      assert.equal(runtime.guards.length, 1);
      const target = predicate(rules.get(contract.reviews[index + 1]).guards[0]);
      const forwarding = runtime.actions.find((statement) => predicate(statement) === target && actor(statement)); assert(forwarding);
      invocation = `${target}(${bound(forwarding).join(",")})`;
    } else {
      assert(runtime.guards.some((statement) => predicate(statement) === `NOT ${contract.avatarPredicate}` && actor(statement)));
      assert(runtime.actions.some((statement) => predicate(statement) === contract.npcPredicate && actor(statement)));
      assert(runtime.actions.some((statement) => predicate(statement) === `NOT ${contract.playerPredicate}` && actor(statement)));
    }
  }
  const evidence = unique(scene.reviews.flatMap((id) => rules.get(id).evidence));
  const relation = relations.scriptedDestinations.find(({ character, anchor }) => character.id === scene.characterContentId && anchor.id === scene.anchorContentId);
  assert(relation && !oldRelations.scriptedDestinations.some(({ id }) => id === relation.id));
  assert.deepEqual(relation.npcScene, { id: scene.id, evidence });
  assert(relation.evidence.some((entry) => entry.statement === movement.statement));
  if (scene.arrivalState) {
    assert.equal(scene.arrivalState, "corpse"); assert.equal(relation.arrivalState, "corpse");
    assert(movement.actions.some((statement) => predicate(statement) === "Die" && idOf(args(statement)[0]) === scene.characterContentId));
    for (const entry of movement.evidence) assert(relation.arrivalEvidence.some((proof) => JSON.stringify(proof) === JSON.stringify(entry)));
  }
  const profile = recipe.profiles.find(({ characterContentId, anchorContentId }) => characterContentId === scene.characterContentId && anchorContentId === scene.anchorContentId);
  assert(profile && profile.omitAuthoredCombat && ["enemy", "corpse"].includes(profile.kind));
  assert.deepEqual(profile.reviews, scene.reviews);
  assert.deepEqual(scenes.profiles.find(({ id }) => id === profile.id), {
    ...omit(profile, ["destinationSource", "destinationLine", "reviews"]), evidence: unique([...movement.evidence, ...evidence]),
  });
  additions.push({ sceneId: scene.id, relationId: relation.id, profileId: profile.id,
    characterId: scene.characterContentId, anchorId: scene.anchorContentId, contentId: `${scene.characterContentId}:destination:${scene.anchorContentId}`, kind: profile.kind });
}
assert.deepEqual(relations.scriptedDestinations.filter(({ id }) => !additions.some(({ relationId }) => relationId === id)), oldRelations.scriptedDestinations);
assert.deepEqual(scenes.profiles.filter(({ id }) => !additions.some(({ profileId }) => profileId === id)), oldScenes.profiles);
assert.deepEqual(omit(relations, ["stats", "npcSceneReviews", "scriptedDestinations", "scriptedDestinationsByCharacterId"]), omit(oldRelations, ["stats", "npcSceneReviews", "scriptedDestinations", "scriptedDestinationsByCharacterId"]));
assert.deepEqual(omit(relations.stats, ["scriptedDestinations"]), omit(oldRelations.stats, ["scriptedDestinations"]));
assert.equal(relations.stats.scriptedDestinations, oldRelations.stats.scriptedDestinations + additions.length);
assert.deepEqual(relations.scriptedDestinationsByCharacterId, { ...Object.groupBy(relations.scriptedDestinations, ({ character }) => character.id) });
text(import.meta.filename);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const report = { kind: "native-direct-npc-catalog-audit", errors: [], additions, hashes,
  relationPath, scenePath, stats: { reviewedRules: rules.size, addedSceneRelations: additions.length,
    preservedRelations: oldRelations.scriptedDestinations.length, preservedProfiles: oldScenes.profiles.length },
  scope: "Native guarded movement and NPC runtime conversion, complete inherited catalog conservation. Does not prove a scene's world position is playable, image-backed or published; spatial and current-inventory review remain separate requirements." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report.stats, null, 2));
