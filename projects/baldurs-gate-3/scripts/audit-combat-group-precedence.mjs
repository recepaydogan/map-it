import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { isDeepStrictEqual as equal } from "node:util";
import { createStoryRuleLookup } from "./lib/story-rule-context.mjs";
import { parseEndpoint, splitArguments } from "./lib/story-goal-facts.mjs";
import { writeGeneratedFile } from "./lib/write-generated-file.mjs";

const root = path.resolve(import.meta.dirname, "..");
assert.equal(process.argv.length, 7, "Usage: audit-combat-group-precedence.mjs <full-before> <rebuilt> <native-evidence> <old-producer> <report>");
const [before, after, evidencePath, oldProducer, output] = process.argv.slice(2).map((file) => path.resolve(root, file));
const hashes = {}, cache = new Map();
const bytes = (file) => {
  const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
  hashes[path.relative(root, absolute).replaceAll("\\", "/")] = createHash("sha256").update(data).digest("hex");
  return data;
};
const read = (file) => JSON.parse(bytes(file));
const omit = (object, keys) => Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)));
const prior = read(path.join(before, "stage-manifest.json")), manifest = read(path.join(after, "stage-manifest.json"));
assert.deepEqual(omit(prior, ["maps"]), omit(manifest, ["maps"]));
const replacement = /\/\*\* Creature family[\s\S]*?(?=\/\*\* Bodies placed)/;
const oldSource = bytes(oldProducer).toString(), newSource = bytes("scripts/build-placement-catalog.mjs").toString();
assert(replacement.test(oldSource) && replacement.test(newSource));
assert.equal(oldSource.replace(replacement, ""), newSource.replace(replacement, ""), "Unrelated producer edit");
const evidence = read(evidencePath), nativeReviews = new Map();
for (const review of evidence.classes) {
  const source = bytes(review.sourcePath).toString(), lines = source.split(/\r?\n/), ruleAt = createStoryRuleLookup(source);
  const nativePath = path.resolve(root, review.nativeSource);
  if (!cache.has(nativePath)) cache.set(nativePath, new Map(read(nativePath).save.regions.Templates.GameObjects.map((row) => [row.MapKey.value, row])));
  const members = review.membershipLines.map((number) => {
    const text = lines[number - 1].trim();
    assert(text.startsWith(`${review.membershipPredicate}(`));
    assert(number > lines.indexOf("INITSECTION") && number < lines.indexOf("KBSECTION") + 1);
    const id = parseEndpoint(splitArguments(text)[0])?.id;
    assert(id); return id;
  });
  for (const action of review.actions) {
    const text = lines[action.line - 1].trim(), rule = ruleAt(action.line);
    assert(rule && !rule.debugOnly && action.line >= rule.actionLine);
    assert(text.startsWith(`${action.predicate}(`));
    const args = splitArguments(text);
    assert.equal(args[1], action.value);
    if (review.guardLine) {
      const guard = lines[review.guardLine - 1].trim();
      assert(review.guardLine >= rule.sourceLine && review.guardLine < rule.actionLine);
      assert(guard.startsWith(`${review.membershipPredicate}(`));
      assert.equal(splitArguments(guard)[0].replace(/^\([A-Z]+\)/, ""), args[0]);
    } else assert(members.includes(parseEndpoint(args[0])?.id));
  }
  for (const id of members) {
    const key = `${review.mapId}/${id}`;
    assert(!nativeReviews.has(key));
    nativeReviews.set(key, { review, native: cache.get(nativePath).get(id) });
  }
}
const targets = new Set(), rawCandidates = new Map();
let inspectedCandidates = 0;
for (const mapId of prior.maps) {
  const catalog = read(path.join(before, `map-sources/catalog/${mapId}-placements.json`));
  rawCandidates.set(mapId, catalog);
  for (const row of catalog.candidates) {
    inspectedCandidates += 1;
    if (!row.combatGroupId || row.partyMember
      || row.characterCapabilities?.canFight !== false && row.characterCapabilities?.canJoinCombat !== false) continue;
    assert(manifest.maps.includes(mapId), `Potentially affected map not rebuilt: ${mapId}`);
    if (row.candidateKind !== "npc") continue;
    const key = `${mapId}/${row.id}`, source = nativeReviews.get(key);
    assert(source?.native, `Missing native encounter review: ${key}`);
    assert.equal(source.native.CombatGroupID.value, row.combatGroupId);
    assert.equal(source.native.CanFight?.value, row.characterCapabilities?.canFight);
    assert.equal(source.native.CanJoinCombat?.value, row.characterCapabilities?.canJoinCombat);
    targets.add(key);
  }
}
let preservedAppearances = 0;
const changes = [];
for (const mapId of manifest.maps) {
  const old = rawCandidates.get(mapId), current = read(path.join(after, `map-sources/catalog/${mapId}-placements.json`));
  assert.deepEqual(omit(current, ["generatedAt", "candidates"]), omit(old, ["generatedAt", "candidates"]));
  assert.deepEqual(current.candidates.map(({ id }) => id), old.candidates.map(({ id }) => id));
  for (let i = 0; i < current.candidates.length; i += 1) {
    const row = current.candidates[i], previous = old.candidates[i], key = `${mapId}/${row.id}`;
    assert.deepEqual(row, targets.has(key) ? { ...previous, candidateKind: "enemy" } : previous);
    if (!equal(row, previous)) changes.push({ mapId, id: row.id, title: row.displayName.en, before: previous.candidateKind, after: row.candidateKind });
  }
  for (const [file, key, allowed] of [["content.json", "entities", ["kind", "tags"]], ["locations.json", "locations", ["category", "subtype", "label"]]]) {
    const name = `public/maps/${mapId}/${file}`, previous = read(path.join(before, name)), next = read(path.join(after, name));
    assert.deepEqual(omit(next, [key]), omit(previous, [key]));
    assert.deepEqual(next[key].map(({ id }) => id), previous[key].map(({ id }) => id));
    if (key === "entities") preservedAppearances += next[key].length;
    for (let i = 0; i < next[key].length; i += 1) {
      const row = next[key][i], oldRow = previous[key][i];
      if (!targets.has(`${mapId}/${row.id}`)) assert.deepEqual(row, oldRow);
      else {
        assert.deepEqual(omit(row, allowed), omit(oldRow, allowed));
        if (key === "entities") {
          assert.equal(row.kind, "enemy"); assert.deepEqual(row.tags, oldRow.tags.map((tag) => tag === "npc" ? "enemy" : tag));
        } else { assert.equal(row.category, "enemy"); assert.equal(row.subtype, "enemy"); assert.equal(row.label, "Enemy"); }
      }
    }
  }
  const rejection = `map-sources/catalog/${mapId}-placement-rejections.json`;
  assert.deepEqual(read(path.join(after, rejection)), read(path.join(before, rejection)));
}
assert.equal(changes.length, targets.size);
bytes(import.meta.filename);
const report = { kind: "native-combat-group-precedence", hashes, errors: [], before, after, changes,
  stats: { inspectedMaps: prior.maps.length, inspectedCandidates, rebuiltMaps: manifest.maps.length, preservedAppearances, correctedRoles: changes.length },
  scope: "Whole raw set scanned for the changed predicate; all affected maps actually regenerated with dependent maps. Native encounter groups, source activation/fire rules and complete unrelated fields conserved. Does not prove every combat-group member is hostile or every technical helper should be a published pin; canonical integration and remaining scene reviews are separate." };
writeGeneratedFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ stats: report.stats, changes, errors: [] }, null, 2));
