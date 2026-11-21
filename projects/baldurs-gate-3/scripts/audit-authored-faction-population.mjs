import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 5, "Usage: audit-authored-faction-population.mjs <old-raw-stage> <new-raw-stage> <output>");
const [before, after, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, digest = (data) => createHash("sha256").update(data).digest("hex");
const read = (file) => {
  const data = fs.readFileSync(file); hashes[path.relative(root, file).replaceAll("\\", "/")] = digest(data); return JSON.parse(data);
};
const omit = (object, fields) => Object.fromEntries(Object.entries(object).filter(([key]) => !fields.includes(key)));
const oldManifest = read(path.join(before, "stage-manifest.json")), manifest = read(path.join(after, "stage-manifest.json"));
assert.deepEqual(manifest, oldManifest); assert.equal(manifest.recordsIncluded, true);
const changes = [], populations = new Map();
let unchangedRecords = 0, candidates = 0;
for (const mapId of manifest.maps) {
  const file = `map-sources/catalog/${mapId}-placements.json`;
  const old = read(path.join(before, file)), current = read(path.join(after, file));
  assert.deepEqual(current.records, old.records); unchangedRecords += old.records.length;
  assert.deepEqual(omit(current, ["generatedAt", "candidates"]), omit(old, ["generatedAt", "candidates"]));
  const authored = current.records.filter((row) => row.placementKind === "characters" && row.faction
    && !row.storyDestination && !row.partyPosition && !row.navigationDestination);
  const members = new Map();
  for (const row of authored) {
    const ids = members.get(row.faction) ?? new Map(); assert(!ids.has(row.id));
    ids.set(row.id, Boolean(row.combatGroupId)); members.set(row.faction, ids);
  }
  const population = [...members].map(([id, rows]) => ({ id, members: rows.size, combatants: [...rows.values()].filter(Boolean).length }))
    .sort((a, b) => a.id.localeCompare(b.id, "en"));
  if (populations.size) assert.deepEqual(population, populations.values().next().value, "Authored population changes across floors of the same placement source");
  populations.set(mapId, population);
  const counts = new Map(population.map((row) => [row.id, row]));
  assert.deepEqual(current.candidates.map(({ id }) => id), old.candidates.map(({ id }) => id));
  for (let i = 0; i < current.candidates.length; i += 1) {
    const candidate = current.candidates[i], previous = old.candidates[i]; candidates += 1;
    assert.deepEqual(omit(candidate, ["candidateKind", "factionHostile"]), omit(previous, ["candidateKind", "factionHostile"]));
    const count = counts.get(candidate.faction);
    const majority = candidate.placementKind === "characters" && count && count.members >= 5 && count.combatants * 2 >= count.members;
    assert.equal(candidate.factionHostile === true, Boolean(majority));
    if (!isDeepStrictEqual(candidate, previous)) {
      assert(candidate.factionHostile !== previous.factionHostile, "Category changed without a faction-population change");
      changes.push({ mapId, id: candidate.id, title: candidate.displayName.en, before: previous.candidateKind,
        after: candidate.candidateKind, faction: candidate.faction, authoredPopulation: count });
    }
  }
  const changed = new Set(changes.filter((row) => row.mapId === mapId).map(({ id }) => id));
  for (const [suffix, field, allowed] of [["content.json", "entities", ["kind", "tags"]], ["locations.json", "locations", ["category", "subtype", "label"]]]) {
    const oldPayload = read(path.join(before, "public/maps", mapId, suffix));
    const payload = read(path.join(after, "public/maps", mapId, suffix));
    assert.deepEqual(omit(payload, [field]), omit(oldPayload, [field]));
    assert.deepEqual(payload[field].map(({ id }) => id), oldPayload[field].map(({ id }) => id));
    for (let i = 0; i < payload[field].length; i += 1) {
      const next = payload[field][i], previous = oldPayload[field][i];
      if (changed.has(next.id)) assert.deepEqual(omit(next, allowed), omit(previous, allowed));
      else assert.deepEqual(next, previous);
    }
  }
  const rejection = `map-sources/catalog/${mapId}-placement-rejections.json`;
  assert.deepEqual(read(path.join(after, rejection)), read(path.join(before, rejection)));
}
for (const file of [import.meta.filename, path.join(root, "scripts/build-placement-catalog.mjs")]) {
  hashes[path.relative(root, file).replaceAll("\\", "/")] = digest(fs.readFileSync(file));
}
const result = { kind: "authored-faction-population-conservation", errors: [], before, after, hashes, changes,
  stats: { maps: manifest.maps.length, unchangedRecords, candidates, changedCandidates: changes.length,
    changedCategories: changes.filter((row) => row.before !== row.after).length },
  scope: "Real regenerated floor outputs only; independently counted unique authored faction members, identical source records and exact unrelated content/marker/rejection conservation. Fixes map-dependent synthetic-member contamination, NOT the semantic validity of combat-majority hostility or merchant-name inference. Other registered maps require a whole-set impact audit before publication." };
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats: result.stats, changes, errors: [] }, null, 2));
