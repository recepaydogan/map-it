import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 10) throw new Error("Usage: audit-comment-aware-catalogs.mjs <before-relations> <after-relations> <before-scenes> <after-scenes> <before-transfers> <after-transfers> <baseline-maps> <report>");
const [beforePath, afterPath, beforeScenesPath, afterScenesPath, beforeTransfersPath, afterTransfersPath, baseline, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, changes = [], sources = new Map();
const text = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = path.relative(root, absolute).split(path.sep).join("/");
  const hash = createHash("sha256").update(value).digest("hex");
  assert(!hashes[key] || hashes[key] === hash); hashes[key] = hash;
  return value.toString("utf8");
};
const read = (file) => JSON.parse(text(file));
const before = read(beforePath), after = read(afterPath), beforeScenes = read(beforeScenesPath), afterScenes = read(afterScenesPath);
const beforeTransfers = read(beforeTransfersPath), afterTransfers = read(afterTransfersPath);
text(import.meta.filename);
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const normalized = (value) => value.trim().replace(/;$/, "").replace(/"(?:\\[\s\S]|[^"\\])*"|\s+/g, (token) => token.startsWith('"') ? token : " ");
const active = (proof) => {
  if (!sources.has(proof.sourcePath)) sources.set(proof.sourcePath, text(proof.sourcePath)
    .replace(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, (token) => token.startsWith('"') ? token : token.replace(/[^\r\n]/g, " "))
    .split(/\r?\n/));
  return normalized(sources.get(proof.sourcePath)[proof.sourceLine - 1] ?? "");
};
const movement = (proof) => /^(?:TeleportTo|PROC_CharacterMoveTo|CharacterMoveTo)\(/.test(proof.statement);
const relationPayload = (relation) => ({ ...omit(relation, ["evidence", "character", "anchor"]),
  character: omit(relation.character, ["cast"]), anchor: omit(relation.anchor, ["cast"]) });
const oldById = new Map(before.scriptedDestinations.map((value) => [value.id, value]));
const newById = new Map(after.scriptedDestinations.map((value) => [value.id, value]));
assert.equal(oldById.size, before.scriptedDestinations.length); assert.equal(newById.size, after.scriptedDestinations.length);
let retainedRelations = 0;
for (const relation of before.scriptedDestinations) {
  const next = newById.get(relation.id);
  if (isDeepStrictEqual(relation, next)) { retainedRelations++; continue; }
  const movements = relation.evidence.filter(movement);
  assert(movements.length && movements.some((proof) => !active(proof)), "Changed relation lacks an inactive native movement");
  if (next) {
    assert.deepEqual(relationPayload(next), relationPayload(relation));
    for (const proof of next.evidence) assert.equal(active(proof), proof.statement);
    assert(next.evidence.some(movement), "Remaining destination has no active movement");
    changes.push({ kind: "removed-inactive-support", before: relation, after: next });
  } else {
    assert(movements.every((proof) => !active(proof)), "Removed a still-active movement");
    changes.push({ kind: "discarded-inactive-movement", before: relation });
  }
}
for (const relation of after.scriptedDestinations.filter(({ id }) => !oldById.has(id))) {
  assert.equal(relation.evidence.length, 1);
  const proof = relation.evidence[0]; assert(movement(proof)); assert.equal(active(proof), proof.statement);
  const ids = [...proof.statement.matchAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g)].map(([id]) => id);
  assert.deepEqual(ids.slice(0, 2), [relation.character.id, relation.anchor.id]);
  const lines = sources.get(proof.sourcePath); let first = proof.sourceLine - 2;
  while (first >= 0 && !/^(IF|IFF|PROC|QRY)(?:\s|$)/.test(lines[first].trim())) first--;
  assert(first >= 0);
  const guard = lines.slice(first + 1, proof.sourceLine - 1).filter((line) => line.trim() && line.trim() !== "THEN");
  assert(guard.length === 1 && guard[0].startsWith("PROC_") && !/debug/i.test(guard[0]), "New movement needs a different rule review");
  changes.push({ kind: "recovered-active-movement", after: relation, nativeGuard: guard[0] });
}
assert.deepEqual(after.scriptedDestinationsByCharacterId, { ...Object.groupBy(after.scriptedDestinations, ({ character }) => character.id) });
assert.deepEqual(beforeTransfers, afterTransfers, "Comment fix changed scripted item transfers");
assert.deepEqual(beforeScenes.profiles, afterScenes.profiles, "Comment fix changed reviewed scene content");
const moneyBefore = new Map(before.dialogMoneyTransfers.map((value) => [value.id, value]));
let moneyCleanups = 0, moneyAdded = 0;
for (const transfer of after.dialogMoneyTransfers) {
  const previous = moneyBefore.get(transfer.id);
  if (previous) {
    assert.deepEqual(omit(transfer, ["evidence"]), omit(previous, ["evidence"]));
    if (!isDeepStrictEqual(transfer, previous)) moneyCleanups++;
    moneyBefore.delete(transfer.id);
  } else moneyAdded++;
  for (const proof of transfer.evidence) assert.equal(active(proof), proof.statement);
}
assert.equal(moneyBefore.size, 0);
assert.deepEqual(after.dialogMoneyTransfersByDialogId, { ...Object.groupBy(after.dialogMoneyTransfers, ({ dialog }) => dialog.id) });
const mutable = ["stats", "scriptedDestinations", "scriptedDestinationsByCharacterId", "dialogMoneyTransfers", "dialogMoneyTransfersByDialogId", "excludedScriptedDestinations"];
assert.deepEqual(omit(before, mutable), omit(after, mutable), "Changed unrelated relation data");
assert.deepEqual(omit(before.stats, ["scriptedDestinationCharacters", "excludedDebugDestinationStatements", "dialogMoneyTransfers"]),
  omit(after.stats, ["scriptedDestinationCharacters", "excludedDebugDestinationStatements", "dialogMoneyTransfers"]));
assert.equal(after.stats.scriptedDestinationCharacters, Object.keys(after.scriptedDestinationsByCharacterId).length);
assert.equal(after.stats.excludedDebugDestinationStatements, after.excludedScriptedDestinations.length);
assert.equal(after.stats.dialogMoneyTransfers, after.dialogMoneyTransfers.length);
for (const entry of after.excludedScriptedDestinations) assert.equal(entry.rule.debugOnly, true);
// Inspect every currently accepted appearance: an inactive movement is not
// authorization to delete the actor's authored marker or other valid scene.
const manifest = read(path.join(baseline, "stage-manifest.json")), affectedAppearances = [];
const actorIds = new Set(changes.map((entry) => (entry.after ?? entry.before).character.id));
let appearances = 0;
for (const mapId of manifest.maps) {
  const entities = read(path.join(baseline, "public/maps", mapId, "content.json")).entities;
  appearances += entities.length;
  for (const entity of entities) if (actorIds.has(entity.storyDestination?.characterContentId ?? entity.id.split(":")[0])) {
    if (entity.storyDestination) assert(after.scriptedDestinations.some((relation) => relation.character.id === entity.storyDestination.characterContentId && relation.anchor.id === entity.storyDestination.anchorContentId), "An existing pin loses its valid destination");
    affectedAppearances.push({ mapId, contentId: entity.id, title: entity.title, worldPosition: entity.worldPosition,
      destination: entity.storyDestination && { actorId: entity.storyDestination.characterContentId, anchorId: entity.storyDestination.anchorContentId } });
  }
}
for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), hash);
const report = { kind: "comment-aware-native-catalog-audit", errors: [],
  scope: "Complete relation/scene/transfer conservation plus original active/commented movement proof and all accepted map identities inspected. Does not certify the regenerated map payloads, other consumers of the fact reader or complete scene coverage.",
  stats: { retainedRelations, recoveredMovements: changes.filter(({ kind }) => kind === "recovered-active-movement").length,
    discardedInactiveMovements: changes.filter(({ kind }) => kind === "discarded-inactive-movement").length,
    cleanedMovementEvidence: changes.filter(({ kind }) => kind === "removed-inactive-support").length,
    retainedSceneProfiles: afterScenes.profiles.length, retainedScriptedTransfers: afterTransfers.transfers.length,
    moneyCleanups, moneyAdded, maps: manifest.maps.length, inspectedAppearances: appearances, affectedAppearances: affectedAppearances.length }, changes, affectedAppearances, hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
