import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import ts from "typescript";
import { presentItemAcquisitions, uniqueAcquisitionLocations } from "../src/features/items/item-acquisition-presentation.ts";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

assert(process.argv.length >= 5,
  "Usage: node --experimental-strip-types scripts/audit-acquisition-presentation-conservation.mjs <before-source-snapshot> <fresh-report> <actual-item-catalog> [...catalogs]");
const root = path.resolve(import.meta.dirname, "..");
const [snapshotArg, outputArg, ...catalogPaths] = process.argv.slice(2);
const output = path.resolve(root, outputArg), boundary = fs.realpathSync(path.join(root, "map-sources/audits"));
const relative = path.relative(boundary, path.join(fs.realpathSync(path.dirname(output)), path.basename(output)));
assert(relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !fs.existsSync(output));
const hashes = {}, digest = (value) => createHash("sha256").update(value).digest("hex");
const bytes = (file) => {
  const absolute = path.resolve(root, file), value = fs.readFileSync(absolute), key = path.relative(root, absolute).replaceAll("\\", "/");
  assert(!hashes[key] || hashes[key] === digest(value)); hashes[key] = digest(value); return value;
};
const read = (file) => JSON.parse(bytes(file));
const snapshot = read(snapshotArg);
assert.equal(snapshot.kind, "actual-acquisition-consumer-before-snapshot");
const beforeSource = snapshot.files.find((file) => file.path === "src/features/items/item-acquisition-presentation.ts").source;
// Execute the captured previous implementation on the same actual records.
const transpiled = ts.transpileModule(beforeSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const before = await import(`data:text/javascript;base64,${Buffer.from(transpiled.outputText).toString("base64")}`);
const contextFields = ["source", "localizedSources", "certainty", "amount", "detail", "localizedDetails", "locationDetail", "localizedLocationDetails"];
const contextDiffers = (left, right) => contextFields.some((field) => !isDeepStrictEqual(left[field], right[field]));
const locationKey = (entry) => JSON.stringify([entry.mapId ?? null, entry.locationId ?? null]);
const invalidCombinedLocations = (group) => {
  if (group.methods.length < 2) return [];
  const locations = new Map();
  for (const row of group.acquisitions) {
    const key = locationKey(row), methods = locations.get(key) ?? new Set();
    methods.add(row.kind); locations.set(key, methods);
  }
  return [...locations].filter(([, methods]) => group.methods.some((method) => !methods.has(method))).map(([key]) => key);
};
const catalogs = [];
for (const catalogPath of catalogPaths) {
  const catalog = read(catalogPath);
  let acquisitions = 0, beforeCards = 0, afterCards = 0, beforeMixedContextCards = 0, beforeUnsupportedMethodLocations = 0;
  let combinedCards = 0, multiLocationCards = 0, singleLocationConditions = 0;
  const restoredRecords = [], changedItems = [];
  for (const item of catalog.items) {
    const original = JSON.stringify(item), rows = item.acquisitions, byId = new Map(rows.map((row) => [row.id, row]));
    assert.equal(byId.size, rows.length, `Duplicate acquisition identity: ${item.id}`);
    const previous = before.presentItemAcquisitions(rows), next = presentItemAcquisitions(rows);
    assert.equal(JSON.stringify(item), original, "Presentation mutated the actual catalog");
    acquisitions += rows.length; beforeCards += previous.length; afterCards += next.length;
    const oldIds = new Set(previous.flatMap((group) => group.acquisitions.map((row) => row.id)));
    const restored = rows.filter((row) => !oldIds.has(row.id));
    for (const row of restored) restoredRecords.push({ itemId: item.id, itemName: item.name, acquisition: row });
    for (const group of previous) {
      if (group.acquisitions.some((row) => contextDiffers(row, group.acquisitions[0]))) beforeMixedContextCards++;
      beforeUnsupportedMethodLocations += invalidCombinedLocations(group).length;
    }
    const seen = new Set(), groups = new Set(), orders = new Map(rows.map((row, index) => [row.id, index]));
    let lastOrder = -1;
    for (const group of next) {
      assert(!groups.has(group.id) && group.acquisitions.length); groups.add(group.id);
      const first = group.acquisitions[0], firstOrder = orders.get(first.id);
      assert(firstOrder >= lastOrder); lastOrder = firstOrder;
      assert.deepEqual(invalidCombinedLocations(group), []);
      if (group.methods.length > 1) {
        combinedCards++;
        assert.equal(group.kind, "carried"); assert.deepEqual(group.methods, ["drop", "pickpocket"]);
      } else assert.deepEqual(group.methods, [group.kind]);
      for (const row of group.acquisitions) {
        assert(byId.get(row.id) === row && !seen.has(row.id), `Lost, duplicated or changed acquisition: ${item.id}/${row.id}`);
        seen.add(row.id);
        assert.equal(row.sourceId, first.sourceId);
        if (!row.sourceId) assert.equal(row.id, first.id);
        assert(!contextDiffers(row, first), `Incompatible conditions combined: ${item.id}/${group.id}`);
        assert(group.methods.includes(row.kind) || group.methods.length > 1 && row.kind === "carried");
      }
      const locations = uniqueAcquisitionLocations(group.acquisitions);
      const expectedLocations = new Set(group.acquisitions.filter((row) => row.mapId && row.locationId).map(locationKey));
      assert.deepEqual(new Set(locations.map(locationKey)), expectedLocations);
      assert.equal(locations.length, expectedLocations.size);
      if (locations.length > 1) multiLocationCards++;
      // Single-location cards must not rely only on the hidden expanded list.
      if (locations.length === 1 && first.locationDetail && first.locationDetail !== first.detail) singleLocationConditions++;
    }
    assert.deepEqual([...seen].sort(), [...byId.keys()].sort());
    const payload = (groups) => groups.map(({ kind, methods, acquisitions: entries }) => ({ kind, methods, ids: entries.map((entry) => entry.id) }));
    if (!isDeepStrictEqual(payload(previous), payload(next))) changedItems.push(item.id);
  }
  catalogs.push({ path: path.resolve(root, catalogPath), items: catalog.items.length, acquisitions, beforeCards, afterCards,
    restoredRecordCount: restoredRecords.length, beforeMixedContextCards, beforeUnsupportedMethodLocations,
    combinedCards, multiLocationCards, singleLocationConditions, changedItemCount: changedItems.length, changedItems, restoredRecords });
}
const card = bytes("src/features/items/item-acquisition-source-card.tsx").toString("utf8");
assert(card.includes('values?.[language.split("-")[0]]'));
assert(card.includes('{detail && <span className="mt-1 block text-[11px] leading-relaxed text-subtle">{detail}</span>}'));
assert(card.includes("singleLocationDetail && singleLocationDetail !== detail") && card.includes("{singleLocationDetail}</span>"));
const section = bytes("src/features/items/item-acquisition-section.tsx").toString("utf8");
assert(section.includes('kind: "carried", combinedMethods: false') && section.includes('kind: "carried", combinedMethods: true'));
for (const file of [import.meta.filename, "src/features/items/item-acquisition-presentation.ts", "src/features/items/types.ts"]) bytes(file);
for (const [file, hash] of Object.entries(hashes)) assert.equal(digest(fs.readFileSync(path.resolve(root, file))), hash);
const report = { kind: "actual-acquisition-presentation-conservation", scope: "Real previous/current consumers on actual full catalogs; no fixtures, tests, render or browser/app checks.",
  snapshot: path.resolve(root, snapshotArg), beforePresentationHash: digest(beforeSource), catalogs, hashes, errors: [] };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ report: output, catalogs: catalogs.map(({ changedItems: _changed, restoredRecords: _restored, ...stats }) => stats), errors: [] }));
