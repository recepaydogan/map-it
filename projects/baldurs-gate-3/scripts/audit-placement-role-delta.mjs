import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

// Compare actual generated files, including fields unrelated to the correction.
// This inventories changes; native role/scene evidence is a separate requirement.
const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 6,
  "Usage: audit-placement-role-delta.mjs <old-stage> <additional-floor-stage> <new-stage> <report>");
const [before, floors, after, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const audits = fs.realpathSync(path.join(root, "map-sources/audits"));
const destination = path.join(fs.realpathSync(path.dirname(output)), path.basename(output));
const relative = path.relative(audits, destination);
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Report must stay in the audit directory");
const hashes = {};
const read = (file) => {
  const data = fs.readFileSync(file);
  hashes[path.relative(root, file).replaceAll("\\", "/")] = createHash("sha256").update(data).digest("hex");
  return JSON.parse(data);
};
const fields = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => !equal(a[key], b[key]));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const keyed = (rows) => {
  assert(Array.isArray(rows));
  const index = new Map(rows.map((row) => [row.id, row]));
  assert.equal(index.size, rows.length, "Duplicate identity");
  return index;
};
const baseline = read(path.join(before, "stage-manifest.json"));
const extra = read(path.join(floors, "stage-manifest.json"));
const manifest = read(path.join(after, "stage-manifest.json"));
for (const input of [baseline, extra, manifest]) assert.equal(input.kind, "unfinalized-placement-stage");
const oldMaps = new Set(baseline.maps);
assert(extra.maps.every((id) => !oldMaps.has(id)), "Additional floors overlap the old map set");
assert.deepEqual([...manifest.maps].sort(), [...baseline.maps, ...extra.maps].sort());
for (const key of ["storyLocationsPath", "dialogCatalogPath", "sceneContentPath", "equipmentItemPath", "gameplayStatsPath"]) {
  assert.equal(manifest[key], baseline[key], `Changed source input: ${key}`);
  assert.equal(manifest[key], extra[key], `Different floor input: ${key}`);
}
const result = {
  kind: "complete-placement-role-delta-inventory", before, floors, after, hashes,
  stats: { maps: manifest.maps.length, oldMaps: baseline.maps.length, newFloors: extra.maps.length,
    previousAppearances: 0, currentAppearances: 0, candidates: 0, capabilityChanges: 0 },
  added: [], removed: [], candidateChanges: [], contentChanges: [], markerChanges: [],
  metadataChanges: [], rejectionChanges: [], unexpected: [],
  scope: "Complete raw-stage identity and field comparison. No role change is semantically approved by this inventory. Native actor, faction and scene evidence must be reviewed before canonical integration; raw parent/child duplicates are not published appearances.",
};
const compareRows = (mapId, type, previous, current, allowed, destination) => {
  const old = keyed(previous), next = keyed(current);
  for (const [id, row] of old) {
    const updated = next.get(id);
    if (!updated) { result.removed.push({ mapId, type, id, row }); continue; }
    const changes = fields(row, updated);
    if (!changes.length) continue;
    const entry = { mapId, id, title: updated.title ?? updated.displayName?.en ?? updated.name,
      fields: changes, before: Object.fromEntries(changes.map((key) => [key, row[key] ?? null])),
      after: Object.fromEntries(changes.map((key) => [key, updated[key] ?? null])) };
    destination.push(entry);
    if (changes.some((key) => !allowed.includes(key))) result.unexpected.push({ mapId, type, id, fields: changes });
  }
  for (const [id, row] of next) if (!old.has(id)) result.added.push({ mapId, type, id, row });
};
for (const mapId of manifest.maps) {
  const previousRoot = oldMaps.has(mapId) ? before : floors;
  const catalogFile = `map-sources/catalog/${mapId}-placements.json`;
  const oldCatalog = read(path.join(previousRoot, catalogFile)), catalog = read(path.join(after, catalogFile));
  const oldCandidates = keyed(oldCatalog.candidates), candidates = keyed(catalog.candidates);
  result.stats.candidates += candidates.size;
  for (const [id, row] of candidates) {
    if (!oldCandidates.has(id)) continue;
    if (!equal(row.characterCapabilities, oldCandidates.get(id).characterCapabilities)) result.stats.capabilityChanges += 1;
  }
  compareRows(mapId, "candidate", oldCatalog.candidates, catalog.candidates,
    ["characterCapabilities", "factionHostile", "candidateKind"], result.candidateChanges);
  const ignored = ["generatedAt", "records", "recordsOmitted", "candidates"];
  const changedMetadata = fields(omit(oldCatalog, ignored), omit(catalog, ignored));
  if (changedMetadata.length) result.metadataChanges.push({ mapId, type: "catalog", fields: changedMetadata,
    before: omit(oldCatalog, ignored), after: omit(catalog, ignored) });
  for (const [suffix, type, key, allowed, changes] of [
    ["content.json", "content", "entities", ["kind", "tags", "vendor"], result.contentChanges],
    ["locations.json", "marker", "locations", ["category", "subtype", "label"], result.markerChanges],
  ]) {
    const file = `public/maps/${mapId}/${suffix}`;
    const previous = read(path.join(previousRoot, file)), current = read(path.join(after, file));
    if (type === "content") {
      result.stats.previousAppearances += previous[key].length;
      result.stats.currentAppearances += current[key].length;
    }
    compareRows(mapId, type, previous[key], current[key], allowed, changes);
    if (!equal(omit(previous, [key]), omit(current, [key]))) result.metadataChanges.push({ mapId, type,
      before: omit(previous, [key]), after: omit(current, [key]) });
  }
  const rejection = `map-sources/catalog/${mapId}-placement-rejections.json`;
  const previous = read(path.join(previousRoot, rejection)), current = read(path.join(after, rejection));
  if (!equal(previous, current)) result.rejectionChanges.push({ mapId, before: previous, after: current });
}
hashes[path.relative(root, import.meta.filename).replaceAll("\\", "/")] = createHash("sha256")
  .update(fs.readFileSync(import.meta.filename)).digest("hex");
writeGeneratedFile(output, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ stats: result.stats, added: result.added.length, removed: result.removed.length,
  contentChanges: result.contentChanges.map(({ mapId, id, title, fields, before, after }) => ({ mapId, id, title, fields,
    before: before.kind, after: after.kind })), unexpected: result.unexpected,
  metadataChanges: result.metadataChanges.length, rejectionChanges: result.rejectionChanges.length }, null, 2));
if (result.unexpected.length) process.exitCode = 1;
