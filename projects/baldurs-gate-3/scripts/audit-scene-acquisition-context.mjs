import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
if (process.argv.length !== 7) throw new Error("Usage: audit-scene-acquisition-context.mjs <old-items> <new-items> <map-stage> <native-transfers> <report>");
const [oldPath, newPath, stage, transfersPath, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, revisions = [], native = new Map();
const digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = path.relative(root, absolute).split(path.sep).join("/");
  assert(!hashes[key] || hashes[key] === digest(value)); hashes[key] = digest(value); return value;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (value, keys) => Object.fromEntries(Object.entries(value).filter(([key]) => !keys.includes(key)));
const old = read(oldPath), current = read(newPath), manifest = read(path.join(stage, "stage-manifest.json"));
const transfers = read(transfersPath).transfers;
for (const [file, hash] of Object.entries(manifest.outputHashes)) assert.equal(digest(bytes(path.join(stage, file))), hash, `Changed canonical file: ${file}`);
const locations = new Map();
for (const mapId of manifest.maps) {
  const entities = read(path.join(stage, "public/maps", mapId, "content.json")).entities;
  const markers = read(path.join(stage, "public/maps", mapId, "locations.json")).locations;
  const metadata = read(path.join(stage, "public/maps", mapId, "metadata.json"));
  for (const entity of entities) {
    const matches = markers.filter(({ contentId }) => contentId === entity.id); assert.equal(matches.length, 1);
    locations.set(`${mapId}/${matches[0].id}`, { entity, marker: matches[0], metadata });
  }
}
assert.deepEqual(current.items.map(({ id }) => id), old.items.map(({ id }) => id));
assert.deepEqual(omit(current, ["items", "generatedAt"]), omit(old, ["items", "generatedAt"]));
assert(Number.isFinite(Date.parse(current.generatedAt)) && Number.isFinite(Date.parse(old.generatedAt)));
const locationFields = ["mapId", "mapName", "locationId", "region"];
let retainedAcquisitions = 0;
for (const [index, item] of current.items.entries()) {
  const previous = old.items[index];
  assert.deepEqual(omit(item, ["acquisitions"]), omit(previous, ["acquisitions"]), `Changed item facts: ${item.id}`);
  assert.equal(item.acquisitions.length, previous.acquisitions.length);
  for (const [offset, next] of item.acquisitions.entries()) {
    const before = previous.acquisitions[offset];
    if (isDeepStrictEqual(next, before)) { retainedAcquisitions++; continue; }
    assert.deepEqual(omit(next, locationFields), omit(before, locationFields), "Changed ownership, quantity, certainty or identity");
    assert.equal(next.kind, "carried"); assert.equal(next.certainty, "story");
    assert(locationFields.every((field) => !Object.hasOwn(before, field)), "Only newly source-bound previously unlinked ownership is covered");
    const target = locations.get(`${next.mapId}/${next.locationId}`); assert(target);
    assert(manifest.matches.some(({ mapId, contentId }) => mapId === next.mapId && contentId === target.entity.id));
    assert.equal(target.entity.storyDestination.characterContentId, next.sourceId);
    assert.equal(next.mapName, target.metadata.displayName); assert.equal(next.region, target.marker.region);
    const matches = transfers.filter((entry) => entry.owner.id === next.sourceId && item.templateIds.includes(entry.item.templateId));
    assert.equal(matches.length, 1); const transfer = matches[0];
    assert.equal(transfer.item.templateId, item.id, "A generated item variant needs separate native identity proof");
    assert.equal(transfer.owner.type, "character"); assert.equal(transfer.amount, next.amount ?? 1);
    for (const proof of transfer.evidence) {
      if (!native.has(proof.sourcePath)) native.set(proof.sourcePath, bytes(proof.sourcePath).toString("utf8")
        .replace(/"(?:\\[\s\S]|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
          (token) => token.startsWith('"') ? token : token.replace(/[^\r\n]/g, " ")).split(/\r?\n/));
      const actual = native.get(proof.sourcePath)[proof.sourceLine - 1].trim().replace(/;$/, "");
      assert.equal(actual, proof.statement);
      // Same source file alone is not enough. The reviewed scene must carry
      // this exact native grant statement in its complete rule evidence.
      assert(target.entity.sceneContext.evidence.some((entry) => isDeepStrictEqual(entry, proof)));
    }
    assert.equal(transfer.kind, "template-grant");
    const grant = transfer.evidence.find(({ statement }) => statement.startsWith("TemplateAddTo(")); assert(grant);
    const ids = [...grant.statement.matchAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/g)].map(([id]) => id);
    assert.deepEqual(ids, [item.id, next.sourceId]);
    revisions.push({ itemId: item.id, before, after: next, evidence: transfer.evidence });
  }
}
assert.equal(retainedAcquisitions + revisions.length, current.stats.acquisitionRecords);
for (const file of [import.meta.filename, "scripts/build-item-database.mjs"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const report = { kind: "native-scene-acquisition-context-audit", errors: [], mapStageRoot: stage, oldItemsPath: oldPath, itemsPath: newPath,
  stats: { items: current.items.length, acquisitions: current.stats.acquisitionRecords, retainedAcquisitions, contextRevisions: revisions.length }, revisions, hashes,
  scope: "All item facts and acquisition identities/ownership/quantities preserved. New scene links require the exact native template grant in that scene's reviewed evidence. Does not certify all scripted possessions are rendered as clickable map inventory, native coverage or publication." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report.stats, null, 2));
