import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 8) throw new Error("Usage: audit-scene-acquisition-refresh.mjs <old-items> <rejected-items> <current-items> <maps-stage> <native-transfers> <report>");
const [oldPath, rejectedPath, currentPath, stage, transfersPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, revisions = [], additions = [], preventedMislinks = [];
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = path.relative(root, absolute).split(path.sep).join("/");
  const hash = createHash("sha256").update(value).digest("hex");
  assert(!hashes[key] || hashes[key] === hash, `Changed input: ${key}`);
  hashes[key] = hash;
  return value;
};
const read = (file) => JSON.parse(bytes(file).toString("utf8"));
const old = read(oldPath), rejected = read(rejectedPath), current = read(currentPath), manifest = read(path.join(stage, "stage-manifest.json"));
const transfers = read(transfersPath).transfers;
for (const [file, hash] of Object.entries(manifest.outputHashes)) {
  const absolute = path.join(stage, file);
  bytes(absolute); assert.equal(hashes[path.relative(root, absolute).split(path.sep).join("/")], hash);
}
bytes(import.meta.filename); bytes("scripts/build-item-database.mjs");
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const payload = (value) => omit(value, ["id"]);
const locationKeys = ["mapId", "mapName", "locationId", "region"];
const withoutLocation = (value) => omit(payload(value), locationKeys);
const normalized = (line) => line.replace(/\s+\/\/.*$/, "").trim().replace(/;$/, "").replace(/\s+/g, " ");
const native = new Map();
const checkTransfer = (transfer) => {
  for (const proof of transfer.evidence) {
    if (!native.has(proof.sourcePath)) native.set(proof.sourcePath, bytes(proof.sourcePath).toString("utf8").split(/\r?\n/));
    assert.equal(normalized(native.get(proof.sourcePath)[proof.sourceLine - 1]), normalized(proof.statement));
  }
};
const entities = new Map(), contexts = new Map();
for (const mapId of manifest.maps) {
  const content = read(path.join(stage, "public/maps", mapId, "content.json"));
  const locations = read(path.join(stage, "public/maps", mapId, "locations.json")).locations;
  const metadata = read(path.join(stage, "public/maps", mapId, "metadata.json"));
  for (const entity of content.entities) {
    entities.set(`${mapId}/${entity.id}`, entity);
    const marker = locations.find(({ contentId }) => contentId === entity.id);
    if (!marker) continue;
    const ownerId = entity.storyDestination?.characterContentId ?? entity.id.split(":")[0];
    contexts.set(ownerId, [...(contexts.get(ownerId) ?? []), { entity, marker, mapId, mapName: metadata.displayName }]);
  }
}
const transferMatches = (item, route) => transfers.filter((transfer) => transfer.owner.id === route.sourceId && item.templateIds.includes(transfer.item.templateId));
const sameScene = (transfer) => (contexts.get(transfer.owner.id) ?? []).filter(({ entity }) =>
  entity.storyDestination?.evidence.some((entry) => transfer.evidence.some((proof) => proof.sourcePath === entry.sourcePath)));
const verifyContextRevision = (item, before, after) => {
  assert.equal(before.kind, "carried"); assert.equal(before.certainty, "story");
  assert(isDeepStrictEqual(withoutLocation(before), withoutLocation(after)), "Changed ownership or content, not only a scene link");
  const matches = transferMatches(item, after);
  assert(matches.length, `No native transfer for revised context: ${item.id}`);
  for (const transfer of matches) checkTransfer(transfer);
  if (after.locationId) {
    assert(matches.some((transfer) => {
      const candidates = sameScene(transfer);
      return candidates.length === 1 && candidates[0].mapId === after.mapId && candidates[0].marker.id === after.locationId;
    }), "New scene link lacks an exact transfer/destination source connection");
  } else {
    assert(matches.every((transfer) => sameScene(transfer).length !== 1), "Unlinked a uniquely source-bound transfer");
    assert((contexts.get(after.sourceId) ?? []).length > 1, "Unexpected loss of sole authored context");
  }
};
const oldById = new Map(old.items.map((item) => [item.id, item])), currentById = new Map(current.items.map((item) => [item.id, item]));
assert.deepEqual([...currentById.keys()], [...oldById.keys()]);
assert.deepEqual(omit(current, ["items", "generatedAt", "stats"]), omit(old, ["items", "generatedAt", "stats"]));
assert.deepEqual(omit(current.stats, ["acquisitionRecords"]), omit(old.stats, ["acquisitionRecords"]));
assert(Number.isFinite(Date.parse(current.generatedAt)) && Number.isFinite(Date.parse(old.generatedAt)));
let oldAcquisitions = 0, newAcquisitions = 0, retainedAcquisitions = 0;
for (const item of current.items) {
  const previous = oldById.get(item.id);
  assert(isDeepStrictEqual(omit(item, ["acquisitions"]), omit(previous, ["acquisitions"])), `Changed item facts: ${item.id}`);
  oldAcquisitions += previous.acquisitions.length; newAcquisitions += item.acquisitions.length;
  const remaining = item.acquisitions.map(payload);
  for (const route of previous.acquisitions) {
    const index = remaining.findIndex((value) => isDeepStrictEqual(value, payload(route)));
    if (index >= 0) { remaining.splice(index, 1); retainedAcquisitions++; continue; }
    const replacements = remaining.map((value, index) => ({ value, index })).filter(({ value }) => isDeepStrictEqual(withoutLocation(route), withoutLocation(value)));
    assert.equal(replacements.length, 1, `Previous acquisition lost or ambiguously changed: ${item.id}`);
    const replacement = replacements[0]; verifyContextRevision(item, route, replacement.value);
    remaining.splice(replacement.index, 1);
    revisions.push({ itemId: item.id, name: item.name, before: payload(route), after: replacement.value });
  }
  for (const route of remaining) {
    const key = `${route.mapId}/${route.locationId}`, entity = entities.get(key);
    assert(manifest.matches.some(({ mapId, contentId }) => key === `${mapId}/${contentId}`), "Unreviewed extra acquisition location");
    assert(entity?.deathLoot?.availability && ["drop", "pickpocket"].includes(route.kind));
    assert.equal(route.certainty, "story"); assert.equal(route.sourceId, `party-member:${entity.partyMember.memberId}`);
    const condition = entity.deathLoot.availability.localizedConditions;
    assert.equal(route.detail, condition.en); assert.equal(route.locationDetail, condition.en);
    assert.deepEqual(route.localizedDetails, condition); assert.deepEqual(route.localizedLocationDetails, condition);
    const drop = entity.deathLoot.guaranteedDrops.find((entry) => entry.statsId === item.statsId);
    assert(drop && (route.kind !== "pickpocket" || drop.canBePickpocketed));
    additions.push({ itemId: item.id, name: item.name, route });
  }
}
assert.equal(old.stats.acquisitionRecords, oldAcquisitions);
assert.equal(current.stats.acquisitionRecords, newAcquisitions);
assert.equal(newAcquisitions, retainedAcquisitions + revisions.length + additions.length);
// Isolate the actual regression from the first item build. The fix must only
// remove a source-unrelated later-scene link, never the ownership record itself.
assert.deepEqual(rejected.items.map(({ id }) => id), current.items.map(({ id }) => id));
for (const item of rejected.items) {
  const next = currentById.get(item.id);
  assert(isDeepStrictEqual(omit(item, ["acquisitions"]), omit(next, ["acquisitions"])));
  const remaining = next.acquisitions.map(payload);
  for (const route of item.acquisitions) {
    let index = remaining.findIndex((value) => isDeepStrictEqual(value, payload(route)));
    if (index < 0) {
      index = remaining.findIndex((value) => !value.locationId && isDeepStrictEqual(value, withoutLocation(route)));
      assert(index >= 0 && route.locationId, "Unexpected correction outside the scene-link fallback");
      const ownerContexts = contexts.get(route.sourceId) ?? [], matches = transferMatches(item, route);
      assert.equal(ownerContexts.length, 1); assert(ownerContexts[0].entity.storyDestination);
      assert(matches.length && matches.every((transfer) => sameScene(transfer).length === 0));
      for (const transfer of matches) checkTransfer(transfer);
      preventedMislinks.push({ itemId: item.id, name: item.name, rejected: payload(route), retained: remaining[index], nativeTransfers: matches });
    }
    remaining.splice(index, 1);
  }
  assert.equal(remaining.length, 0);
}
for (const [file, hash] of Object.entries(hashes)) assert.equal(createHash("sha256").update(fs.readFileSync(path.resolve(root, file))).digest("hex"), hash);
const report = { kind: "scene-acquisition-refresh-source-audit", errors: [],
  scope: "All item facts and acquisition payloads conserved except native-source-proven context revisions and explicitly conditional loot at the new scene pins. Includes independent proof that the rejected later-scene fallback was unrelated to the transfer. Does not claim complete missing-scene coverage.",
  stats: { items: current.items.length, oldAcquisitions, newAcquisitions, unchangedAcquisitions: retainedAcquisitions,
    revisedContexts: revisions.length, addedConditionalRoutes: additions.length, preventedMislinks: preventedMislinks.length },
  revisions, additions, preventedMislinks, hashes };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.stats, null, 2));
